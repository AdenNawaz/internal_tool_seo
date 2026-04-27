"use client";

import { useState } from "react";

interface GapKeyword {
  keyword: string;
  volume: number | null;
  competitorPosition: number | null;
  difficulty: number | null;
  trafficPotential: number | null;
  nearMatch: boolean;
}

interface Diagnostics {
  competitorKeywordsTotal: number;
  competitorKeywordsTop10: number;
  ownKeywordsTotal: number;
  competitorError: string | null;
  ownError: string | null;
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
  if (value === null) return <span className="text-gray-300 text-[10px]">—</span>;
  const color =
    value < 30
      ? "bg-green-100 text-green-700"
      : value <= 60
      ? "bg-amber-100 text-amber-700"
      : "bg-red-100 text-red-700";
  return (
    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${color}`}>
      KD {value}
    </span>
  );
}

function DiagnosticBanner({
  domain,
  diagnostics,
}: {
  domain: string;
  diagnostics: Diagnostics;
}) {
  const issues: string[] = [];

  if (diagnostics.competitorError) {
    issues.push(`No keyword data found for ${domain}. Check the domain is correct and has Ahrefs data.`);
  } else if (diagnostics.competitorKeywordsTotal === 0) {
    issues.push(`No keywords returned for ${domain}. The domain may be too small or not indexed in Ahrefs.`);
  } else if (diagnostics.competitorKeywordsTop10 === 0) {
    issues.push(`${domain} has ${diagnostics.competitorKeywordsTotal} keywords but none in the top 10 positions.`);
  }

  if (diagnostics.ownError) {
    issues.push(`Could not load own domain keywords. ${diagnostics.ownError}`);
  } else if (diagnostics.ownKeywordsTotal === 0) {
    issues.push("Own domain returned 0 keywords. Check OWN_DOMAIN in environment variables.");
  }

  if (issues.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {issues.map((msg, i) => (
        <p key={i} className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
          {msg}
        </p>
      ))}
    </div>
  );
}

export function GapPanel({ onPrefillKeyword }: Props) {
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [gaps, setGaps] = useState<GapKeyword[] | null>(null);
  const [competitorDomain, setCompetitorDomain] = useState("");
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFetch() {
    const d = domain.trim();
    if (!d) return;
    setLoading(true);
    setError(null);
    setGaps(null);
    setDiagnostics(null);

    try {
      const res = await fetch("/api/competitors/keyword-gap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competitorDomain: d }),
      });
      const data = await res.json() as {
        gaps?: GapKeyword[];
        competitorDomain?: string;
        diagnostics?: Diagnostics;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? `Error ${res.status}`);
        return;
      }
      setGaps(data.gaps ?? []);
      setCompetitorDomain(data.competitorDomain ?? d);
      setDiagnostics(data.diagnostics ?? null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  const hasNoGaps =
    gaps !== null &&
    gaps.length === 0 &&
    diagnostics &&
    !diagnostics.competitorError &&
    diagnostics.competitorKeywordsTop10 > 0 &&
    diagnostics.ownKeywordsTotal > 0;

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

      {error && (
        <p className="text-[11px] text-red-600 bg-red-50 border border-red-200 rounded-md px-2.5 py-1.5">
          {error}
        </p>
      )}

      {loading && (
        <div className="space-y-2 animate-pulse">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-3 bg-gray-100 rounded" />
          ))}
        </div>
      )}

      {!loading && diagnostics && (
        <DiagnosticBanner domain={competitorDomain} diagnostics={diagnostics} />
      )}

      {hasNoGaps && (
        <p className="text-[11px] text-gray-400">
          No gaps found — {competitorDomain} may not rank for keywords in your topic area.
        </p>
      )}

      {gaps !== null && gaps.length > 0 && (
        <div className="space-y-0.5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] text-gray-400">
              {gaps.length} keywords they rank for that we don&apos;t. Click to prefill.
            </p>
            {diagnostics && (
              <p className="text-[10px] text-gray-300">
                {diagnostics.competitorKeywordsTotal} total
              </p>
            )}
          </div>
          {gaps.map((kw, i) => (
            <button
              key={i}
              onClick={() => onPrefillKeyword(kw.keyword)}
              className="w-full flex items-center justify-between gap-2 py-1.5 px-1 -mx-1 rounded hover:bg-gray-50 text-left transition-colors group"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs text-gray-700 truncate">{kw.keyword}</span>
                {kw.nearMatch && (
                  <span className="text-[9px] bg-blue-50 text-blue-600 px-1 py-0.5 rounded shrink-0">
                    near
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] text-gray-400">#{kw.competitorPosition}</span>
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
