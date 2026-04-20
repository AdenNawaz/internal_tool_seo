"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  extractKeywords,
  extractPlainText,
  getReadabilityScore,
  getKeywordDensity,
} from "@/lib/text-analysis";
import type { WordResult } from "@/app/api/keywords/analyze/route";

/* ─── Types ──────────────────────────────────────────────────────────── */

interface KeywordOverview {
  volume: number | null;
  difficulty: number | null;
  cpc: number | null;
  traffic_potential: number | null;
  serp_features: string[];
}

interface RelatedTerm {
  keyword: string;
  volume: number | null;
  difficulty: number | null;
  traffic_potential: number | null;
}

interface LookupResult {
  keyword: string;
  overview: KeywordOverview | null;
  relatedTerms: RelatedTerm[];
}

interface RankingEntry {
  keyword: string;
  position: number;
  url: string;
  volume: number | null;
}

interface DraftEntry {
  id: string;
  title: string;
  targetKeyword: string | null;
  status: string;
}

interface CannibalizationResult {
  safe: boolean;
  risk: "none" | "low" | "medium" | "high";
  ownRankings: RankingEntry[];
  internalDrafts: DraftEntry[];
  summary: string;
}

/* ─── Helpers ────────────────────────────────────────────────────────── */

function fmt(n: number | null) {
  if (n === null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function truncateUrl(url: string) {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 28 ? u.pathname.slice(0, 28) + "…" : u.pathname;
    return u.hostname + path;
  } catch {
    return url.length > 38 ? url.slice(0, 38) + "…" : url;
  }
}

/* ─── Shared sub-components ─────────────────────────────────────────── */

function DifficultyBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-gray-400 text-xs">—</span>;
  const color =
    value < 30 ? "bg-green-100 text-green-700" :
    value <= 60 ? "bg-amber-100 text-amber-700" :
    "bg-red-100 text-red-700";
  return (
    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${color}`}>
      {value}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = status === "published" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${color}`}>
      {status}
    </span>
  );
}

function KeywordSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-1">
            <div className="h-2.5 bg-gray-100 rounded w-12" />
            <div className="h-5 bg-gray-100 rounded w-10" />
          </div>
        ))}
      </div>
      <div className="h-2.5 bg-gray-100 rounded w-3/4" />
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="h-3 bg-gray-100 rounded" />
      ))}
    </div>
  );
}

/* ─── Cannibalization banner ─────────────────────────────────────────── */

function CannibalizationBanner({
  result, loading, error,
}: {
  result: CannibalizationResult | null;
  loading: boolean;
  error: boolean;
}) {
  if (loading) {
    return <div className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-400">Checking for conflicts…</div>;
  }
  if (error) return <p className="text-xs text-gray-400">Conflict check failed</p>;
  if (!result) return null;

  const bannerColor =
    result.risk === "none" ? "bg-green-50 text-green-700" :
    result.risk === "high" ? "bg-red-50 text-red-700" :
    "bg-amber-50 text-amber-700";

  const label =
    result.risk === "none" ? "No conflicts found" :
    result.risk === "high" ? "High risk — keyword conflict" :
    result.risk === "medium" ? "Medium risk" : "Low risk";

  return (
    <div className="space-y-3">
      <div className={`rounded-md px-3 py-2.5 ${bannerColor}`}>
        <p className="text-xs font-semibold">{label}</p>
        {result.risk !== "none" && (
          <p className="text-xs mt-0.5 opacity-80">{result.summary}</p>
        )}
      </div>
      {result.ownRankings.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Already ranking</p>
          {result.ownRankings.map((r, i) => (
            <div key={i} className="flex items-center justify-between gap-2 py-0.5">
              <a href={r.url} target="_blank" rel="noopener noreferrer"
                className="text-[11px] text-blue-600 hover:underline truncate" title={r.url}>
                {truncateUrl(r.url)}
              </a>
              <span className="text-[10px] text-gray-400 shrink-0">#{r.position}</span>
            </div>
          ))}
        </div>
      )}
      {result.internalDrafts.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
            Other drafts targeting this keyword
          </p>
          {result.internalDrafts.map((draft) => (
            <a key={draft.id} href={`/articles/${draft.id}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-between gap-2 py-0.5 hover:opacity-70 transition-opacity">
              <span className="text-[11px] text-gray-700 truncate">{draft.title}</span>
              <StatusBadge status={draft.status} />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Content analysis word row ──────────────────────────────────────── */

function WordRow({ result }: { result: WordResult }) {
  const [expanded, setExpanded] = useState(false);
  const [alternatives, setAlternatives] = useState<RelatedTerm[] | null>(null);
  const [altLoading, setAltLoading] = useState(false);

  const dotColor =
    result.color === "red" ? "bg-red-400" :
    result.color === "amber" ? "bg-amber-400" :
    "bg-green-400";

  async function handleExpand() {
    const next = !expanded;
    setExpanded(next);
    if (next && alternatives === null) {
      setAltLoading(true);
      try {
        const res = await fetch("/api/keywords/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keyword: result.word }),
        });
        const data = await res.json();
        setAlternatives(data.relatedTerms ?? []);
      } catch {
        setAlternatives([]);
      } finally {
        setAltLoading(false);
      }
    }
  }

  return (
    <div className="border-b border-gray-50 last:border-0">
      <button
        onClick={handleExpand}
        className="w-full flex items-center justify-between gap-2 py-1.5 text-left hover:bg-gray-50/50 rounded px-1 -mx-1 transition-colors"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
          <span className="text-xs text-gray-700 truncate">{result.word}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] text-gray-400">{fmt(result.volume)}</span>
          <DifficultyBadge value={result.difficulty} />
        </div>
      </button>

      {expanded && (
        <div className="pb-2 pl-3 space-y-2">
          {/* Extra metrics */}
          <div className="flex gap-3 text-[10px] text-gray-500">
            <span>CPC {result.cpc !== null ? `$${result.cpc.toFixed(2)}` : "—"}</span>
            {result.rankingUrl && (
              <span className="text-amber-600">
                Ranks #{result.rankingPosition} at{" "}
                <a href={result.rankingUrl} target="_blank" rel="noopener noreferrer"
                  className="underline hover:text-amber-800">
                  {truncateUrl(result.rankingUrl)}
                </a>
              </span>
            )}
          </div>

          {/* Alternatives */}
          {altLoading && (
            <div className="space-y-1 animate-pulse">
              {[0, 1, 2].map((i) => <div key={i} className="h-2.5 bg-gray-100 rounded" />)}
            </div>
          )}
          {alternatives && alternatives.length > 0 && (
            <div className="space-y-0.5">
              <p className="text-[10px] text-gray-400 font-medium">Alternatives</p>
              {alternatives.slice(0, 5).map((alt) => (
                <div key={alt.keyword} className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-gray-600 truncate">{alt.keyword}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] text-gray-400">{fmt(alt.volume)}</span>
                    <DifficultyBadge value={alt.difficulty} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {alternatives && alternatives.length === 0 && !altLoading && (
            <p className="text-[10px] text-gray-400">No alternatives found</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Content analysis section ───────────────────────────────────────── */

function ContentAnalysis({ content }: { content: unknown }) {
  const [results, setResults] = useState<WordResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const prevContentRef = useRef<unknown>(null);

  useEffect(() => {
    if (content === prevContentRef.current) return;
    prevContentRef.current = content;

    const words = extractKeywords(content);
    if (words.length === 0) return;

    setWordCount(words.length);
    setLoading(true);
    setResults(null);

    fetch("/api/keywords/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ words }),
    })
      .then((r) => r.json())
      .then((data) => setResults(data.results ?? []))
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, [content]);

  if (!content && !results) {
    return <p className="text-[11px] text-gray-400">Write something to see analysis.</p>;
  }

  if (loading) {
    return (
      <div className="space-y-2 animate-pulse">
        <p className="text-[11px] text-gray-400">Analysing {wordCount} words…</p>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-3 bg-gray-100 rounded" />
        ))}
      </div>
    );
  }

  if (!results) return null;
  if (results.length === 0) return <p className="text-[11px] text-gray-400">No keywords found.</p>;

  const red = results.filter((r) => r.color === "red");
  const amber = results.filter((r) => r.color === "amber");
  const green = results.filter((r) => r.color === "green");
  const sorted = [...red, ...amber, ...green];

  return (
    <div className="space-y-1">
      <div className="flex gap-3 text-[10px] text-gray-400 mb-2">
        {red.length > 0 && <span className="text-red-500">{red.length} conflict{red.length > 1 ? "s" : ""}</span>}
        {amber.length > 0 && <span className="text-amber-500">{amber.length} low vol</span>}
        {green.length > 0 && <span className="text-green-600">{green.length} good</span>}
      </div>
      {sorted.map((r) => <WordRow key={r.word} result={r} />)}
    </div>
  );
}

/* ─── Writing quality ────────────────────────────────────────────────── */

function WritingQuality({ content, targetKeyword }: { content: unknown; targetKeyword: string }) {
  const plainText = useMemo(() => {
    return Array.isArray(content) ? extractPlainText(content) : "";
  }, [content]);

  const readability = useMemo(() => getReadabilityScore(plainText), [plainText]);

  const density = useMemo(() => {
    if (!targetKeyword.trim() || !plainText) return null;
    return getKeywordDensity(plainText, targetKeyword);
  }, [plainText, targetKeyword]);

  const scoreColor =
    readability.score === 0
      ? "text-gray-400"
      : readability.score >= 60
      ? "text-green-600"
      : readability.score >= 30
      ? "text-amber-600"
      : "text-red-600";

  const scoreBg =
    readability.score === 0
      ? "bg-gray-50"
      : readability.score >= 60
      ? "bg-green-50"
      : readability.score >= 30
      ? "bg-amber-50"
      : "bg-red-50";

  const densityColor =
    !density
      ? "text-gray-400"
      : density.status === "good"
      ? "text-green-600"
      : density.status === "high"
      ? "text-red-600"
      : "text-amber-600";

  const densityLabel =
    !density
      ? null
      : density.status === "good"
      ? "Good density"
      : density.status === "high"
      ? "Too dense"
      : "Too low";

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Writing Quality</p>

      {/* Readability */}
      <div className={`rounded-md px-3 py-2.5 ${scoreBg}`}>
        <div className="flex items-baseline justify-between">
          <p className="text-[10px] text-gray-500 font-medium">Readability</p>
          <span className={`text-sm font-bold ${scoreColor}`}>
            {readability.score === 0 ? "—" : readability.score}
          </span>
        </div>
        <p className={`text-xs font-semibold mt-0.5 ${scoreColor}`}>{readability.label}</p>
      </div>

      {/* Word stats */}
      {readability.wordCount > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Words</p>
            <p className="text-sm font-semibold text-gray-800">{readability.wordCount}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Sentences</p>
            <p className="text-sm font-semibold text-gray-800">{readability.sentenceCount}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Avg WPS</p>
            <p className="text-sm font-semibold text-gray-800">{readability.avgWordsPerSentence}</p>
          </div>
        </div>
      )}

      {/* Keyword density */}
      {density && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Keyword density</p>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-medium ${densityColor}`}>{densityLabel}</span>
            <span className="text-[11px] text-gray-500">
              {density.count}× · {density.density.toFixed(2)}%
            </span>
          </div>
          <div className="h-1 w-full rounded-full bg-gray-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                density.status === "good"
                  ? "bg-green-400"
                  : density.status === "high"
                  ? "bg-red-400"
                  : "bg-amber-400"
              }`}
              style={{ width: `${Math.min(100, (density.density / 3) * 100)}%` }}
            />
          </div>
          <p className="text-[10px] text-gray-400">Target: 0.5 – 2.5%</p>
        </div>
      )}

      {readability.wordCount === 0 && (
        <p className="text-[11px] text-gray-400">Write something to see quality metrics.</p>
      )}
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────── */

interface SecondaryKeyword {
  keyword: string;
  volume?: number;
  kd?: number;
  intent?: string;
}

interface Props {
  articleId: string;
  initialKeyword: string | null;
  onKeywordChange: (keyword: string) => void;
  analysisContent: unknown;
  onCompetitorAvgWords?: (words: number | null) => void;
  autoLookup?: boolean;
  initialSecondaryKeywords?: SecondaryKeyword[] | null;
}

export function KeywordPanel({ articleId, initialKeyword, onKeywordChange, analysisContent, autoLookup, initialSecondaryKeywords }: Props) {
  const [keyword, setKeyword] = useState(initialKeyword ?? "");
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [canniResult, setCanniResult] = useState<CannibalizationResult | null>(null);
  const [canniLoading, setCanniLoading] = useState(false);
  const [canniError, setCanniError] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoLookupDoneRef = useRef(false);

  // Auto-trigger lookup on mount when coming from chat flow
  useEffect(() => {
    if (!autoLookup || !keyword.trim() || autoLookupDoneRef.current) return;
    autoLookupDoneRef.current = true;
    handleLookup();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scheduleKeywordSave = useCallback(
    (value: string) => {
      onKeywordChange(value);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        await fetch(`/api/articles/${articleId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetKeyword: value || null }),
        });
      }, 1500);
    },
    [articleId, onKeywordChange]
  );

  function handleKeywordChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setKeyword(val);
    scheduleKeywordSave(val);
  }

  async function runCannibalizationCheck(kw: string) {
    setCanniLoading(true);
    setCanniError(false);
    setCanniResult(null);
    try {
      const res = await fetch("/api/cannibalization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: kw, articleId }),
      });
      if (!res.ok) throw new Error();
      setCanniResult(await res.json());
    } catch {
      setCanniError(true);
    } finally {
      setCanniLoading(false);
    }
  }

  async function handleLookup() {
    if (!keyword.trim()) return;
    setLookupLoading(true);
    setLookupError(null);
    setLookupResult(null);
    setCanniResult(null);
    setCanniError(false);
    try {
      const res = await fetch("/api/keywords/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: keyword.trim() }),
      });
      if (!res.ok) throw new Error();
      setLookupResult(await res.json());
      runCannibalizationCheck(keyword.trim());
    } catch {
      setLookupError("Lookup failed — check your API key");
    } finally {
      setLookupLoading(false);
    }
  }

  const ov = lookupResult?.overview;

  return (
    <div className="flex flex-col h-full overflow-y-auto px-4 py-5 gap-5">

      {/* ── Target keyword lookup ── */}
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Keyword Research</p>

      <div className="flex gap-2">
        <input type="text" value={keyword} onChange={handleKeywordChange}
          onKeyDown={(e) => e.key === "Enter" && handleLookup()}
          placeholder="Enter target keyword"
          className="flex-1 min-w-0 text-sm border border-gray-200 rounded-md px-2.5 py-1.5 outline-none focus:border-gray-400 placeholder-gray-300"
        />
        <button onClick={handleLookup} disabled={lookupLoading || !keyword.trim()}
          className="shrink-0 text-xs font-medium bg-gray-900 text-white rounded-md px-3 py-1.5 hover:bg-gray-700 disabled:opacity-40 disabled:pointer-events-none transition-colors">
          Look up
        </button>
      </div>

      {lookupLoading && <KeywordSkeleton />}
      {lookupError && <p className="text-xs text-red-500">{lookupError}</p>}

      {/* Secondary keywords from chat research (no Ahrefs lookup needed) */}
      {initialSecondaryKeywords && initialSecondaryKeywords.length > 0 && !lookupResult && !lookupLoading && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Secondary keywords from research</p>
          <div className="rounded-md border border-gray-100 divide-y divide-gray-50">
            {initialSecondaryKeywords.map((kw, i) => (
              <div key={i} className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                <span className="text-xs text-gray-700 truncate">{kw.keyword}</span>
                <div className="flex items-center gap-2 shrink-0">
                  {kw.volume != null && kw.volume > 0 && (
                    <span className="text-[10px] text-gray-400">{fmt(kw.volume)}</span>
                  )}
                  {kw.kd != null && kw.kd > 0 && (
                    <DifficultyBadge value={kw.kd} />
                  )}
                  {kw.intent && (
                    <span className="text-[10px] bg-gray-100 text-gray-500 rounded px-1 py-0.5">{kw.intent}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {lookupResult && !lookupLoading && (
        <div className="space-y-5">
          {ov && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Volume</p>
                  <p className="text-sm font-semibold text-gray-800">{fmt(ov.volume)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">KD</p>
                  <DifficultyBadge value={ov.difficulty} />
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">CPC</p>
                  <p className="text-sm font-semibold text-gray-800">
                    {ov.cpc !== null ? `$${ov.cpc.toFixed(2)}` : "—"}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Traffic potential</p>
                <p className="text-sm text-gray-700">{fmt(ov.traffic_potential)}</p>
              </div>
              {ov.serp_features.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {ov.serp_features.map((f) => (
                    <span key={f} className="text-[10px] bg-gray-100 text-gray-500 rounded px-1.5 py-0.5">
                      {f.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {lookupResult.relatedTerms.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Related terms</p>
              <div className="space-y-1">
                {lookupResult.relatedTerms.map((term) => (
                  <div key={term.keyword}
                    className="flex items-center justify-between gap-2 py-1 border-b border-gray-50 last:border-0">
                    <span className="text-xs text-gray-700 truncate">{term.keyword}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-gray-400">{fmt(term.volume)}</span>
                      <DifficultyBadge value={term.difficulty} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Secondary keywords from chat (shown alongside Ahrefs data) */}
          {initialSecondaryKeywords && initialSecondaryKeywords.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Secondary keywords</p>
              <div className="rounded-md border border-gray-100 divide-y divide-gray-50">
                {initialSecondaryKeywords.map((kw, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                    <span className="text-xs text-gray-700 truncate">{kw.keyword}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      {kw.volume != null && kw.volume > 0 && (
                        <span className="text-[10px] text-gray-400">{fmt(kw.volume)}</span>
                      )}
                      {kw.kd != null && kw.kd > 0 && (
                        <DifficultyBadge value={kw.kd} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Conflict check</p>
            <CannibalizationBanner result={canniResult} loading={canniLoading} error={canniError} />
          </div>
        </div>
      )}

      {/* ── Divider ── */}
      <div className="border-t border-gray-100" />

      {/* ── Content analysis ── */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Content Analysis</p>
        <p className="text-[10px] text-gray-400">
          Auto-updates 2s after you stop typing. Click a word to expand.
        </p>
        <ContentAnalysis content={analysisContent} />
      </div>

      {/* ── Divider ── */}
      <div className="border-t border-gray-100" />

      {/* ── Writing quality ── */}
      <WritingQuality content={analysisContent} targetKeyword={keyword} />
    </div>
  );
}
