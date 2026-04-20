export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export type PriorityType =
  | "refresh_opportunity"
  | "trending_cluster"
  | "untouched_cluster"
  | "competitor_gaining"
  | "low_coverage_high_volume";

export interface PriorityAction {
  type: PriorityType;
  score: number;
  title: string;
  message: string;
  detail: string;
  actionLabel: string;
  actionUrl: string;
}

export async function GET() {
  const actions: PriorityAction[] = [];

  // ── 1. Refresh opportunities: articles ranking 6-15
  try {
    const rankings = await db.ranking.findMany({
      where: { position: { gte: 6, lte: 15 } },
      orderBy: { position: "asc" },
      take: 20,
    });

    for (const r of rankings) {
      const article = await db.article.findUnique({
        where: { id: r.articleId },
        select: { id: true, title: true, status: true },
      });
      if (!article || article.status === "draft") continue;

      const score = (16 - (r.position ?? 15)) * 10;
      actions.push({
        type: "refresh_opportunity",
        score,
        title: article.title,
        message: `Ranking #${r.position} — refresh to push to page 1`,
        detail: `Keyword: ${r.keyword} · Position: ${r.position}`,
        actionLabel: "Open article",
        actionUrl: `/articles/${article.id}`,
      });
    }
  } catch { /* ignore */ }

  // ── 2. Trending clusters
  try {
    const alerts = await db.trendingAlert.findMany({
      where: { dismissed: false },
      orderBy: { growthPct: "desc" },
      take: 5,
    });

    for (const alert of alerts) {
      const report = await db.researchReport.findUnique({
        where: { id: alert.reportId },
        select: { id: true },
      });
      actions.push({
        type: "trending_cluster",
        score: alert.growthPct * 2,
        title: alert.keyword,
        message: `Trending +${Math.round(alert.growthPct)}% — publish before competitors catch up`,
        detail: `Cluster: ${alert.cluster} · Volume: ${alert.volumeNow.toLocaleString()} → ${alert.volumeNow.toLocaleString()}`,
        actionLabel: "Start article",
        actionUrl: report ? `/chat?reportId=${alert.reportId}&primaryKeyword=${encodeURIComponent(alert.keyword)}&clusterName=${encodeURIComponent(alert.cluster)}` : "/chat",
      });
    }
  } catch { /* ignore */ }

  // ── 3. Untouched clusters and low coverage
  try {
    const reports = await db.researchReport.findMany({
      where: { status: "ready" },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    const ownKeywords = await db.article.findMany({
      where: { targetKeyword: { not: null } },
      select: { targetKeyword: true },
    });
    const ownKwSet = new Set(ownKeywords.map(a => (a.targetKeyword ?? "").toLowerCase()));

    for (const report of reports) {
      const clusters = (report.clusters as Array<{
        clusterName: string;
        primaryKeyword: string;
        keywords: string[];
        estimatedVolume: number;
      }> | null) ?? [];

      for (const cluster of clusters.slice(0, 10)) {
        const covered = cluster.keywords.filter(k => ownKwSet.has(k.toLowerCase())).length;
        const coverage = cluster.keywords.length > 0 ? covered / cluster.keywords.length : 0;
        const vol = cluster.estimatedVolume ?? 0;

        if (coverage === 0 && vol > 1000) {
          actions.push({
            type: "untouched_cluster",
            score: vol / 1000,
            title: cluster.clusterName,
            message: "No content covers this cluster yet",
            detail: `Est. volume: ${vol.toLocaleString()} · ${cluster.keywords.length} keywords`,
            actionLabel: "Start article",
            actionUrl: `/chat?reportId=${report.id}&primaryKeyword=${encodeURIComponent(cluster.primaryKeyword)}&clusterName=${encodeURIComponent(cluster.clusterName)}&keywords=${encodeURIComponent(cluster.keywords.slice(0, 8).join(","))}`,
          });
        } else if (coverage < 0.3 && coverage > 0 && vol > 5000) {
          actions.push({
            type: "low_coverage_high_volume",
            score: vol / 500,
            title: cluster.clusterName,
            message: `Only ${Math.round(coverage * 100)}% of this cluster is covered`,
            detail: `Est. volume: ${vol.toLocaleString()} · ${covered}/${cluster.keywords.length} keywords covered`,
            actionLabel: "View cluster",
            actionUrl: `/research/${report.id}`,
          });
        }
      }
    }
  } catch { /* ignore */ }

  // ── 4. Sort by score, cap at 10
  const sorted = actions.sort((a, b) => b.score - a.score).slice(0, 10);

  return NextResponse.json({ actions: sorted });
}
