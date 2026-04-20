"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import Link from "next/link";
import type { InsightsResult } from "@/app/api/insights/what-works/route";

function positionBadge(pos: number) {
  const color = pos <= 3 ? "bg-green-100 text-green-700" :
    pos <= 10 ? "bg-blue-100 text-blue-700" :
    pos <= 20 ? "bg-amber-100 text-amber-700" :
    "bg-gray-100 text-gray-500";
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${color}`}>
      #{pos}
    </span>
  );
}

export function InsightsSection() {
  const [data, setData] = useState<InsightsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/insights/what-works")
      .then(r => r.json())
      .then((d: InsightsResult) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="mb-8 flex items-center gap-2 text-sm text-gray-400">
        <Loader2 size={13} className="animate-spin" /> Loading insights…
      </div>
    );
  }

  if (!data || data.insufficient_data) {
    return null; // Hide silently when not enough data
  }

  return (
    <div className="mb-8 rounded-xl border border-gray-100">
      {/* Collapsible header */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-gray-50 rounded-xl transition-colors"
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
          <span className="text-sm font-semibold text-gray-800">What&apos;s working</span>
          <span className="text-xs text-gray-400">— patterns from your published content</span>
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-5 border-t border-gray-100 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Best performing clusters */}
            {data.bestPerformingClusters.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Best clusters</p>
                <div className="space-y-1.5">
                  {data.bestPerformingClusters.map((c, i) => (
                    <div key={i} className="flex items-center justify-between gap-2">
                      <span className="text-xs text-gray-700 truncate flex-1">{c.clusterName}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {positionBadge(c.avgPosition)}
                        <span className="text-[10px] text-gray-400">{c.articleCount} art.</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Word count insight */}
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Word count</p>
              {data.wordCountInsight ? (
                <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2.5 space-y-1">
                  <p className="text-sm font-semibold text-blue-800">
                    {data.wordCountInsight.optimalMin.toLocaleString()}–{data.wordCountInsight.optimalMax.toLocaleString()} words
                  </p>
                  <p className="text-[10px] text-blue-600">
                    {data.wordCountInsight.basis}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-gray-400">Not enough data yet</p>
              )}

              {/* Weak clusters */}
              {data.weakClusters.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Underperforming</p>
                  {data.weakClusters.map((c, i) => (
                    <div key={i} className="rounded bg-amber-50 border border-amber-100 px-2.5 py-1.5">
                      <p className="text-[11px] font-medium text-amber-800">{c.clusterName} — avg #{c.avgPosition}</p>
                      <p className="text-[10px] text-amber-600 mt-0.5">{c.note}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top articles */}
            {data.topPerformingArticles.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Top articles</p>
                <div className="space-y-2">
                  {data.topPerformingArticles.slice(0, 3).map((a, i) => (
                    <div key={i} className="flex items-start gap-2">
                      {positionBadge(a.position)}
                      <div className="min-w-0 flex-1">
                        <Link href={`/articles/${a.id}`} className="text-[11px] font-medium text-blue-700 hover:underline truncate block">
                          {a.title}
                        </Link>
                        {a.targetKeyword && (
                          <p className="text-[10px] text-gray-400 truncate">{a.targetKeyword}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
