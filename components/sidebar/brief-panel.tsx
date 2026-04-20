"use client";

import { useEffect, useRef, useState } from "react";
import { OutlineEditor } from "./outline-editor";
import type { OutlineItem } from "@/lib/outline-types";
import type { GptQuery } from "@/lib/gpt-queries";
import type { GeoQuestion, AeoQuestion } from "@/lib/geo-aeo";
import type { RevampAnalysis } from "@/app/api/brief/revamp-analysis/route";

interface Competitor {
  url: string;
  title: string;
  wordCount: number;
  headings: string[];
}

interface AiOutlineSection {
  heading: string;
  notes: string;
  wordTarget: number;
}

interface AiOutline {
  intro: string;
  sections: AiOutlineSection[];
  conclusion: string;
  totalWordTarget: number;
}

interface BriefData {
  id: string;
  keyword: string;
  competitors: Competitor[];
  competitorAvgWords: number;
  outline: AiOutline | null;
  editableOutline: OutlineItem[] | null;
  paaQuestions: string[] | null;
  gptQueries: GptQuery[] | null;
  geoQuestions: GeoQuestion[] | null;
  aeoQuestions: AeoQuestion[] | null;
  revampAnalysis: RevampAnalysis | null;
  status: string;
}

interface ChatCompetitor {
  url: string;
  title: string;
  wordCount?: number;
  keyPoints?: string[];
}

interface ChatOutlineItem {
  id: string;
  level: 2 | 3;
  text: string;
  type: string;
}

interface Props {
  articleId: string;
  keyword: string;
  revampUrl?: string | null;
  isRevamp?: boolean;
  onCompetitorAvgWords: (words: number | null) => void;
  onInjectContent?: (blocks: unknown[]) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialChatOutline?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialChatResearchState?: any;
}

function deriveItems(aiOutline: AiOutline): OutlineItem[] {
  return aiOutline.sections.map((s) => ({
    id: crypto.randomUUID(),
    level: 2 as const,
    text: s.heading,
    locked: false,
    guidance: s.notes,
    seoType: "seo" as const,
  }));
}

const SOURCE_LABEL: Record<string, string> = { reddit: "Reddit", paa: "PAA", ai: "AI" };
const SOURCE_CLS: Record<string, string> = {
  reddit: "bg-orange-100 text-orange-700",
  paa: "bg-blue-100 text-blue-700",
  ai: "bg-teal-100 text-teal-700",
};

export function BriefPanel({ articleId, keyword, revampUrl, isRevamp, onCompetitorAvgWords, onInjectContent, initialChatOutline, initialChatResearchState }: Props) {
  const [brief, setBrief] = useState<BriefData | null>(null);
  const [fetching, setFetching] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState("Generating…");
  const [generated, setGenerated] = useState(false);
  const [streamPreview, setStreamPreview] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [revampLoading, setRevampLoading] = useState(false);

  // Outline items managed here (controlled)
  const [outlineItems, setOutlineItems] = useState<OutlineItem[] | null>(null);

  // Checklist state for queries
  const [checkedGpt, setCheckedGpt] = useState<Set<string>>(new Set());
  const [checkedGeo, setCheckedGeo] = useState<Set<string>>(new Set());
  const [checkedAeo, setCheckedAeo] = useState<Set<string>>(new Set());

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const outlineSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevRevampUrl = useRef<string | null | undefined>(null);

  useEffect(() => {
    // If chat research state is available, pre-populate without needing a DB brief
    if (initialChatResearchState && initialChatOutline) {
      const chatState = initialChatResearchState as {
        competitorData?: ChatCompetitor[];
        primaryKeyword?: string;
      };
      const chatOutline = initialChatOutline as ChatOutlineItem[];
      const chatCompetitors = chatState.competitorData ?? [];

      // Convert chat outline to OutlineItem format
      const outlineItems: OutlineItem[] = chatOutline.map((item) => ({
        id: item.id || crypto.randomUUID(),
        level: item.level as 2 | 3,
        text: item.text,
        locked: false,
        seoType: (["seo", "geo", "aeo", "gpt"].includes(item.type) ? item.type : "seo") as OutlineItem["seoType"],
      }));
      setOutlineItems(outlineItems);

      // Build synthetic competitor data
      const avgWords = chatCompetitors.length > 0
        ? Math.round(chatCompetitors.reduce((sum, c) => sum + (c.wordCount ?? 1500), 0) / chatCompetitors.length)
        : 1500;
      onCompetitorAvgWords(avgWords);

      // Fetch from DB to check if a real brief exists; merge if so
      fetch(`/api/brief/fetch?articleId=${articleId}`)
        .then((r) => r.json())
        .then((data: BriefData | null) => {
          if (data) {
            setBrief(data);
            if (data.status === "fetching") startPolling(data.id);
            // Only override outline items if DB has a real editable outline
            if (data.editableOutline) setOutlineItems(data.editableOutline);
          }
        })
        .catch(() => {});
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
        if (outlineSaveTimer.current) clearTimeout(outlineSaveTimer.current);
      };
    }

    fetch(`/api/brief/fetch?articleId=${articleId}`)
      .then((r) => r.json())
      .then((data: BriefData | null) => {
        if (data) {
          setBrief(data);
          onCompetitorAvgWords(data.competitorAvgWords || null);
          if (data.status === "fetching") startPolling(data.id);
          const items = data.editableOutline ?? (data.outline ? deriveItems(data.outline) : null);
          setOutlineItems(items);
        }
      })
      .catch(() => {});
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (outlineSaveTimer.current) clearTimeout(outlineSaveTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId]);

  // Trigger revamp analysis when revampUrl changes and brief is ready
  useEffect(() => {
    if (!revampUrl || revampUrl === prevRevampUrl.current) return;
    prevRevampUrl.current = revampUrl;
    if (!brief || brief.status !== "ready") return;
    if (brief.revampAnalysis) return;
    handleRevampAnalysis(revampUrl);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revampUrl, brief?.id, brief?.status]);

  function startPolling(briefId: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const r = await fetch(`/api/brief/fetch?briefId=${briefId}`);
      const data: BriefData = await r.json();
      if (data.status !== "fetching") {
        setBrief(data);
        onCompetitorAvgWords(data.competitorAvgWords || null);
        clearInterval(pollRef.current!);
      }
    }, 3000);
  }

  function handleOutlineChange(items: OutlineItem[]) {
    setOutlineItems(items);
    if (!brief) return;
    if (outlineSaveTimer.current) clearTimeout(outlineSaveTimer.current);
    outlineSaveTimer.current = setTimeout(() => {
      fetch("/api/brief/save-outline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ briefId: brief.id, outline: items }),
      }).catch(() => {});
    }, 500);
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
      setBrief({ id: data.briefId, keyword, competitors: [], competitorAvgWords: 0, outline: null, editableOutline: null, paaQuestions: null, gptQueries: null, geoQuestions: null, aeoQuestions: null, revampAnalysis: null, status: "fetching" });
      setOutlineItems(null);
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
        for (const chunk of text.split("\n\n")) {
          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data:")) continue;
            try {
              const payload = JSON.parse(line.slice(5).trim());
              if (payload.outline) {
                const items = deriveItems(payload.outline as AiOutline);
                setOutlineItems(items);
                await fetch("/api/brief/save-outline", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ briefId: brief.id, outline: items }),
                });
                setBrief((prev) => prev ? {
                  ...prev,
                  outline: payload.outline,
                  editableOutline: items,
                  gptQueries: payload.gptQueries ?? prev.gptQueries,
                  geoQuestions: payload.geoQuestions ?? prev.geoQuestions,
                  aeoQuestions: payload.aeoQuestions ?? prev.aeoQuestions,
                } : prev);
              }
            } catch { /* ignore */ }
          }
        }
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleGenerateContent() {
    if (!brief) return;
    setGenerating(true);
    setGenerationStatus("Writing article…");
    setStreamPreview("");
    setError(null);

    try {
      const res = await fetch("/api/content/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId, briefId: brief.id }),
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
              if (payload.message) setGenerationStatus(payload.message);
              if (payload.text) setStreamPreview((p) => p + payload.text);
              if (payload.blocks) {
                onInjectContent?.(payload.blocks);
                setGenerated(true);
                setStreamPreview("");
                setGenerationStatus("Draft complete");
              }
            } catch { /* ignore */ }
          }
        }
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setGenerating(false);
    }
  }

  async function handleRevampAnalysis(url: string) {
    setRevampLoading(true);
    try {
      const res = await fetch("/api/brief/revamp-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId, existingUrl: url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed");
      setBrief((prev) => prev ? { ...prev, revampAnalysis: data.analysis } : prev);
    } catch (e) {
      setError(String(e));
    } finally {
      setRevampLoading(false);
    }
  }

  function addGptToOutline() {
    const unchecked = (brief?.gptQueries ?? []).filter((q) => !checkedGpt.has(q.text));
    const newItems: OutlineItem[] = unchecked.map((q) => ({
      id: crypto.randomUUID(),
      level: 3 as const,
      text: q.text,
      locked: false,
      seoType: "gpt" as const,
    }));
    const updated = [...(outlineItems ?? []), ...newItems];
    handleOutlineChange(updated);
  }

  function addGeoAeoToOutline(type: "geo" | "aeo") {
    if (type === "geo") {
      const unchecked = (brief?.geoQuestions ?? []).filter((q) => !checkedGeo.has(q.question));
      const newItems: OutlineItem[] = unchecked.map((q) => ({
        id: crypto.randomUUID(),
        level: 3 as const,
        text: q.question,
        locked: false,
        guidance: q.rationale,
        seoType: "geo" as const,
      }));
      handleOutlineChange([...(outlineItems ?? []), ...newItems]);
    } else {
      const unchecked = (brief?.aeoQuestions ?? []).filter((q) => !checkedAeo.has(q.question));
      const newItems: OutlineItem[] = unchecked.map((q) => ({
        id: crypto.randomUUID(),
        level: 3 as const,
        text: q.question,
        locked: false,
        guidance: `Write a direct ${q.format} answer in under 50 words for featured snippet targeting.`,
        seoType: "aeo" as const,
      }));
      handleOutlineChange([...(outlineItems ?? []), ...newItems]);
    }
  }

  function applyRevampOutline() {
    if (!brief?.revampAnalysis) return;
    const { recommendedOrder, newHeadings, remove } = brief.revampAnalysis;
    const newHeadingMap = new Map(newHeadings.map((h) => [h.text.toLowerCase(), h]));
    const removeSet = new Set(remove.map((r) => r.toLowerCase()));

    const items: OutlineItem[] = recommendedOrder.map((text) => {
      const existing = newHeadingMap.get(text.toLowerCase());
      return {
        id: crypto.randomUUID(),
        level: 2 as const,
        text,
        locked: false,
        seoType: existing ? (existing.type as "seo" | "geo" | "aeo") : "seo",
        guidance: existing?.reason,
        isNew: !!existing,
        markedForRemoval: removeSet.has(text.toLowerCase()),
      };
    });

    handleOutlineChange(items);
  }

  // --- Render ---

  if (!brief) {
    // If we have chat research state, show pre-loaded view with competitor data
    if (initialChatResearchState && outlineItems) {
      const chatState = initialChatResearchState as {
        competitorData?: ChatCompetitor[];
        primaryKeyword?: string;
        topic?: string;
      };
      const competitors = chatState.competitorData ?? [];

      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Article Brief</p>
            <span className="text-[10px] bg-green-100 text-green-700 rounded-full px-2 py-0.5 font-medium">From chat</span>
          </div>

          {/* Competitor overview from chat */}
          {competitors.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Competitor analysis</p>
              {competitors.slice(0, 4).map((c, i) => (
                <div key={i} className="rounded-md border border-gray-100 p-2.5 space-y-1.5">
                  <a href={c.url} target="_blank" rel="noopener noreferrer"
                    className="text-[11px] font-medium text-blue-600 hover:underline truncate block">
                    {c.title || c.url}
                  </a>
                  {c.wordCount && (
                    <span className="text-[10px] text-gray-400">{c.wordCount.toLocaleString()} words</span>
                  )}
                  {c.keyPoints && c.keyPoints.length > 0 && (
                    <ul className="space-y-0.5">
                      {c.keyPoints.slice(0, 3).map((pt, j) => (
                        <li key={j} className="text-[10px] text-gray-500 pl-2 border-l border-gray-100">
                          {pt}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Outline editor pre-loaded from chat */}
          {outlineItems && outlineItems.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Outline from chat</p>
              <OutlineEditor
                items={outlineItems}
                onItemsChange={handleOutlineChange}
                onGenerateContent={handleGenerateContent}
                generating={generating}
                generationStatus={generationStatus}
                generated={generated}
              />
            </div>
          )}

          {/* Allow generating a full brief to get more data */}
          {keyword.trim() && (
            <button onClick={handleFetchBrief} disabled={fetching} className="w-full text-xs text-gray-500 border border-gray-200 rounded-md px-3 py-2 hover:bg-gray-50 transition-colors">
              {fetching ? "Fetching…" : "Load full brief from Ahrefs"}
            </button>
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Article Brief</p>
        {!keyword.trim() && <p className="text-[11px] text-gray-400">Set a target keyword first.</p>}
        {keyword.trim() && (
          <button onClick={handleFetchBrief} disabled={fetching} className="w-full text-xs font-medium bg-gray-900 text-white rounded-md px-3 py-2 hover:bg-gray-700 disabled:opacity-40 transition-colors">
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
          <p className="text-[11px] text-gray-400">Scraping competitors for &ldquo;{brief.keyword}&rdquo;…</p>
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-2.5 bg-gray-100 rounded" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Article Brief</p>
        <button onClick={handleFetchBrief} disabled={fetching} className="text-[10px] text-gray-400 hover:text-gray-700 underline">
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

      {/* Revamp analysis */}
      {isRevamp && revampUrl && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Page gap analysis</p>
          {revampLoading && <p className="text-[11px] text-gray-400 animate-pulse">Analyzing existing page…</p>}
          {!brief.revampAnalysis && !revampLoading && (
            <button onClick={() => handleRevampAnalysis(revampUrl)} className="w-full text-xs font-medium border border-gray-200 rounded-md px-3 py-2 text-gray-700 hover:bg-gray-50 transition-colors">
              Run gap analysis
            </button>
          )}
          {brief.revampAnalysis && (
            <div className="space-y-2">
              {brief.revampAnalysis.strengths.length > 0 && (
                <div className="rounded-md bg-green-50 px-2.5 py-2 space-y-0.5">
                  <p className="text-[9px] font-semibold text-green-700 uppercase tracking-wide">✓ Strengths</p>
                  {brief.revampAnalysis.strengths.map((s, i) => <p key={i} className="text-[10px] text-green-800">• {s}</p>)}
                </div>
              )}
              {brief.revampAnalysis.missing.length > 0 && (
                <div className="rounded-md bg-red-50 px-2.5 py-2 space-y-0.5">
                  <p className="text-[9px] font-semibold text-red-700 uppercase tracking-wide">✗ Missing</p>
                  {brief.revampAnalysis.missing.map((s, i) => <p key={i} className="text-[10px] text-red-800">• {s}</p>)}
                </div>
              )}
              {brief.revampAnalysis.thin.length > 0 && (
                <div className="rounded-md bg-amber-50 px-2.5 py-2 space-y-0.5">
                  <p className="text-[9px] font-semibold text-amber-700 uppercase tracking-wide">⚠ Thin sections</p>
                  {brief.revampAnalysis.thin.map((s, i) => <p key={i} className="text-[10px] text-amber-800">• {s}</p>)}
                </div>
              )}
              {brief.revampAnalysis.newHeadings.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide">+ New headings to add</p>
                  {brief.revampAnalysis.newHeadings.map((h, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <span className={`text-[9px] font-semibold px-1 py-0.5 rounded flex-shrink-0 mt-0.5 ${h.type === "geo" ? "bg-purple-100 text-purple-700" : h.type === "aeo" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>{h.type.toUpperCase()}</span>
                      <div>
                        <p className="text-[11px] font-medium text-gray-700">{h.text}</p>
                        <p className="text-[10px] text-gray-400">{h.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={applyRevampOutline} className="w-full text-xs font-medium bg-gray-900 text-white rounded-md px-3 py-1.5 hover:bg-gray-700 transition-colors">
                Apply recommended outline
              </button>
            </div>
          )}
        </div>
      )}

      {/* PAA */}
      {brief.paaQuestions && brief.paaQuestions.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">People also ask</p>
          {brief.paaQuestions.map((q, i) => <p key={i} className="text-[11px] text-gray-600 leading-snug">• {q}</p>)}
        </div>
      )}

      {/* AI search queries (GPT) */}
      {brief.gptQueries && brief.gptQueries.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">AI search queries</p>
          <p className="text-[9px] text-gray-400">Proxies for what people ask AI tools — not direct ChatGPT ranking data.</p>
          {brief.gptQueries.map((q, i) => (
            <label key={i} className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={checkedGpt.has(q.text)}
                onChange={(e) => {
                  const next = new Set(checkedGpt);
                  if (e.target.checked) next.add(q.text); else next.delete(q.text);
                  setCheckedGpt(next);
                }}
                className="mt-0.5 flex-shrink-0"
              />
              <span className="flex-1 text-[11px] text-gray-600 leading-snug">{q.text}</span>
              <span className={`text-[9px] font-semibold px-1 py-0.5 rounded flex-shrink-0 ${SOURCE_CLS[q.source] ?? ""}`}>
                {SOURCE_LABEL[q.source] ?? q.source}
              </span>
            </label>
          ))}
          <button
            onClick={addGptToOutline}
            disabled={!outlineItems}
            className="text-[10px] text-teal-600 hover:text-teal-800 underline disabled:opacity-40"
          >
            Add unchecked to outline
          </button>
        </div>
      )}

      {/* GEO & AEO */}
      {((brief.geoQuestions && brief.geoQuestions.length > 0) || (brief.aeoQuestions && brief.aeoQuestions.length > 0)) && (
        <div className="space-y-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">GEO & AEO</p>

          {brief.geoQuestions && brief.geoQuestions.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[9px] font-semibold text-purple-600 uppercase tracking-wide">GEO — AI-generated answers</p>
              {brief.geoQuestions.map((q, i) => (
                <label key={i} className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checkedGeo.has(q.question)}
                    onChange={(e) => {
                      const next = new Set(checkedGeo);
                      if (e.target.checked) next.add(q.question); else next.delete(q.question);
                      setCheckedGeo(next);
                    }}
                    className="mt-0.5 flex-shrink-0"
                  />
                  <div className="flex-1">
                    <p className="text-[11px] text-gray-700">{q.question}</p>
                    <p className="text-[10px] text-gray-400">{q.rationale}</p>
                  </div>
                  <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-purple-100 text-purple-700 flex-shrink-0">GEO</span>
                </label>
              ))}
              <button onClick={() => addGeoAeoToOutline("geo")} disabled={!outlineItems} className="text-[10px] text-purple-600 hover:text-purple-800 underline disabled:opacity-40">
                Add unchecked to outline
              </button>
            </div>
          )}

          {brief.aeoQuestions && brief.aeoQuestions.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[9px] font-semibold text-green-600 uppercase tracking-wide">AEO — Featured snippets</p>
              {brief.aeoQuestions.map((q, i) => (
                <label key={i} className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checkedAeo.has(q.question)}
                    onChange={(e) => {
                      const next = new Set(checkedAeo);
                      if (e.target.checked) next.add(q.question); else next.delete(q.question);
                      setCheckedAeo(next);
                    }}
                    className="mt-0.5 flex-shrink-0"
                  />
                  <div className="flex-1">
                    <p className="text-[11px] text-gray-700">{q.question}</p>
                  </div>
                  <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-gray-100 text-gray-600 flex-shrink-0 capitalize">{q.format}</span>
                  <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-green-100 text-green-700 flex-shrink-0">AEO</span>
                </label>
              ))}
              <button onClick={() => addGeoAeoToOutline("aeo")} disabled={!outlineItems} className="text-[10px] text-green-600 hover:text-green-800 underline disabled:opacity-40">
                Add unchecked to outline
              </button>
            </div>
          )}
        </div>
      )}

      {/* Outline or generate-outline button */}
      {outlineItems ? (
        <OutlineEditor
          items={outlineItems}
          onItemsChange={handleOutlineChange}
          onGenerateContent={handleGenerateContent}
          generating={generating}
          generationStatus={generationStatus}
          generated={generated}
        />
      ) : (
        <button onClick={handleAnalyze} disabled={analyzing} className="w-full text-xs font-medium bg-gray-900 text-white rounded-md px-3 py-2 hover:bg-gray-700 disabled:opacity-40 transition-colors">
          {analyzing ? "Generating outline…" : "Generate outline with AI"}
        </button>
      )}

      {streamPreview && (
        <div className="mt-2 p-2 bg-gray-50 rounded-md border border-gray-100 max-h-40 overflow-y-auto">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Generating…</p>
          <pre className="text-[10px] text-gray-500 whitespace-pre-wrap font-sans leading-relaxed">{streamPreview}</pre>
        </div>
      )}

      {generated && !streamPreview && (
        <p className="text-[11px] text-green-600 font-medium">Draft complete — content loaded into editor</p>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
