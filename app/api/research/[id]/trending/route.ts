import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { findTrendingKeywords } from "@/lib/trending";
import type { KeywordCluster } from "@/lib/cluster-builder";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const report = await db.researchReport.findUnique({ where: { id: params.id } });
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!["clustered", "complete"].includes(report.status)) {
    return NextResponse.json({ error: "Report must be clustered first" }, { status: 422 });
  }

  const clusters = (report.clusters as KeywordCluster[] | null) ?? [];
  if (!clusters.length) {
    return NextResponse.json({ error: "No clusters found" }, { status: 422 });
  }

  // Collect all unique keywords with their cluster name
  const keywordToCluster = new Map<string, string>();
  for (const cluster of clusters) {
    keywordToCluster.set(cluster.primaryKeyword, cluster.clusterName);
    for (const kw of cluster.keywords ?? []) {
      keywordToCluster.set(kw, cluster.clusterName);
    }
  }

  const allKeywords = Array.from(keywordToCluster.keys());
  const trending = await findTrendingKeywords({ keywords: allKeywords, country: "us" });

  // Delete old alerts for this report
  await db.trendingAlert.deleteMany({ where: { reportId: params.id } });

  if (!trending.length) {
    return NextResponse.json([]);
  }

  await db.trendingAlert.createMany({
    data: trending.map((t) => ({
      keyword: t.keyword,
      cluster: keywordToCluster.get(t.keyword) ?? "Unknown",
      reportId: params.id,
      volumeNow: t.currentVolume,
      volumePrev: t.previousVolume,
      growthPct: t.growthPct,
    })),
  });

  const alerts = await db.trendingAlert.findMany({
    where: { reportId: params.id },
    orderBy: { growthPct: "desc" },
  });

  return NextResponse.json(alerts);
}
