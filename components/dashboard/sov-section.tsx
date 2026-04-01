"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface Competitor {
  domain: string;
  sov: number;
}

interface Snapshot {
  id: string;
  checkedAt: string;
  companySOV: number;
  competitors: Competitor[];
  keywordCount: number;
}

const OWN_DOMAIN = process.env.NEXT_PUBLIC_OWN_DOMAIN ?? "Your domain";

const COLORS = ["#3b82f6", "#6b7280", "#9ca3af", "#d1d5db", "#e5e7eb"];

export function SovSection() {
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/sov")
      .then((r) => r.json())
      .then((data) => setSnapshots(Array.isArray(data) ? data : []))
      .catch(() => setSnapshots([]));
  }, []);

  async function handleCheck() {
    setChecking(true);
    setError(null);
    try {
      const res = await fetch("/api/sov/check", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "SOV check failed");
        return;
      }
      setSnapshots((prev) => [...(prev ?? []), data]);
    } catch {
      setError("SOV check failed");
    } finally {
      setChecking(false);
    }
  }

  if (snapshots === null) {
    return (
      <div className="space-y-2 animate-pulse">
        <div className="h-4 bg-gray-100 rounded w-40" />
        <div className="h-24 bg-gray-100 rounded" />
      </div>
    );
  }

  const latest = snapshots[snapshots.length - 1];
  const prev = snapshots[snapshots.length - 2];
  const trendDelta =
    latest && prev ? Math.round((latest.companySOV - prev.companySOV) * 10) / 10 : null;

  // Build chart data
  const allDomains =
    latest
      ? [OWN_DOMAIN, ...latest.competitors.map((c) => c.domain)]
      : [OWN_DOMAIN];

  const chartData = snapshots.map((s) => {
    const point: Record<string, string | number> = {
      date: new Date(s.checkedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    };
    point[OWN_DOMAIN] = s.companySOV;
    for (const c of s.competitors) {
      point[c.domain] = c.sov;
    }
    return point;
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Share of Voice
        </p>
        <button
          onClick={handleCheck}
          disabled={checking}
          className="text-xs text-gray-400 hover:text-gray-700 underline disabled:opacity-40"
        >
          {checking ? "Calculating…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="rounded-md bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-700">
          {error}
        </div>
      )}

      {!latest && !error && (
        <div className="rounded-lg border border-dashed border-gray-200 px-6 py-8 text-center">
          <p className="text-sm text-gray-500 mb-3">
            No Share of Voice data yet.
          </p>
          <button
            onClick={handleCheck}
            disabled={checking}
            className="text-sm font-medium bg-gray-900 text-white rounded-md px-4 py-2 hover:bg-gray-700 disabled:opacity-40 transition-colors"
          >
            {checking ? "Calculating…" : "Calculate Share of Voice"}
          </button>
          <p className="text-[10px] text-gray-400 mt-3">
            Requires Rank Tracker configured in your Ahrefs account.
          </p>
        </div>
      )}

      {latest && (
        <div className="space-y-5">
          {/* SOV bar chart */}
          <div className="space-y-2">
            {[{ domain: OWN_DOMAIN, sov: latest.companySOV, isOwn: true }, ...latest.competitors.map((c) => ({ ...c, isOwn: false }))].map(
              (item, i) => (
                <div key={item.domain} className="space-y-0.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className={item.isOwn ? "font-semibold text-gray-800" : "text-gray-500"}>
                      {item.domain}
                    </span>
                    <span className={item.isOwn ? "font-semibold text-blue-600" : "text-gray-400"}>
                      {item.sov}%
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${item.sov}%`,
                        backgroundColor: COLORS[i] ?? "#e5e7eb",
                      }}
                    />
                  </div>
                </div>
              )
            )}
            <p className="text-[10px] text-gray-400 mt-1">
              As of {new Date(latest.checkedAt).toLocaleDateString()} · {latest.keywordCount} keywords tracked
            </p>
          </div>

          {/* Trend insight */}
          {trendDelta !== null && (
            <p className={`text-xs font-medium ${trendDelta >= 0 ? "text-green-600" : "text-amber-600"}`}>
              {trendDelta >= 0
                ? `✓ Your Share of Voice is growing (+${trendDelta}% since last check)`
                : `⚠ Your Share of Voice dropped ${Math.abs(trendDelta)}% since last check`}
            </p>
          )}

          {/* Line chart (only if 2+ data points) */}
          {snapshots.length >= 2 && (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${v}%`}
                    width={36}
                  />
                  <Tooltip formatter={(v: unknown) => `${v}%`} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  {allDomains.slice(0, 5).map((domain, i) => (
                    <Line
                      key={domain}
                      type="monotone"
                      dataKey={domain}
                      stroke={COLORS[i] ?? "#e5e7eb"}
                      strokeWidth={i === 0 ? 2 : 1.5}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
