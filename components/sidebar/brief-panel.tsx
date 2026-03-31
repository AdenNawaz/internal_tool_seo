"use client";

import { useEffect, useRef, useState } from "react";

interface Competitor {
  url: string;
  title: string;
  wordCount: number;
  headings: string[];
}

interface OutlineSection {
  heading: string;
  notes: string;
  wordTarget: number;
}

interface Outline {
  intro: string;
  sections: OutlineSection[];
  conclusion: string;
  totalWordTarget: number;
}

interface BriefData {
  id: string;
  keyword: string;
  competitors: Competitor[];
  competitorAvgWords: number;
  outline: Outline | null;
  paaQuestions: string[] | null;
  status: string;
}

interface Props {
  articleId: string;
  keyword: string;
  onCompetitorAvgWords: (words: number | null) => void;
}

export function BriefPanel({ articleId, keyword, onCompetitorAvgWords }: Props) {
  const [brief, setBrief] = useState<BriefData | null>(null);
  const [fetching, setFetching] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load existing brief on mount
  useEffect(() => {
    fetch(`/api/brief/fetch?articleId=${articleId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data) {
          setBrief(data);
          onCompetitorAvgWords(data.competitorAvgWords || null);
          if (data.status === "fetching") startPolling(data.id);
        }
      })
      .catch(() => {});
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId]);

  function startPolling(briefId: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const r = await fetch(`/api/brief/fetch?briefId=${briefId}`);
      const data = await r.json();
      if (data.status !== "fetching") {
        setBrief(data);
        onCompetitorAvgWords(data.competitorAvgWords || null);
        clearInterval(pollRef.current!);
      }
    }, 3000);
  }

  async function handleFetchBrief() {
    if (!keyword.trim()) return;
    setFetching(true);
    setError(null);
    try {
      const res = await fetch("/api/brief/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId, keyword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setBrief({ id: data.briefId, keyword, competitors: [], competitorAvgWords: 0, outline: null, paaQuestions: null, status: "fetching" });
      startPolling(data.briefId);
    } catch (e) {
      setError(String(e));
    } finally {
      setFetching(false);
    }
  }

  async function handleAnalyze() {
    if (!brief) return;
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch("/api/brief/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ briefId: brief.id }),
      });

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");

      const dec = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = dec.decode(value);
        const lines = text.split("\n\n");
        for (const line of lines) {
          if (line.startsWith("data:")) {
            const payload = JSON.parse(line.slice(5).trim());
            if (payload.outline) {
              setBrief((prev) => prev ? { ...prev, outline: payload.outline } : prev);
            }
          }
        }
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setAnalyzing(false);
    }
  }

  if (!brief) {
    return (
      <div className="space-y-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Article Brief</p>
        {!keyword.trim() && (
          <p className="text-[11px] text-gray-400">Set a target keyword first.</p>
        )}
        {keyword.trim() && (
          <button
            onClick={handleFetchBrief}
            disabled={fetching}
            className="w-full text-xs font-medium bg-gray-900 text-white rounded-md px-3 py-2 hover:bg-gray-700 disabled:opacity-40 transition-colors"
          >
            {fetching ? "Starting…" : "Generate brief"}
          </button>
        )}
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }

  if (brief.status === "fetching") {
    return (
      <div className="space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Article Brief</p>
        <div className="animate-pulse space-y-2">
          <p className="text-[11px] text-gray-400">Scraping competitors for "{brief.keyword}"…</p>
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-2.5 bg-gray-100 rounded" />)}
        </div>
      </div>
    );
  }

  const outline = brief.outline;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Article Brief</p>
        <button
          onClick={handleFetchBrief}
          disabled={fetching}
          className="text-[10px] text-gray-400 hover:text-gray-700 underline"
        >
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md bg-gray-50 px-2.5 py-2">
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Competitors</p>
          <p className="text-sm font-semibold text-gray-800">{brief.competitors.length}</p>
        </div>
        <div className="rounded-md bg-gray-50 px-2.5 py-2">
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Avg words</p>
          <p className="text-sm font-semibold text-gray-800">{brief.competitorAvgWords.toLocaleString()}</p>
        </div>
      </div>

      {/* PAA */}
      {brief.paaQuestions && brief.paaQuestions.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">People also ask</p>
          {brief.paaQuestions.map((q, i) => (
            <p key={i} className="text-[11px] text-gray-600 leading-snug">• {q}</p>
          ))}
        </div>
      )}

      {/* Outline or generate button */}
      {!outline ? (
        <button
          onClick={handleAnalyze}
          disabled={analyzing}
          className="w-full text-xs font-medium bg-gray-900 text-white rounded-md px-3 py-2 hover:bg-gray-700 disabled:opacity-40 transition-colors"
        >
          {analyzing ? "Generating outline…" : "Generate outline with AI"}
        </button>
      ) : (
        <div className="space-y-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
            Outline · ~{outline.totalWordTarget.toLocaleString()} words
          </p>
          <div className="space-y-0.5">
            <p className="text-[11px] text-gray-500 italic">Intro: {outline.intro}</p>
          </div>
          {outline.sections.map((s, i) => (
            <div key={i} className="border-l-2 border-gray-100 pl-2.5 space-y-0.5">
              <p className="text-xs font-medium text-gray-700">{s.heading}</p>
              <p className="text-[11px] text-gray-500">{s.notes}</p>
              <p className="text-[10px] text-gray-400">~{s.wordTarget} words</p>
            </div>
          ))}
          <p className="text-[11px] text-gray-500 italic">Conclusion: {outline.conclusion}</p>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
