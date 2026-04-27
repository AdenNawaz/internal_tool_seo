import { Worker } from "bullmq";
import { makeConnection } from "../lib/queue/connection";
import { enqueue } from "../lib/queue/index";
import { db as prisma } from "../lib/db";

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
      temperature: 0.2,
    }),
  });
  const json = await res.json() as { choices: Array<{ message: { content: string } }> };
  return json.choices?.[0]?.message?.content ?? "";
}

function detectStaleYear(text: string): string | null {
  const currentYear = new Date().getFullYear();
  const match = text.match(/\b(20\d{2})\b/g);
  if (!match) return null;
  const years = match.map(Number);
  const stale = years.filter((y) => y < currentYear);
  return stale.length > 0 ? String(stale[0]) : null;
}

async function computeRefreshScore(articleId: string): Promise<{
  score: number;
  signals: { rankDrop: boolean; staleYear: boolean; leapfrogged: boolean; qualityDecay: boolean };
}> {
  const article = await prisma.article.findUnique({ where: { id: articleId } });
  if (!article) return { score: 0, signals: { rankDrop: false, staleYear: false, leapfrogged: false, qualityDecay: false } };

  let score = 0;
  const signals = { rankDrop: false, staleYear: false, leapfrogged: false, qualityDecay: false };

  // Signal 1 — ranking decay
  const rankings = await prisma.ranking.findMany({
    where: { articleId },
    orderBy: { checkedAt: "desc" },
    take: 5,
  });
  if (rankings.length >= 2) {
    const latest = rankings[0].position ?? 100;
    const prev = rankings[rankings.length - 1].position ?? 100;
    if (latest - prev > 5) { score += 40; signals.rankDrop = true; }
    else if (latest >= 6 && latest <= 20) { score += 25; signals.rankDrop = true; }
  }

  // Signal 2 — content staleness
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  if (article.updatedAt < ninetyDaysAgo) {
    const titleStale = detectStaleYear(article.title);
    if (titleStale) { score += 20; signals.staleYear = true; }
  }

  // Signal 3 — quality decay
  const qualityScores = await prisma.contentQualityScore.findMany({
    where: { articleId },
    orderBy: { scoredAt: "desc" },
    take: 2,
  });
  if (qualityScores.length >= 2 && qualityScores[1].overall - qualityScores[0].overall > 10) {
    score += 15;
    signals.qualityDecay = true;
  }

  // Signal 4 — leapfrogged (check ranking alerts)
  const leapfrog = await prisma.competitorAlert.findFirst({
    where: { type: "keyword_entry", dismissed: false },
  });
  if (leapfrog) { score += 25; signals.leapfrogged = true; }

  return { score, signals };
}

async function identifyRefreshCandidates() {
  const articles = await prisma.article.findMany({
    where: { status: "published" },
    select: { id: true },
  });

  for (const article of articles) {
    const { score } = await computeRefreshScore(article.id);
    if (score > 50) {
      await enqueue("refresh", "prepare-refresh-brief", { articleId: article.id });
    }
  }
}

async function prepareRefreshBrief(data: { articleId: string }) {
  const article = await prisma.article.findUnique({ where: { id: data.articleId } });
  if (!article?.targetKeyword) return;

  const { score: refreshScore } = await computeRefreshScore(data.articleId);

  // Fetch current rankings
  const ranking = await prisma.ranking.findFirst({
    where: { articleId: data.articleId },
    orderBy: { checkedAt: "desc" },
  });

  // Scrape top 5 competitors
  const competitors: Array<{ url: string; content: string }> = [];
  if (SERPAPI_KEY) {
    const serpRes = await fetch(
      `https://serpapi.com/search.json?q=${encodeURIComponent(article.targetKeyword)}&api_key=${SERPAPI_KEY}&num=5`
    );
    const serp = await serpRes.json() as { organic_results?: Array<{ link: string }> };
    for (const result of (serp.organic_results ?? []).slice(0, 5)) {
      try {
        const r = await fetch(`https://r.jina.ai/${result.link}`, { headers: { Accept: "text/plain" } });
        competitors.push({ url: result.link, content: (await r.text()).slice(0, 1000) });
      } catch { /* ignore */ }
    }
  }

  const { extractPlainText } = await import("../lib/text-analysis");
  const articleText = extractPlainText((article.content as unknown[]) ?? []).slice(0, 1500);

  const prompt = `This article needs refreshing. Here is everything about its current state and the competitive landscape.

OUR ARTICLE:
Title: ${article.title}
Current ranking: ${ranking?.position ?? "unknown"}
Last updated: ${article.updatedAt.toISOString().slice(0, 10)}
Content excerpt: ${articleText}

TOP 5 CURRENT COMPETITORS:
${competitors.map((c, i) => `[${i + 1}] ${c.url}\n${c.content}`).join("\n\n")}

Build a specific refresh brief.
Return JSON only:
{
  "obsoleteContent": [],
  "newSectionsToAdd": [{"heading": "string", "rationale": "string", "suggestedContent": "string"}],
  "statsToUpdate": [],
  "wordCountTarget": 0,
  "estimatedRefreshTime": "X hours",
  "priorityActions": []
}`;

  const raw = await callClaude(prompt);
  let parsed: {
    obsoleteContent?: string[];
    newSectionsToAdd?: Array<{ heading: string; rationale: string; suggestedContent: string }>;
    statsToUpdate?: string[];
    wordCountTarget?: number;
    estimatedRefreshTime?: string;
    priorityActions?: string[];
  } = {};
  try { parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}"); } catch { /* ignore */ }

  await prisma.refreshBrief.upsert({
    where: { articleId: data.articleId },
    create: {
      articleId: data.articleId,
      refreshScore,
      obsoleteContent: parsed.obsoleteContent ?? [],
      newSectionsToAdd: parsed.newSectionsToAdd ?? [],
      statsToUpdate: parsed.statsToUpdate ?? [],
      wordCountTarget: parsed.wordCountTarget,
      estimatedRefreshTime: parsed.estimatedRefreshTime,
      priorityActions: parsed.priorityActions ?? [],
    },
    update: {
      refreshScore,
      obsoleteContent: parsed.obsoleteContent ?? [],
      newSectionsToAdd: parsed.newSectionsToAdd ?? [],
      statsToUpdate: parsed.statsToUpdate ?? [],
      wordCountTarget: parsed.wordCountTarget,
      estimatedRefreshTime: parsed.estimatedRefreshTime,
      priorityActions: parsed.priorityActions ?? [],
      applied: false,
    },
  });

}

async function detectStaleness(data: { articleId: string }) {
  const article = await prisma.article.findUnique({ where: { id: data.articleId } });
  if (!article) return;

  const staleYear = detectStaleYear(article.title) ?? detectStaleYear(article.metaDescription ?? "");
  if (staleYear) {
    await enqueue("refresh", "prepare-refresh-brief", { articleId: data.articleId });
  }
}

export const refreshWorker = new Worker(
  "refresh",
  async (job) => {
    switch (job.name) {
      case "identify-refresh-candidates": return identifyRefreshCandidates();
      case "prepare-refresh-brief": return prepareRefreshBrief(job.data as { articleId: string });
      case "detect-staleness": return detectStaleness(job.data as { articleId: string });
    }
  },
  { connection: makeConnection(), concurrency: 2 }
);

refreshWorker.on("failed", (job, err) => {
  console.error(`[refresh] ${job?.name} failed:`, err.message);
});
