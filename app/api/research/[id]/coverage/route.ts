import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { KeywordCluster } from "@/lib/cluster-builder";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const report = await db.researchReport.findUnique({ where: { id: params.id } });
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rawClusters = (report.clusters as KeywordCluster[] | null) ?? [];
  if (!rawClusters.length) {
    return NextResponse.json({ clusters: [], articles: [] });
  }

  // Collect all keywords across all clusters
  const allKeywords: string[] = [];
  const allClusterNames: string[] = rawClusters.map((c) => c.clusterName);

  for (const cluster of rawClusters) {
    allKeywords.push(cluster.primaryKeyword);
    for (const kw of cluster.keywords ?? []) {
      allKeywords.push(kw);
    }
  }

  // Find articles that match by clusterName or targetKeyword
  const articles = await db.article.findMany({
    where: {
      OR: [
        { targetKeyword: { in: allKeywords } },
      ],
    },
    select: { id: true, title: true, status: true, targetKeyword: true },
  });

  // Also fetch articles with matching clusterName (after schema push)
  const clusterNameArticles = await db.article.findMany({
    where: { targetKeyword: { in: allClusterNames } },
    select: { id: true, title: true, status: true, targetKeyword: true },
  }).catch(() => []);

  const allArticles = [...articles, ...clusterNameArticles.filter(
    (a) => !articles.find((x) => x.id === a.id)
  )];

  return NextResponse.json({ clusters: rawClusters, articles: allArticles });
}
