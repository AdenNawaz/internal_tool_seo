import { Worker } from "bullmq";
import { makeConnection } from "../lib/queue/connection";
import { enqueue } from "../lib/queue/index";
import { db as prisma } from "../lib/db";
import crypto from "crypto";

const OPENROUTER_API_KEY = process.env.OPENAI_API_KEY;
const SERPAPI_KEY = process.env.SERPAPI_KEY;

async function callClaude(prompt: string): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "meta-llama/llama-3.3-70b-instruct:free",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    }),
  });
  const json = await res.json() as { choices: Array<{ message: { content: string } }> };
  return json.choices?.[0]?.message?.content ?? "";
}

async function scrapeUrl(url: string): Promise<string> {
  try {
    const r = await fetch(`https://r.jina.ai/${url}`, {
      headers: { Accept: "text/plain" },
    });
    return (await r.text()).slice(0, 5000);
  } catch {
    return "";
  }
}

function hashContent(content: string): string {
  return crypto.createHash("md5").update(content).digest("hex");
}

function extractHeadings(text: string): string[] {
  return text.split("\n").filter((l) => /^#{1,4}\s/.test(l)).slice(0, 30);
}

async function monitorCompetitorPages() {
  const domain = process.env.OWN_DOMAIN;
  if (!domain) return;

  const { cachedAhrefs } = await import("../lib/ahrefs-cached");
  const result = await cachedAhrefs("site-explorer-organic-competitors", {
    target: domain,
    select: "target",
    limit: 10,
  }, 86400 * 7) as { competitors?: Array<{ target: string }> };

  const competitors = result?.competitors?.slice(0, 5) ?? [];

  for (const comp of competitors) {
    const topPages = await cachedAhrefs("site-explorer-top-pages", {
      target: comp.target,
      select: "url",
      limit: 10,
    }, 86400) as { pages?: Array<{ url: string }> };

    for (const page of topPages?.pages ?? []) {
      const content = await scrapeUrl(page.url);
      if (!content) continue;
      const hash = hashContent(content);

      const prev = await prisma.competitorSnapshot.findFirst({
        where: { url: page.url },
        orderBy: { scrapedAt: "desc" },
      });

      await prisma.competitorSnapshot.create({
        data: {
          domain: comp.target,
          url: page.url,
          contentHash: hash,
          wordCount: content.split(/\s+/).length,
          headings: extractHeadings(content),
        },
      });

      if (prev && prev.contentHash !== hash) {
        const prevWordCount = prev.wordCount ?? 0;
        const newWordCount = content.split(/\s+/).length;
        const changePct = Math.abs(newWordCount - prevWordCount) / Math.max(prevWordCount, 1);
        if (changePct > 0.2) {
          await enqueue("competitor", "analyse-competitor-change", {
            domain: comp.target,
            url: page.url,
            oldHash: prev.contentHash,
            newContent: content.slice(0, 2000),
          });
        }
      }
    }
  }
}

async function detectNewContent() {
  if (!SERPAPI_KEY) return;
  const domain = process.env.OWN_DOMAIN;
  if (!domain) return;

  const { cachedAhrefs } = await import("../lib/ahrefs-cached");
  const compResult = await cachedAhrefs("site-explorer-organic-competitors", {
    target: domain,
    select: "target",
    limit: 5,
  }, 86400 * 7) as { competitors?: Array<{ target: string }> };

  const competitors = compResult?.competitors?.slice(0, 3) ?? [];
  const today = new Date().toISOString().slice(0, 10);

  for (const comp of competitors) {
    const serpRes = await fetch(
      `https://serpapi.com/search.json?q=site:${comp.target}+after:${today}&api_key=${SERPAPI_KEY}&num=10`
    );
    const serp = await serpRes.json() as { organic_results?: Array<{ link: string; title: string }> };

    for (const result of serp?.organic_results ?? []) {
      const existing = await prisma.competitorSnapshot.findFirst({
        where: { url: result.link },
      });
      if (existing) continue;

      const content = await scrapeUrl(result.link);
      if (!content) continue;

      await prisma.competitorSnapshot.create({
        data: {
          domain: comp.target,
          url: result.link,
          contentHash: hashContent(content),
          wordCount: content.split(/\s+/).length,
          headings: extractHeadings(content),
        },
      });

      // Check if this new content overlaps with any cluster
      const reports = await prisma.researchReport.findMany({
        where: { status: "done" },
        select: { id: true, clusters: true },
      });

      for (const report of reports) {
        const clusters = report.clusters as Array<{ name: string; keywords: string[] }> | null;
        if (!clusters) continue;
        for (const cluster of clusters) {
          const overlap = cluster.keywords?.some((kw: string) =>
            content.toLowerCase().includes(kw.toLowerCase())
          );
          if (overlap) {
            await prisma.competitorAlert.create({
              data: {
                type: "new_content",
                domain: comp.target,
                url: result.link,
                clusterName: cluster.name,
                summary: result.title,
                threat: "medium",
              },
            });
          }
        }
      }
    }
  }
}

async function analyseCompetitorChange(data: {
  domain: string;
  url: string;
  oldHash: string;
  newContent: string;
}) {
  const prompt = `A competitor page changed significantly.

Domain: ${data.domain}
URL: ${data.url}

New content excerpt:
${data.newContent}

Analyse what changed and what the SEO/content threat is.
Return JSON only:
{"summary": "what changed", "threat": "high|medium|low", "clusterName": "topic area if identifiable"}`;

  const raw = await callClaude(prompt);
  let parsed: { summary?: string; threat?: string; clusterName?: string } = {};
  try { parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}"); } catch { /* ignore */ }

  await prisma.competitorAlert.create({
    data: {
      type: "content_change",
      domain: data.domain,
      url: data.url,
      clusterName: parsed.clusterName,
      summary: parsed.summary,
      threat: parsed.threat ?? "medium",
    },
  });
}

async function keywordMovementScan() {
  const domain = process.env.OWN_DOMAIN;
  if (!domain) return;

  const { cachedAhrefs } = await import("../lib/ahrefs-cached");
  const result = await cachedAhrefs("site-explorer-organic-keywords", {
    target: domain,
    select: "keyword,position,url",
    where: { position: { lte: 10 } },
    limit: 100,
  }, 86400) as { keywords?: Array<{ keyword: string; position: number; url: string }> };

  const keywords = result?.keywords ?? [];

  for (const kw of keywords) {
    const serpRes = await fetch(
      `https://serpapi.com/search.json?q=${encodeURIComponent(kw.keyword)}&api_key=${SERPAPI_KEY ?? ""}&num=10`
    );
    const serp = await serpRes.json() as { organic_results?: Array<{ link: string }> };
    const compUrls = (serp.organic_results ?? []).slice(0, 5).map((r) => r.link);

    const ownDomain = domain.replace(/^https?:\/\//, "");
    const ownPosition = compUrls.findIndex((u) => u.includes(ownDomain));

    if (ownPosition > kw.position) {
      const competitorUrl = compUrls[kw.position - 1] ?? compUrls[0] ?? "";
      const competitorDomain = new URL(competitorUrl).hostname.replace(/^www\./, "");

      await prisma.competitorAlert.create({
        data: {
          type: "keyword_entry",
          domain: competitorDomain,
          url: competitorUrl,
          summary: `Competitor entered top ${kw.position} for "${kw.keyword}", pushing us down`,
          threat: kw.position <= 5 ? "high" : "medium",
        },
      });
    }
  }
}

export const competitorWorker = new Worker(
  "competitor",
  async (job) => {
    switch (job.name) {
      case "monitor-competitor-pages": return monitorCompetitorPages();
      case "detect-new-content": return detectNewContent();
      case "analyse-competitor-change": return analyseCompetitorChange(job.data as Parameters<typeof analyseCompetitorChange>[0]);
      case "keyword-movement-scan": return keywordMovementScan();
    }
  },
  { connection: makeConnection(), concurrency: 2 }
);

competitorWorker.on("failed", (job, err) => {
  console.error(`[competitor] ${job?.name} failed:`, err.message);
});
