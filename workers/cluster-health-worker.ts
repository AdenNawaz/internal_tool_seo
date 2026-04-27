import { Worker } from "bullmq";
import { makeConnection } from "../lib/queue/connection";
import { enqueue } from "../lib/queue/index";
import { db as prisma } from "../lib/db";

const OPENROUTER_API_KEY = process.env.OPENAI_API_KEY;

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

async function computeClusterHealth(data: { reportId: string }) {
  const report = await prisma.researchReport.findUnique({ where: { id: data.reportId } });
  if (!report?.clusters) return;

  const clusters = report.clusters as Array<{ name: string; keywords: string[] }>;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  for (const cluster of clusters) {
    // Coverage: articles covering cluster keywords
    const clusterArticles = await prisma.article.findMany({
      where: {
        OR: [
          { clusterName: cluster.name },
          { targetKeyword: { in: cluster.keywords } },
        ],
      },
    });

    const totalKeywords = cluster.keywords.length || 1;
    const coveredKeywords = clusterArticles.filter((a) =>
      cluster.keywords.includes(a.targetKeyword ?? "")
    ).length;
    const coverageScore = Math.min(100, Math.round((coveredKeywords / totalKeywords) * 100));

    // Ranking: avg position of published cluster articles
    const rankings = await prisma.ranking.findMany({
      where: {
        articleId: { in: clusterArticles.map((a) => a.id) },
      },
      orderBy: { checkedAt: "desc" },
      take: clusterArticles.length * 2,
    });
    const positions: number[] = rankings.map((r) => r.position ?? 100).filter(Boolean) as number[];
    const avgPos = positions.length ? positions.reduce((a: number, b: number) => a + b, 0) / positions.length : 100;
    const rankingScore = Math.max(0, Math.min(100, Math.round(100 - avgPos * 2)));

    // Velocity: articles written in last 30 days
    const recentArticles = clusterArticles.filter(
      (a) => a.createdAt >= thirtyDaysAgo
    ).length;
    const velocityScore = Math.min(100, recentArticles * 33);

    // Competitor pressure (rough: alerts for this cluster)
    const compAlerts = await prisma.competitorAlert.count({
      where: { clusterName: cluster.name, dismissed: false },
    });
    const competitorScore = Math.max(0, 100 - compAlerts * 20);

    // AI visibility score (rough: visibility snapshots for cluster keywords)
    const visSnaps = await prisma.visibilitySnapshot.findMany({
      where: {
        prompt: { in: cluster.keywords },
        checkedAt: { gte: thirtyDaysAgo },
      },
    });
    const visibleCount = visSnaps.filter((s) => s.companyVisible).length;
    const aiScore = visSnaps.length
      ? Math.round((visibleCount / visSnaps.length) * 100)
      : 50;

    const overall = Math.round(
      coverageScore * 0.25 +
      rankingScore * 0.3 +
      velocityScore * 0.2 +
      competitorScore * 0.15 +
      aiScore * 0.1
    );

    const prev = await prisma.clusterHealthScore.findFirst({
      where: { reportId: data.reportId, clusterName: cluster.name },
      orderBy: { scoredAt: "desc" },
    });

    await prisma.clusterHealthScore.create({
      data: {
        reportId: data.reportId,
        clusterName: cluster.name,
        coverageScore,
        rankingScore,
        velocityScore,
        competitorScore,
        aiScore,
        overall,
      },
    });

    if (prev && (overall < 60 || prev.overall - overall > 10)) {
      await enqueue("clusterHealth", "detect-cluster-decay", {
        reportId: data.reportId,
        clusterName: cluster.name,
        oldOverall: prev.overall,
        newOverall: overall,
        scores: { coverageScore, rankingScore, velocityScore, competitorScore, aiScore },
        prevScores: {
          coverageScore: prev.coverageScore,
          rankingScore: prev.rankingScore,
          velocityScore: prev.velocityScore,
          competitorScore: prev.competitorScore,
          aiScore: prev.aiScore,
        },
      });
    }
  }
}

async function detectClusterDecay(data: {
  reportId: string;
  clusterName: string;
  oldOverall: number;
  newOverall: number;
  scores: Record<string, number>;
  prevScores: Record<string, number>;
}) {
  const scoreLabels: Record<string, string> = {
    coverageScore: "coverage",
    rankingScore: "ranking",
    velocityScore: "velocity",
    competitorScore: "competitor pressure",
    aiScore: "AI visibility",
  };

  const biggestDrop = Object.keys(data.scores).reduce((worst, key) => {
    const drop = (data.prevScores[key] ?? 0) - (data.scores[key] ?? 0);
    return drop > (worst.drop ?? 0) ? { key, drop } : worst;
  }, { key: "", drop: 0 });

  const prompt = `Cluster "${data.clusterName}" health dropped from ${data.oldOverall} to ${data.newOverall}.
Biggest drop in: ${scoreLabels[biggestDrop.key] ?? biggestDrop.key} (${biggestDrop.drop} points).
Current scores: ${JSON.stringify(data.scores)}

What specific action should the content team take?
Return JSON only: {"dropReason": "string", "recommendation": "specific action"}`;

  const raw = await callClaude(prompt);
  let parsed: { dropReason?: string; recommendation?: string } = {};
  try { parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}"); } catch { /* ignore */ }

  await prisma.clusterHealthAlert.create({
    data: {
      reportId: data.reportId,
      clusterName: data.clusterName,
      dropReason: parsed.dropReason,
      recommendation: parsed.recommendation,
    },
  });
}

async function recommendNextArticle(data: { reportId?: string }) {
  const scores = await prisma.clusterHealthScore.findMany({
    where: data.reportId ? { reportId: data.reportId } : {},
    orderBy: { scoredAt: "desc" },
    take: 50,
  });

  const articles = await prisma.article.findMany({
    select: { id: true, title: true, status: true, targetKeyword: true, clusterName: true },
    take: 100,
    orderBy: { createdAt: "desc" },
  });

  const trendAlerts = await prisma.trendingAlert.findMany({
    where: { dismissed: false },
    take: 20,
    orderBy: { checkedAt: "desc" },
  });

  const compAlerts = await prisma.competitorAlert.findMany({
    where: { dismissed: false },
    take: 20,
    orderBy: { detectedAt: "desc" },
  });

  const rankAlerts = await prisma.rankingAlert.findMany({
    where: { type: "opportunity", dismissed: false },
    take: 20,
    orderBy: { createdAt: "desc" },
  });

  const prompt = `Given the current state of all content clusters, recommend the single most valuable article to write next.

CLUSTER HEALTH:
${JSON.stringify(scores.slice(0, 20), null, 2)}

CURRENT ARTICLES:
${JSON.stringify(articles.slice(0, 20), null, 2)}

TRENDING KEYWORDS:
${JSON.stringify(trendAlerts.slice(0, 10), null, 2)}

COMPETITOR THREATS:
${JSON.stringify(compAlerts.slice(0, 10), null, 2)}

RANKING OPPORTUNITIES:
${JSON.stringify(rankAlerts.slice(0, 10), null, 2)}

Return JSON only:
{
  "action": "new_article|refresh|gap_fill|trend_capture",
  "target": "what specifically to write or improve",
  "reasoning": "why this is highest priority",
  "expectedImpact": "what metric this will move",
  "urgency": "immediate|this_week|this_month",
  "estimatedEffort": "hours to complete"
}`;

  const raw = await callClaude(prompt);
  let parsed: {
    action?: string;
    target?: string;
    reasoning?: string;
    expectedImpact?: string;
    urgency?: string;
    estimatedEffort?: string;
  } = {};
  try { parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}"); } catch { /* ignore */ }

  await prisma.nextArticleRecommendation.create({
    data: {
      reportId: data.reportId,
      action: parsed.action ?? "new_article",
      target: parsed.target ?? "Unknown",
      reasoning: parsed.reasoning ?? "",
      expectedImpact: parsed.expectedImpact,
      urgency: parsed.urgency ?? "this_week",
      estimatedEffort: parsed.estimatedEffort,
    },
  });
}

async function generateClusterBrief(data: { clusterName: string; reportId: string }) {
  const report = await prisma.researchReport.findUnique({ where: { id: data.reportId } });
  if (!report) return;

  const clusters = report.clusters as Array<{ name: string; keywords: string[]; primaryKeyword?: string }> | null;
  const cluster = clusters?.find((c) => c.name === data.clusterName);
  if (!cluster) return;

  const primaryKeyword = cluster.primaryKeyword ?? cluster.keywords?.[0] ?? data.clusterName;

  // Create or find the article
  const article = await prisma.article.create({
    data: {
      title: `${primaryKeyword} — draft`,
      targetKeyword: primaryKeyword,
      clusterName: data.clusterName,
      clusterId: data.reportId,
      status: "draft",
    },
  });

  // Enqueue full research pipeline
  await enqueue("research", "run-research", {
    articleId: article.id,
    keyword: primaryKeyword,
  });

  console.log(`[cluster-health] Generated article ${article.id} for cluster "${data.clusterName}"`);
}

export const clusterHealthWorker = new Worker(
  "cluster-health",
  async (job) => {
    switch (job.name) {
      case "compute-cluster-health": return computeClusterHealth(job.data as { reportId: string });
      case "detect-cluster-decay": return detectClusterDecay(job.data as Parameters<typeof detectClusterDecay>[0]);
      case "recommend-next-article": return recommendNextArticle(job.data as { reportId?: string });
      case "generate-cluster-brief": return generateClusterBrief(job.data as { clusterName: string; reportId: string });
    }
  },
  { connection: makeConnection(), concurrency: 2 }
);

clusterHealthWorker.on("failed", (job, err) => {
  console.error(`[cluster-health] ${job?.name} failed:`, err.message);
});
