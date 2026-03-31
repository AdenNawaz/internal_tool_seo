"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
  Tooltip,
  ResponsiveContainer,
  YAxis,
} from "recharts";

interface Ranking {
  id: string;
  articleId: string;
  keyword: string;
  position: number | null;
  volume: number | null;
  refreshOpportunity: boolean;
  checkedAt: string;
}

interface ArticleRow {
  id: string;
  title: string;
  status: string;
  targetKeyword: string | null;
  publishedUrl: string | null;
  updatedAt: string;
  rankings: Ranking[];
}

interface Props {
  rows: ArticleRow[];
}

function fmt(n: number | null) {
  if (n === null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function Sparkline({ rankings }: { rankings: Ranking[] }) {
  if (rankings.length < 2) {
    const pos = rankings[0]?.position;
    return (
      <span className={`text-sm font-semibold ${pos == null ? "text-gray-300" : pos <= 10 ? "text-green-600" : pos <= 30 ? "text-amber-600" : "text-red-500"}`}>
        {pos != null ? `#${pos}` : "—"}
      </span>
    );
  }

  const data = rankings
    .slice(-12)
    .map((r) => ({ pos: r.position ?? 100 }));

  const latest = rankings[rankings.length - 1].position;
  const earliest = rankings[0].position;
  const trend = latest != null && earliest != null
    ? latest < earliest ? "improving" : latest > earliest ? "declining" : "stable"
    : "unknown";

  const lineColor =
    trend === "improving" ? "#22c55e" : trend === "declining" ? "#ef4444" : "#94a3b8";

  return (
    <div className="flex items-center gap-3">
      <span className={`text-sm font-semibold w-8 ${latest == null ? "text-gray-300" : latest <= 10 ? "text-green-600" : latest <= 30 ? "text-amber-600" : "text-red-500"}`}>
        {latest != null ? `#${latest}` : "—"}
      </span>
      <div className="w-20 h-8">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <YAxis domain={["dataMax", "dataMin"]} hide />
            <Tooltip
              formatter={(v: unknown) => [`#${v}`, "Position"]}
              contentStyle={{ fontSize: 11, padding: "2px 6px" }}
            />
            <Line
              type="monotone"
              dataKey="pos"
              stroke={lineColor}
              strokeWidth={1.5}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function DashboardClient({ rows }: Props) {
  const [checking, setChecking] = useState<string | null>(null);
  const [localRankings, setLocalRankings] = useState<Map<string, Ranking[]>>(
    () => new Map(rows.map((r) => [r.id, r.rankings]))
  );

  async function handleCheck(articleId: string) {
    setChecking(articleId);
    try {
      const res = await fetch("/api/rankings/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId }),
      });
      if (!res.ok) return;
      const newRanking = await res.json();
      setLocalRankings((prev) => {
        const next = new Map(prev);
        const existing = next.get(articleId) ?? [];
        next.set(articleId, [...existing, newRanking]);
        return next;
      });
    } finally {
      setChecking(null);
    }
  }

  const opportunities = rows.filter((r) => {
    const rankings = localRankings.get(r.id) ?? [];
    const latest = rankings[rankings.length - 1];
    return latest?.refreshOpportunity;
  });

  return (
    <div className="space-y-8">
      {/* Refresh opportunities banner */}
      {opportunities.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-100 px-4 py-3">
          <p className="text-xs font-semibold text-amber-700 mb-1">
            {opportunities.length} refresh {opportunities.length === 1 ? "opportunity" : "opportunities"}
          </p>
          <p className="text-xs text-amber-600">
            {opportunities.map((r) => r.title).join(", ")} rank outside top 10 — consider refreshing the content.
          </p>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] text-gray-400 uppercase tracking-wide border-b border-gray-100">
              <th className="text-left pb-3 font-medium">Article</th>
              <th className="text-left pb-3 font-medium">Keyword</th>
              <th className="text-right pb-3 font-medium">Volume</th>
              <th className="text-right pb-3 font-medium">Position</th>
              <th className="text-right pb-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((row) => {
              const rankings = localRankings.get(row.id) ?? [];
              const latest = rankings[rankings.length - 1];

              return (
                <tr key={row.id} className="hover:bg-gray-50/50">
                  <td className="py-3 pr-4">
                    <a
                      href={`/articles/${row.id}`}
                      className="text-sm font-medium text-gray-900 hover:text-blue-600 transition-colors line-clamp-1"
                    >
                      {row.title}
                    </a>
                    {row.publishedUrl && (
                      <a
                        href={row.publishedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-gray-400 hover:underline block mt-0.5 truncate max-w-[220px]"
                      >
                        {row.publishedUrl}
                      </a>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <span className="text-xs text-gray-600 font-mono">
                      {row.targetKeyword ?? <span className="text-gray-300">—</span>}
                    </span>
                  </td>
                  <td className="py-3 text-right text-xs text-gray-500">
                    {fmt(latest?.volume ?? null)}
                  </td>
                  <td className="py-3 text-right">
                    <Sparkline rankings={rankings} />
                  </td>
                  <td className="py-3 text-right">
                    <button
                      onClick={() => handleCheck(row.id)}
                      disabled={checking === row.id}
                      className="text-[11px] text-gray-400 hover:text-gray-700 underline disabled:opacity-40"
                    >
                      {checking === row.id ? "Checking…" : "Check now"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
