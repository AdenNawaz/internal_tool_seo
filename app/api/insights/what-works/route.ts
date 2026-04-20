export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export interface ClusterPerformance {
  clusterName: string;
  avgPosition: number;
  articleCount: number;
}

export interface WordCountInsight {
  optimalMin: number;
  optimalMax: number;
  basis: string;
}

export interface TopArticle {
  id: string;
  title: string;
  position: number;
  wordCount: number;
  targetKeyword: string;
}

export interface InsightsResult {
  insufficient_data?: true;
  bestPerformingClusters: ClusterPerformance[];
  wordCountInsight: WordCountInsight | null;
  topPerformingArticles: TopArticle[];
  weakClusters: Array<{ clusterName: string; avgPosition: number; note: string }>;
}

export async function GET() {
  // Fetch published articles with ranking data
  const articles = await db.article.findMany({
    where: { status: { in: ["published", "ready"] } },
    select: { id: true, title: true, targetKeyword: true, clusterName: true },
  });

  const rankings = await db.ranking.findMany({
    where: {
      articleId: { in: articles.map(a => a.id) },
      position: { not: null },
    },
    orderBy: { checkedAt: "desc" },
  });

  // Group latest ranking per article
  const latestByArticle = new Map<string, number>();
  for (const r of rankings) {
    if (!latestByArticle.has(r.articleId) && r.position !== null) {
      latestByArticle.set(r.articleId, r.position);
    }
  }

  const articlesWithRankings = articles.filter(a => latestByArticle.has(a.id));

  if (articlesWithRankings.length < 5) {
    return NextResponse.json({ insufficient_data: true });
  }

  // ── Best/worst performing clusters
  const clusterMap = new Map<string, number[]>();
  for (const a of articlesWithRankings) {
    const cluster = a.clusterName ?? a.targetKeyword ?? "unclustered";
    const pos = latestByArticle.get(a.id)!;
    if (!clusterMap.has(cluster)) clusterMap.set(cluster, []);
    clusterMap.get(cluster)!.push(pos);
  }

  const clusterStats = Array.from(clusterMap.entries()).map(([name, positions]) => ({
    clusterName: name,
    avgPosition: Math.round(positions.reduce((s, p) => s + p, 0) / positions.length),
    articleCount: positions.length,
  }));

  const bestPerformingClusters = clusterStats
    .filter(c => c.avgPosition <= 20)
    .sort((a, b) => a.avgPosition - b.avgPosition)
    .slice(0, 5);

  const weakClusters = clusterStats
    .filter(c => c.avgPosition > 20)
    .sort((a, b) => b.avgPosition - a.avgPosition)
    .slice(0, 3)
    .map(c => ({
      ...c,
      note: `Averaging position ${c.avgPosition} — consider refreshing or boosting with internal links`,
    }));

  // ── Word count insight: articles ranking in top 10
  const top10Articles = articlesWithRankings.filter(a => (latestByArticle.get(a.id) ?? 99) <= 10);
  const rankingsWithWordCount: Array<{ position: number; wordCount: number; id: string; title: string; keyword: string }> = [];

  for (const r of rankings) {
    if (r.position === null || r.position > 20) continue;
    const article = articles.find(a => a.id === r.articleId);
    if (!article) continue;
    // Estimate word count from volume proxy — we don't store it directly
    // Use a placeholder since we don't have content word count in rankings table
    // We'll just use top10Articles list
    rankingsWithWordCount.push({
      position: r.position,
      wordCount: 0, // placeholder
      id: r.articleId,
      title: article.title,
      keyword: article.targetKeyword ?? "",
    });
  }

  // Word count insight: use competitor avg words from article briefs as proxy
  const briefs = await db.articleBrief.findMany({
    where: { articleId: { in: top10Articles.map(a => a.id) } },
    select: { articleId: true, competitorAvgWords: true },
  });

  const wordCounts = briefs.map(b => b.competitorAvgWords).filter(w => w > 0);
  let wordCountInsight: WordCountInsight | null = null;
  if (wordCounts.length >= 3) {
    const sorted = [...wordCounts].sort((a, b) => a - b);
    const p25 = sorted[Math.floor(sorted.length * 0.25)];
    const p75 = sorted[Math.floor(sorted.length * 0.75)];
    wordCountInsight = {
      optimalMin: p25,
      optimalMax: p75,
      basis: `Based on ${wordCounts.length} articles ranking in top 10`,
    };
  }

  // ── Top performing articles
  const topPerformingArticles: TopArticle[] = articlesWithRankings
    .map(a => ({
      id: a.id,
      title: a.title,
      position: latestByArticle.get(a.id)!,
      wordCount: briefs.find(b => b.articleId === a.id)?.competitorAvgWords ?? 0,
      targetKeyword: a.targetKeyword ?? "",
    }))
    .sort((a, b) => a.position - b.position)
    .slice(0, 5);

  const result: InsightsResult = {
    bestPerformingClusters,
    wordCountInsight,
    topPerformingArticles,
    weakClusters,
  };

  return NextResponse.json(result);
}
