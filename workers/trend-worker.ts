import { Worker } from "bullmq";
import { makeConnection } from "../lib/queue/connection";
import { db as prisma } from "../lib/db";

const OPENROUTER_API_KEY = process.env.OPENAI_API_KEY;

async function detectTrends() {
  const { cachedAhrefs } = await import("../lib/ahrefs-cached");

  const reports = await prisma.researchReport.findMany({
    where: { status: "done" },
    select: { id: true, clusters: true },
  });

  for (const report of reports) {
    const clusters = report.clusters as Array<{ name: string; keywords: string[] }> | null;
    if (!clusters) continue;

    for (const cluster of clusters) {
      const primaryKw = cluster.keywords?.[0];
      if (!primaryKw) continue;

      const result = await cachedAhrefs("keywords-explorer-search-volumes", {
        keywords: cluster.keywords.slice(0, 10),
        country: "us",
      }, 86400) as { keywords?: Array<{ keyword: string; volume: number }> };

      const volumes = result?.keywords ?? [];
      for (const kv of volumes) {
        const prev = await prisma.trendingAlert.findFirst({
          where: { keyword: kv.keyword, reportId: report.id },
          orderBy: { checkedAt: "desc" },
        });

        if (prev && kv.volume > prev.volumeNow * 1.3) {
          await prisma.trendingAlert.create({
            data: {
              keyword: kv.keyword,
              cluster: cluster.name,
              reportId: report.id,
              volumeNow: kv.volume,
              volumePrev: prev.volumeNow,
              growthPct: ((kv.volume - prev.volumeNow) / prev.volumeNow) * 100,
            },
          });
        } else if (!prev) {
          await prisma.trendingAlert.create({
            data: {
              keyword: kv.keyword,
              cluster: cluster.name,
              reportId: report.id,
              volumeNow: kv.volume,
              volumePrev: kv.volume,
              growthPct: 0,
            },
          });
        }
      }
    }
  }
}

export const trendWorker = new Worker(
  "trend",
  async (job) => {
    if (job.name === "detect-trends") return detectTrends();
  },
  { connection: makeConnection(), concurrency: 1 }
);

trendWorker.on("failed", (job, err) => {
  console.error(`[trend] ${job?.name} failed:`, err.message);
});
