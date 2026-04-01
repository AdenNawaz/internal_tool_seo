import { db } from "@/lib/db";
import Link from "next/link";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { SovSection } from "@/components/dashboard/sov-section";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const articles = await db.article.findMany({
    where: { status: { in: ["published", "ready"] } },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: {
      id: true,
      title: true,
      status: true,
      targetKeyword: true,
      publishedUrl: true,
      updatedAt: true,
    },
  });

  const allRankings = await db.ranking.findMany({
    where: { articleId: { in: articles.map((a) => a.id) } },
    orderBy: { checkedAt: "asc" },
  });

  const rankingsByArticle = new Map<string, typeof allRankings>();
  for (const r of allRankings) {
    if (!rankingsByArticle.has(r.articleId)) rankingsByArticle.set(r.articleId, []);
    rankingsByArticle.get(r.articleId)!.push(r);
  }

  const rows = articles.map((a) => ({
    ...a,
    updatedAt: a.updatedAt.toISOString(),
    rankings: (rankingsByArticle.get(a.id) ?? []).map((r) => ({
      ...r,
      checkedAt: r.checkedAt.toISOString(),
    })),
  }));

  return (
    <div className="max-w-5xl mx-auto px-8 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Performance</h1>
          <p className="text-sm text-gray-400 mt-1">Ranking positions for published articles</p>
        </div>
        <Link
          href="/articles"
          className="text-sm text-gray-400 hover:text-gray-700 transition-colors"
        >
          ← Articles
        </Link>
      </div>

      <div className="mb-10">
        <SovSection />
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-sm">No published articles yet.</p>
          <p className="text-xs mt-1">Mark articles as ready or published to track them here.</p>
        </div>
      ) : (
        <DashboardClient rows={rows} />
      )}
    </div>
  );
}
