import { Worker } from "bullmq";
import { makeConnection } from "../lib/queue/connection";
import { enqueue } from "../lib/queue/index";
import { db as prisma } from "../lib/db";
import { extractPlainText } from "../lib/text-analysis";
import { computeDiagnostic } from "../lib/content-diagnostic";

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

async function scoreArticle(data: { articleId: string }) {
  const article = await prisma.article.findUnique({ where: { id: data.articleId } });
  if (!article) return;

  const plainText = extractPlainText((article.content as unknown[]) ?? []);
  const wordCount = plainText.split(/\s+/).filter(Boolean).length;

  const scores = computeDiagnostic({
    title: article.title,
    metaDescription: article.metaDescription ?? null,
    targetKeyword: article.targetKeyword ?? null,
    content: article.content,
    plainText,
    readabilityScore: 0,
    authorName: null,
    authorBio: null,
    publishedDate: article.createdAt.toISOString(),
  });

  const prev = await prisma.contentQualityScore.findFirst({
    where: { articleId: data.articleId },
    orderBy: { scoredAt: "desc" },
  });

  await prisma.contentQualityScore.create({
    data: {
      articleId: data.articleId,
      eeat: scores.eeat.score,
      geo: scores.geo.score,
      seo: scores.seo.score,
      overall: scores.combined,
      breakdown: JSON.parse(JSON.stringify({ eeat: scores.eeat, geo: scores.geo, seo: scores.seo })),
    },
  });

  if (prev && prev.overall - scores.combined > 5) {
    await enqueue("contentQuality", "detect-quality-decay", { articleId: data.articleId });
  }
}

async function scoreAllPublished() {
  const articles = await prisma.article.findMany({
    where: { status: "published" },
    select: { id: true },
  });

  for (let i = 0; i < articles.length; i++) {
    await enqueue("contentQuality", "score-article", { articleId: articles[i].id }, {
      delay: i * 5000,
    });
  }
}

async function detectQualityDecay(data: { articleId: string }) {
  const article = await prisma.article.findUnique({ where: { id: data.articleId } });
  if (!article?.targetKeyword) return;

  const scores = await prisma.contentQualityScore.findMany({
    where: { articleId: data.articleId },
    orderBy: { scoredAt: "desc" },
    take: 2,
  });

  if (scores.length < 2) return;
  const [newScore, oldScore] = scores;

  // Scrape current top competitor
  let compContent = "";
  let compEeat = 0, compGeo = 0, compSeo = 0;

  if (SERPAPI_KEY) {
    const serpRes = await fetch(
      `https://serpapi.com/search.json?q=${encodeURIComponent(article.targetKeyword)}&api_key=${SERPAPI_KEY}&num=1`
    );
    const serp = await serpRes.json() as { organic_results?: Array<{ link: string }> };
    const topUrl = serp.organic_results?.[0]?.link;
    if (topUrl) {
      try {
        const r = await fetch(`https://r.jina.ai/${topUrl}`, { headers: { Accept: "text/plain" } });
        compContent = (await r.text()).slice(0, 3000);
        const compDiag = computeDiagnostic({
          title: "",
          metaDescription: null,
          targetKeyword: article.targetKeyword,
          content: null,
          plainText: compContent,
          readabilityScore: 0,
          authorName: null,
          authorBio: null,
          publishedDate: null,
        });
        compEeat = compDiag.eeat.score;
        compGeo = compDiag.geo.score;
        compSeo = compDiag.seo.score;
      } catch { /* ignore */ }
    }
  }

  const breakdown = newScore.breakdown as { eeat?: { score: number }; geo?: { score: number }; seo?: { score: number } };
  const prompt = `This article's quality score dropped from ${oldScore.overall} to ${newScore.overall}.

OUR ARTICLE SCORES:
EEAT: ${breakdown?.eeat?.score ?? newScore.eeat} | GEO: ${breakdown?.geo?.score ?? newScore.geo} | SEO: ${breakdown?.seo?.score ?? newScore.seo}

TOP COMPETITOR SCORES (approximate):
EEAT: ${compEeat} | GEO: ${compGeo} | SEO: ${compSeo}

Diagnose which specific signals the competitor has that we lack.
Return JSON only:
{"decayReason": "string", "competitorAdvantages": ["string"], "topFix": "string", "estimatedScoreGain": 0}`;

  const raw = await callClaude(prompt);
  let parsed: {
    decayReason?: string;
    competitorAdvantages?: string[];
    topFix?: string;
    estimatedScoreGain?: number;
  } = {};
  try { parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}"); } catch { /* ignore */ }

  await prisma.qualityDecayAlert.create({
    data: {
      articleId: data.articleId,
      oldScore: oldScore.overall,
      newScore: newScore.overall,
      decayReason: parsed.decayReason,
      competitorAdvantages: parsed.competitorAdvantages ?? [],
      topFix: parsed.topFix,
      estimatedScoreGain: parsed.estimatedScoreGain,
    },
  });

  if (parsed.topFix) {
    await enqueue("contentQuality", "generate-improvement-brief", {
      articleId: data.articleId,
      topFix: parsed.topFix,
      competitorAdvantages: parsed.competitorAdvantages ?? [],
    });
  }
}

async function generateImprovementBrief(data: {
  articleId: string;
  topFix: string;
  competitorAdvantages: string[];
}) {
  const article = await prisma.article.findUnique({ where: { id: data.articleId } });
  if (!article) return;

  const plainText = extractPlainText((article.content as unknown[]) ?? []).slice(0, 2000);

  const prompt = `Create a specific improvement brief for this article.

ARTICLE: ${article.title}
TARGET KEYWORD: ${article.targetKeyword ?? "unknown"}
TOP FIX NEEDED: ${data.topFix}
COMPETITOR ADVANTAGES: ${data.competitorAdvantages.join(", ")}
CURRENT CONTENT EXCERPT: ${plainText}

Generate:
1. Specific sections to add or expand (with suggested content)
2. Statistics or facts to add with suggested phrasing
3. Structural changes to improve GEO/EEAT
4. Estimated word count to add

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

  await prisma.improvementBrief.deleteMany({ where: { articleId: data.articleId } });
  await prisma.improvementBrief.create({
    data: {
      articleId: data.articleId,
      obsoleteContent: parsed.obsoleteContent ?? [],
      newSectionsToAdd: parsed.newSectionsToAdd ?? [],
      statsToUpdate: parsed.statsToUpdate ?? [],
      wordCountTarget: parsed.wordCountTarget,
      estimatedRefreshTime: parsed.estimatedRefreshTime,
      priorityActions: parsed.priorityActions ?? [],
    },
  });
}

export const contentQualityWorker = new Worker(
  "content-quality",
  async (job) => {
    switch (job.name) {
      case "score-article": return scoreArticle(job.data as { articleId: string });
      case "score-all-published": return scoreAllPublished();
      case "detect-quality-decay": return detectQualityDecay(job.data as { articleId: string });
      case "generate-improvement-brief": return generateImprovementBrief(job.data as Parameters<typeof generateImprovementBrief>[0]);
    }
  },
  { connection: makeConnection(), concurrency: 2 }
);

contentQualityWorker.on("failed", (job, err) => {
  console.error(`[content-quality] ${job?.name} failed:`, err.message);
});
