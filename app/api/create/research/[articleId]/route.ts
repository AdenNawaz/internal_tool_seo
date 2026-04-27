export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cachedAhrefs } from "@/lib/ahrefs-cached";
import { parseMcpRows } from "@/lib/ahrefs-utils";
import { collectEvidence } from "@/lib/evidence-collector";
import { queryAIPlatforms } from "@/lib/ai-visibility";


async function serpResults(query: string): Promise<Array<{ url: string; title: string }>> {
  const key = process.env.SERPAPI_KEY;
  if (!key) return [];
  try {
    const params = new URLSearchParams({ q: query, api_key: key, num: "10", engine: "google" });
    const res = await fetch(`https://serpapi.com/search?${params}`, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return [];
    const data = await res.json() as {
      organic_results?: Array<{ link: string; title: string }>;
      related_questions?: Array<{ question: string; source?: { link?: string } }>;
    };
    return (data.organic_results ?? []).map((r) => ({ url: r.link, title: r.title }));
  } catch { return []; }
}

async function serpPAA(query: string): Promise<string[]> {
  const key = process.env.SERPAPI_KEY;
  if (!key) return [];
  try {
    const params = new URLSearchParams({ q: query, api_key: key, engine: "google" });
    const res = await fetch(`https://serpapi.com/search?${params}`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const data = await res.json() as { related_questions?: Array<{ question: string }> };
    return (data.related_questions ?? []).map((q) => q.question);
  } catch { return []; }
}

async function serpRedditQuestions(query: string): Promise<Array<{ question: string; source: string }>> {
  const key = process.env.SERPAPI_KEY;
  if (!key) return [];
  try {
    const params = new URLSearchParams({ q: `site:reddit.com ${query}`, api_key: key, num: "5", engine: "google" });
    const res = await fetch(`https://serpapi.com/search?${params}`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const data = await res.json() as { organic_results?: Array<{ title: string; link: string }> };
    return (data.organic_results ?? [])
      .filter((r) => r.title.includes("?") || r.title.toLowerCase().startsWith("how") || r.title.toLowerCase().startsWith("why") || r.title.toLowerCase().startsWith("what"))
      .map((r) => ({ question: r.title, source: "reddit.com" }));
  } catch { return []; }
}

async function jinaFetch(url: string, chars = 3000): Promise<string> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, { headers: { Accept: "text/plain" }, signal: AbortSignal.timeout(12000) });
    if (!res.ok) return "";
    return (await res.text()).slice(0, chars);
  } catch { return ""; }
}

function extractHeaders(html: string, sourceUrl: string): Array<{ level: number; text: string; source: string }> {
  const matches = Array.from(html.matchAll(/#{1,3} (.+)/g));
  const domain = (() => { try { return new URL(sourceUrl).hostname.replace(/^www\./, ""); } catch { return sourceUrl; } })();
  return matches
    .map((m) => ({ level: m[0].startsWith("### ") ? 3 : 2, text: m[1].trim(), source: domain }))
    .filter((h) => h.text.length > 3 && h.text.length < 120);
}

function generateOpportunities(
  keywords: Array<{ keyword: string; volume: number }>,
  headers: Array<{ text: string; source: string }>,
  paaQuestions: string[]
): Array<{ type: string; priority: string; title: string; description: string }> {
  const opps = [];

  // Find headers that appear in only 1 source (underserved)
  const headerCounts = new Map<string, number>();
  headers.forEach((h) => {
    const key = h.text.toLowerCase().slice(0, 30);
    headerCounts.set(key, (headerCounts.get(key) ?? 0) + 1);
  });

  const uniqueHeaders = Array.from(headerCounts.entries()).filter(([, c]) => c === 1);
  if (uniqueHeaders.length > 0) {
    opps.push({
      type: "UNCOVERED_TOPIC",
      priority: "HIGH",
      title: `${uniqueHeaders.length} topics competitors don't all cover`,
      description: `These sections appear in only one competitor article — covering them well gives you a depth advantage.`,
    });
  }

  if (paaQuestions.length > 0) {
    opps.push({
      type: "UNDERSERVED_AUDIENCE",
      priority: "HIGH",
      title: `${paaQuestions.length} audience questions with unclear answers`,
      description: "These PAA questions indicate real searcher confusion. Answering them directly creates featured snippet opportunities.",
    });
  }

  const highVolLowCoverage = keywords.filter((k) => k.volume > 1000).slice(0, 3);
  if (highVolLowCoverage.length > 0) {
    opps.push({
      type: "FEATURED_SNIPPET_GAP",
      priority: "MEDIUM",
      title: `${highVolLowCoverage.length} high-volume keywords without strong snippets`,
      description: `Keywords like "${highVolLowCoverage[0]?.keyword}" have significant search volume but weak featured snippets — direct answers can win the position.`,
    });
  }

  return opps;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { articleId: string } }
) {
  const { articleId } = params;

  const article = await db.article.findUnique({ where: { id: articleId } });
  if (!article) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const topic = article.targetKeyword ?? article.title ?? "content marketing";
  const country = (article.country as string | null) ?? "us";
  const preferredSources = (article.preferredSources as string[] | null) ?? [];
  const excludedSources = (article.excludedSources as string[] | null) ?? [];

  // Upsert research session
  await db.researchSession.upsert({
    where: { articleId },
    create: { articleId, status: "running" },
    update: { status: "running" },
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function emit(event: unknown) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }

      try {
        // ── Step 1: Keywords ──────────────────────────────────────────
        emit({ type: "status", step: "keywords", message: "Fetching keyword data…" });

        let keywords: Array<{ keyword: string; volume: number; difficulty: number; coverage: number }> = [];
        try {
          const [overviewRaw, matchingRaw] = await Promise.all([
            cachedAhrefs("keywords-explorer-overview", { keyword: topic, country }),
            cachedAhrefs("keywords-explorer-matching-terms", { keyword: topic, country, limit: 20 }),
          ]);
          const overviewRows = parseMcpRows(overviewRaw);
          const matchingRows = parseMcpRows(matchingRaw);
          const allRows = [...overviewRows, ...matchingRows];
          keywords = allRows
            .filter((r) => r.keyword && r.volume != null)
            .slice(0, 25)
            .map((r) => ({
              keyword: String(r.keyword),
              volume: Number(r.volume ?? 0),
              difficulty: Number(r.keyword_difficulty ?? r.kd ?? 0),
              coverage: 0,
            }));
        } catch { /* Ahrefs may not be configured */ }

        // ── Step 2: SERP + competitor headers ────────────────────────
        emit({ type: "status", step: "headers", message: "Analysing SERP and competitor pages…" });

        const serpRes = await serpResults(topic);
        const topUrls = serpRes.slice(0, 5).map((r) => r.url);

        const scraped = await Promise.all(topUrls.map(async (url) => ({ url, content: await jinaFetch(url) })));
        const allHeaders = scraped.flatMap((s) => extractHeaders(s.content, s.url));

        // Calculate coverage for keywords
        keywords = keywords.map((kw) => ({
          ...kw,
          coverage: Math.round(scraped.filter((s) => s.content.toLowerCase().includes(kw.keyword.toLowerCase())).length / Math.max(scraped.length, 1) * 100),
        }));

        // Save keywords + headers to session
        await db.researchSession.update({
          where: { articleId },
          data: { keywords: keywords as never, serpHeaders: allHeaders as never },
        });

        emit({ type: "keywords", data: keywords });
        emit({ type: "headers", data: allHeaders });

        // ── Step 3: Audience questions ───────────────────────────────
        emit({ type: "status", step: "questions", message: "Finding audience questions…" });

        const [paaQuestions, redditQuestions] = await Promise.all([
          serpPAA(topic),
          serpRedditQuestions(topic),
        ]);

        const audienceQs = [
          ...paaQuestions.map((q) => ({ question: q, source: "serp" as const })),
          ...redditQuestions,
        ].slice(0, 20);

        await db.researchSession.update({ where: { articleId }, data: { audienceQs: audienceQs as never } });
        emit({ type: "questions", data: audienceQs });

        // ── Step 4: AI Platform visibility ───────────────────────────
        emit({ type: "status", step: "ai", message: "Querying AI platforms…" });

        let aiAnalysis = null;
        try {
          const ownDomain = process.env.OWN_DOMAIN ?? "";
          const competitorDomains = topUrls.map((u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } }).filter(Boolean);
          aiAnalysis = await queryAIPlatforms({ query: topic, companyDomain: ownDomain, competitorDomains });
          await db.researchSession.update({ where: { articleId }, data: { aiAnalysis: aiAnalysis as never } });
        } catch { /* AI visibility is optional */ }

        emit({ type: "ai_analysis", data: aiAnalysis });

        // ── Step 5: Opportunities ────────────────────────────────────
        emit({ type: "status", step: "opportunities", message: "Identifying opportunities…" });

        const opportunities = generateOpportunities(keywords, allHeaders, paaQuestions);
        await db.researchSession.update({ where: { articleId }, data: { opportunities: opportunities as never } });
        emit({ type: "opportunities", data: opportunities });

        // ── Step 6: Evidence ─────────────────────────────────────────
        emit({ type: "status", step: "evidence", message: "Gathering evidence and statistics…" });

        let evidence: unknown[] = [];
        try {
          evidence = await collectEvidence({ topic, year: new Date().getFullYear(), preferredSources, excludedSources });
          await db.researchSession.update({ where: { articleId }, data: { evidence: evidence as never, status: "complete" } });
        } catch {
          await db.researchSession.update({ where: { articleId }, data: { status: "complete" } });
        }

        emit({ type: "evidence", data: evidence });
        emit({ type: "done" });
      } catch (err) {
        emit({ type: "error", message: String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

// Pin management
export async function POST(
  req: NextRequest,
  { params }: { params: { articleId: string } }
) {
  const { articleId } = params;
  const body = await req.json() as { action: "pin" | "unpin"; type: string; content: string; metadata?: unknown; pinId?: string };

  if (body.action === "pin") {
    const pin = await db.pinnedItem.create({
      data: { articleId, type: body.type, content: body.content, metadata: body.metadata as never ?? undefined },
    });
    return NextResponse.json({ id: pin.id });
  }

  if (body.action === "unpin" && body.pinId) {
    await db.pinnedItem.delete({ where: { id: body.pinId } }).catch(() => null);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

export async function DELETE(
  req: NextRequest
) {
  const { pinId } = await req.json() as { pinId: string };
  await db.pinnedItem.delete({ where: { id: pinId } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
