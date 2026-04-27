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
      temperature: 0.3,
    }),
  });
  const json = await res.json() as { choices: Array<{ message: { content: string } }> };
  return json.choices?.[0]?.message?.content ?? "";
}

async function checkSingleArticle(data: { articleId: string }) {
  const article = await prisma.article.findUnique({ where: { id: data.articleId } });
  if (!article?.targetKeyword || !article.publishedUrl) return;

  const keyword = article.targetKeyword;
  const domain = process.env.OWN_DOMAIN ?? "";

  // Fetch Ahrefs ranking via cached helper
  const { cachedAhrefs } = await import("../lib/ahrefs-cached");
  const result = await cachedAhrefs("site-explorer-organic-keywords", {
    target: domain,
    select: "keyword,position,url,volume",
    where: { keyword: { like: keyword } },
    limit: 1,
  }, 86400);

  const rows = (result as { keywords?: Array<{ keyword: string; position: number; url: string; volume: number }> })?.keywords ?? [];
  const current = rows[0];
  if (!current) return;

  // Fetch previous ranking
  const prev = await prisma.ranking.findFirst({
    where: { articleId: data.articleId, keyword },
    orderBy: { checkedAt: "desc" },
  });

  // Store new ranking
  await prisma.ranking.create({
    data: {
      articleId: data.articleId,
      keyword,
      position: current.position,
      url: current.url,
      volume: current.volume,
      checkedAt: new Date(),
    },
  });

  if (!prev?.position) return;
  const delta = current.position - prev.position;

  if (delta > 5) {
    await enqueue("ranking", "diagnose-drop", {
      articleId: data.articleId,
      keyword,
      oldPosition: prev.position,
      newPosition: current.position,
    });
  } else if (current.position >= 6 && current.position <= 20) {
    await enqueue("ranking", "diagnose-opportunity", {
      articleId: data.articleId,
      keyword,
      position: current.position,
    });
  }
}

async function weeklySweep() {
  const articles = await prisma.article.findMany({
    where: { status: "published", targetKeyword: { not: null } },
    select: { id: true },
  });

  for (let i = 0; i < articles.length; i++) {
    await enqueue("ranking", "check-single-article", { articleId: articles[i].id }, {
      delay: i * 2000,
    });
  }
}

async function diagnoseDrop(data: {
  articleId: string;
  keyword: string;
  oldPosition: number;
  newPosition: number;
}) {
  if (!SERPAPI_KEY) return;

  // Fetch top competitor
  const serpRes = await fetch(
    `https://serpapi.com/search.json?q=${encodeURIComponent(data.keyword)}&api_key=${SERPAPI_KEY}&num=5`
  );
  const serp = await serpRes.json() as { organic_results?: Array<{ link: string; title: string }> };
  const topUrl = serp.organic_results?.[0]?.link ?? "";

  let competitorContent = "";
  if (topUrl) {
    try {
      const jinaRes = await fetch(`https://r.jina.ai/${topUrl}`, {
        headers: { Accept: "text/plain" },
      });
      competitorContent = (await jinaRes.text()).slice(0, 3000);
    } catch { /* ignore */ }
  }

  const prompt = `An article dropped from position ${data.oldPosition} to ${data.newPosition} for keyword "${data.keyword}".

Top competitor URL: ${topUrl}
Top competitor content excerpt:
${competitorContent}

Diagnose the likely reason for the drop and suggest the highest-impact fix.
Return JSON only:
{"diagnosis": "reason", "primaryFix": "specific action", "urgency": "high|medium|low"}`;

  const raw = await callClaude(prompt);
  let parsed: { diagnosis?: string; primaryFix?: string; urgency?: string } = {};
  try { parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}"); } catch { /* ignore */ }

  await prisma.rankingAlert.create({
    data: {
      articleId: data.articleId,
      type: "drop",
      keyword: data.keyword,
      oldPosition: data.oldPosition,
      newPosition: data.newPosition,
      diagnosis: parsed.diagnosis,
      primaryFix: parsed.primaryFix,
      urgency: parsed.urgency ?? "medium",
    },
  });
}

async function diagnoseOpportunity(data: {
  articleId: string;
  keyword: string;
  position: number;
}) {
  if (!SERPAPI_KEY) return;

  const serpRes = await fetch(
    `https://serpapi.com/search.json?q=${encodeURIComponent(data.keyword)}&api_key=${SERPAPI_KEY}&num=5`
  );
  const serp = await serpRes.json() as { organic_results?: Array<{ link: string }> };
  const urls = (serp.organic_results ?? []).slice(0, 5).map((r) => r.link);

  const snippets: string[] = [];
  for (const url of urls) {
    try {
      const r = await fetch(`https://r.jina.ai/${url}`, { headers: { Accept: "text/plain" } });
      snippets.push((await r.text()).slice(0, 1000));
    } catch { /* ignore */ }
  }

  const prompt = `Our article ranks at position ${data.position} for "${data.keyword}" — within reach of page 1.

Top 5 competitor content snippets:
${snippets.map((s, i) => `[${i + 1}] ${s}`).join("\n\n")}

What gaps does our article likely have vs the top 5? What single addition would most likely push us into top 5?
Return JSON only:
{"diagnosis": "gap analysis", "primaryFix": "specific improvement", "urgency": "high|medium|low"}`;

  const raw = await callClaude(prompt);
  let parsed: { diagnosis?: string; primaryFix?: string; urgency?: string } = {};
  try { parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}"); } catch { /* ignore */ }

  await prisma.rankingAlert.create({
    data: {
      articleId: data.articleId,
      type: "opportunity",
      keyword: data.keyword,
      newPosition: data.position,
      diagnosis: parsed.diagnosis,
      primaryFix: parsed.primaryFix,
      urgency: parsed.urgency ?? "medium",
    },
  });
}

export const rankingWorker = new Worker(
  "ranking",
  async (job) => {
    switch (job.name) {
      case "check-single-article": return checkSingleArticle(job.data as { articleId: string });
      case "weekly-sweep": return weeklySweep();
      case "diagnose-drop": return diagnoseDrop(job.data as Parameters<typeof diagnoseDrop>[0]);
      case "diagnose-opportunity": return diagnoseOpportunity(job.data as Parameters<typeof diagnoseOpportunity>[0]);
    }
  },
  { connection: makeConnection(), concurrency: 3 }
);

rankingWorker.on("failed", (job, err) => {
  console.error(`[ranking] ${job?.name} failed:`, err.message);
});
