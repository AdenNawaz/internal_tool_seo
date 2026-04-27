import "dotenv/config";
import { rankingWorker } from "./ranking-worker";
import { competitorWorker } from "./competitor-worker";
import { aiVisibilityWorker } from "./ai-visibility-worker";
import { contentQualityWorker } from "./content-quality-worker";
import { clusterHealthWorker } from "./cluster-health-worker";
import { refreshWorker } from "./refresh-worker";
import { linkingWorker } from "./linking-worker";
import { trendWorker } from "./trend-worker";

const workers = [
  rankingWorker,
  competitorWorker,
  aiVisibilityWorker,
  contentQualityWorker,
  clusterHealthWorker,
  refreshWorker,
  linkingWorker,
  trendWorker,
];

console.log(`[workers] Started ${workers.length} workers`);

async function shutdown() {
  console.log("[workers] Shutting down…");
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
