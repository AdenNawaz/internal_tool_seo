"use client";

import { useState } from "react";

interface GapKeyword {
  keyword: string;
  volume: number | null;
  position: number | null;
  difficulty: number | null;
}

interface Props {
  onPrefillKeyword: (kw: string) => void;
}

function fmt(n: number | null) {
  if (n === null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function DiffBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-gray-400 text-[10px]">—</span>;
  const color =
    value < 30
      ? "bg-green-100 text-green-700"
      : value <= 60
      ? "bg-amber-100 text-amber-700"
      : "bg-red-100 text-red-700";
  return (
    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${color}`}>
      {value}
    </span>
  );
}

export function GapPanel({ onPrefillKeyword }: Props) {
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [gaps, setGaps] = useState<GapKeyword[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFetch() {
    const d = domain.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!d) return;
    setLoading(true);
    setError(null);
    setGaps(null);
    try {
      const res = await fetch("/api/competitors/keyword-gap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competitorDomain: d }),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      setGaps(data.gaps ?? []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        Competitor keyword gap
      </p>

      <div className="flex gap-2">
        <input
          type="text"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleFetch()}
          placeholder="competitor.com"
          className="flex-1 min-w-0 text-sm border border-gray-200 rounded-md px-2.5 py-1.5 outline-none focus:border-gray-400 placeholder-gray-300 font-mono"
        />
        <button
          onClick={handleFetch}
          disabled={loading || !domain.trim()}
          className="shrink-0 text-xs font-medium bg-gray-900 text-white rounded-md px-3 py-1.5 hover:bg-gray-700 disabled:opacity-40 transition-colors"
        >
          {loading ? "…" : "Fetch"}
        </button>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {loading && (
        <div className="space-y-2 animate-pulse">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-3 bg-gray-100 rounded" />
          ))}
        </div>
      )}

      {gaps !== null && gaps.length === 0 && !loading && (
        <p className="text-[11px] text-gray-400">No gap keywords found.</p>
      )}

      {gaps !== null && gaps.length > 0 && (
        <div className="space-y-0.5">
          <p className="text-[10px] text-gray-400 mb-2">
            {gaps.length} keywords they rank for that we don&apos;t. Click to prefill.
          </p>
          {gaps.map((kw, i) => (
            <button
              key={i}
              onClick={() => onPrefillKeyword(kw.keyword)}
              className="w-full flex items-center justify-between gap-2 py-1.5 px-1 -mx-1 rounded hover:bg-gray-50 text-left transition-colors"
            >
              <span className="text-xs text-gray-700 truncate">{kw.keyword}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] text-gray-400">{fmt(kw.volume)}</span>
                <DiffBadge value={kw.difficulty} />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
