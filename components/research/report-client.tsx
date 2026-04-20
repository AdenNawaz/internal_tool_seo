"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { KeywordCluster } from "@/lib/cluster-builder";

interface Props {
  reportId: string;
  initialClusters: KeywordCluster[];
  reportStatus: string;
  hasOpenAI: boolean;
  anyHighDrCompetitor: boolean;
}

export function ReportClient({
  reportId,
  initialClusters,
  reportStatus,
  hasOpenAI,
  anyHighDrCompetitor,
}: Props) {
  const router = useRouter();
  const [clusters, setClusters] = useState<KeywordCluster[]>(initialClusters);
  const [building, setBuilding] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleBuildClusters() {
    setBuilding(true);
    setError(null);
    setStatusMsg("Starting…");

    try {
      const res = await fetch(`/api/research/${reportId}/build-clusters`, {
        method: "POST",
      });

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");

      const dec = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = dec.decode(value);
        for (const chunk of text.split("\n\n")) {
          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data:")) continue;
            try {
              const payload = JSON.parse(line.slice(5).trim());
              if (payload.message) setStatusMsg(payload.message);
              if (payload.clusters) setClusters(payload.clusters);
              if (payload.message?.toLowerCase().includes("error")) setError(payload.message);
            } catch { /* ignore malformed */ }
          }
        }
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBuilding(false);
      setStatusMsg("");
    }
  }

  function handleStartArticle(cluster: KeywordCluster) {
    const params = new URLSearchParams({
      reportId,
      primaryKeyword: cluster.primaryKeyword,
      clusterName: cluster.clusterName,
      keywords: cluster.keywords.join(","),
    });
    router.push(`/chat?${params.toString()}`);
  }

  const intentColor = (intent: KeywordCluster["searchIntent"]) => {
    const colors = {
      informational: "bg-blue-50 text-blue-600",
      commercial: "bg-purple-50 text-purple-600",
      transactional: "bg-green-50 text-green-600",
      navigational: "bg-gray-100 text-gray-500",
    };
    return colors[intent] ?? "bg-gray-100 text-gray-500";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          Keyword clusters {clusters.length > 0 && `(${clusters.length})`}
        </h2>
        {reportStatus === "complete" && hasOpenAI && (
          <button
            onClick={handleBuildClusters}
            disabled={building}
            className="text-xs font-medium bg-gray-900 text-white rounded-md px-3 py-1.5 hover:bg-gray-700 disabled:opacity-40 transition-colors"
          >
            {building ? statusMsg || "Building…" : clusters.length > 0 ? "Rebuild" : "Build clusters"}
          </button>
        )}
      </div>

      {!hasOpenAI && (
        <p className="text-xs text-gray-400">Add OPENROUTER_API_KEY to enable cluster building.</p>
      )}

      {reportStatus !== "complete" && (
        <p className="text-xs text-gray-400">Report must complete before building clusters.</p>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      {clusters.length === 0 && reportStatus === "complete" && hasOpenAI && !building && (
        <p className="text-xs text-gray-400">No clusters yet — click Build clusters to generate.</p>
      )}

      <div className="space-y-4">
        {clusters.map((cluster, i) => {
          const isHighComp = anyHighDrCompetitor && !cluster.addressesCompetitorGap;

          return (
            <div
              key={i}
              className="border border-gray-100 rounded-lg p-4 space-y-3 hover:border-gray-200 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-900">{cluster.clusterName}</p>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${intentColor(cluster.searchIntent)}`}>
                      {cluster.searchIntent}
                    </span>
                    {cluster.addressesCompetitorGap && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-50 text-green-600">
                        Gap opportunity
                      </span>
                    )}
                    {isHighComp && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-50 text-red-600">
                        High competition
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 font-mono">{cluster.primaryKeyword}</p>
                </div>
                <button
                  onClick={() => handleStartArticle(cluster)}
                  className="shrink-0 text-xs font-medium border border-gray-200 rounded-md px-2.5 py-1.5 text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Start article
                </button>
              </div>

              <p className="text-xs text-gray-500">{cluster.notes}</p>

              <div className="flex gap-3 text-[10px] text-gray-400">
                {cluster.estimatedVolume > 0 && (
                  <span>{cluster.estimatedVolume.toLocaleString()} est. vol</span>
                )}
                {cluster.difficulty != null && (
                  <span>KD {cluster.difficulty}</span>
                )}
                <span>{cluster.keywords.length} keywords</span>
              </div>

              {cluster.keywords.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {cluster.keywords.slice(0, 8).map((kw, j) => (
                    <span
                      key={j}
                      className="text-[10px] bg-gray-50 text-gray-500 rounded px-1.5 py-0.5"
                    >
                      {kw}
                    </span>
                  ))}
                  {cluster.keywords.length > 8 && (
                    <span className="text-[10px] text-gray-400">
                      +{cluster.keywords.length - 8} more
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
