"use client";

import { useState, useRef } from "react";
import { X, Loader2, Sparkles, Check, ChevronDown, ChevronRight } from "lucide-react";
import type { DiagnosticResult } from "@/lib/content-diagnostic";

interface Props {
  articleId: string;
  scores: DiagnosticResult;
  onClose: () => void;
  onApply: (markdown: string) => void;
}

type Category = "eeat" | "geo" | "seo";

interface Changes {
  wordsAdded?: number;
  wordsRemoved?: number;
  keywordsInserted?: string[];
  improvementsApplied?: string[];
}

function ScoreBar({ label, before, after }: { label: string; before: number; after?: number }) {
  const color = (v: number) => v >= 80 ? "bg-green-500" : v >= 50 ? "bg-amber-400" : "bg-red-400";
  const textColor = (v: number) => v >= 80 ? "text-green-600" : v >= 50 ? "text-amber-600" : "text-red-500";
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="text-[10px] text-gray-500 w-16 shrink-0 truncate">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
        <div className={`h-1.5 rounded-full ${color(before)} transition-all duration-500`} style={{ width: `${before}%` }} />
      </div>
      <span className={`text-[10px] font-semibold w-6 text-right ${textColor(before)}`}>{before}</span>
      {after !== undefined && (
        <>
          <span className="text-gray-300 text-[10px]">→</span>
          <span className={`text-[10px] font-bold w-6 ${textColor(after)}`}>{after}</span>
        </>
      )}
    </div>
  );
}

function CategoryCard({ label, score, bars, selected, onToggle }: {
  id?: Category; label: string; score: number; bars: Array<{ label: string; value: number }>;
  selected: boolean; onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const scoreColor = score >= 80 ? "text-green-600" : score >= 50 ? "text-amber-600" : "text-red-500";
  return (
    <div className={`rounded-xl border transition-colors ${selected ? "border-purple-300 bg-purple-50" : "border-gray-200 bg-white"}`}>
      <div className="flex items-center gap-3 p-3">
        <input type="checkbox" checked={selected} onChange={onToggle} className="rounded accent-purple-600" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-800">{label}</span>
            <span className={`text-sm font-bold ${scoreColor}`}>{score}</span>
          </div>
        </div>
        <button onClick={() => setExpanded((v) => !v)} className="text-gray-400 hover:text-gray-600">
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
      </div>
      {expanded && (
        <div className="px-3 pb-3 space-y-0.5 border-t border-gray-100 pt-2">
          {bars.map((b) => <ScoreBar key={b.label} label={b.label} before={b.value} />)}
        </div>
      )}
    </div>
  );
}

function simpleDiff(oldText: string, newText: string): Array<{ text: string; type: "same" | "add" | "remove" }> {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const result: Array<{ text: string; type: "same" | "add" | "remove" }> = [];
  const maxLines = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < Math.min(maxLines, 80); i++) {
    const o = oldLines[i];
    const n = newLines[i];
    if (o === n) {
      if (o !== undefined) result.push({ text: o, type: "same" });
    } else {
      if (o !== undefined) result.push({ text: o, type: "remove" });
      if (n !== undefined) result.push({ text: n, type: "add" });
    }
  }
  if (maxLines > 80) result.push({ text: `… ${maxLines - 80} more lines`, type: "same" });
  return result;
}

export function DiagnosticModal({ articleId, scores, onClose, onApply }: Props) {
  const [selected, setSelected] = useState<Set<Category>>(new Set<Category>(["eeat", "geo", "seo"]));
  const [phase, setPhase] = useState<"select" | "streaming" | "diff">("select");
  const [streamText, setStreamText] = useState("");
  const [articleMarkdown, setArticleMarkdown] = useState("");
  const [changes, setChanges] = useState<Changes>({});
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  function toggle(cat: Category) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  }

  async function runRewrite() {
    if (selected.size === 0) return;
    setPhase("streaming");
    setStreamText("");
    setError("");
    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/content/improve-scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortRef.current.signal,
        body: JSON.stringify({
          articleId,
          categories: Array.from(selected),
          currentScores: { eeat: scores.eeat.score, geo: scores.geo.score, seo: scores.seo.score },
        }),
      });

      const reader = res.body?.getReader();
      const dec = new TextDecoder();
      if (!reader) throw new Error("No stream");

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += dec.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const event of events) {
          const dataLine = event.split("\n").find((l) => l.startsWith("data: "));
          if (!dataLine) continue;
          try {
            const payload = JSON.parse(dataLine.slice(6)) as { type?: string; text?: string; articleMarkdown?: string; changes?: Changes; message?: string };
            if (payload.text) {
              setStreamText((p) => p + payload.text);
            } else if (payload.articleMarkdown) {
              setArticleMarkdown(payload.articleMarkdown);
              setChanges(payload.changes ?? {});
              setPhase("diff");
            } else if (payload.message) {
              setError(payload.message);
              setPhase("select");
            }
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(String(err));
        setPhase("select");
      }
    }
  }

  const categories: Array<{ id: Category; label: string; score: number; bars: Array<{ label: string; value: number }> }> = [
    { id: "eeat", label: "EEAT — Experience, Expertise, Authority, Trust", score: scores.eeat.score, bars: [{ label: "Trust", value: scores.eeat.trust }, { label: "Expertise", value: scores.eeat.expertise }, { label: "Authority", value: scores.eeat.authority }] },
    { id: "geo", label: "GEO — Generative Engine Optimization", score: scores.geo.score, bars: [{ label: "Quotability", value: scores.geo.quotability }, { label: "Structure", value: scores.geo.structure }, { label: "Definitions", value: scores.geo.definitions }] },
    { id: "seo", label: "SEO — Search Engine Optimization", score: scores.seo.score, bars: [{ label: "Keywords", value: scores.seo.keywords }, { label: "Meta tags", value: scores.seo.metaTags }, { label: "Structure", value: scores.seo.structure }] },
  ];

  const diffLines = phase === "diff" ? simpleDiff("", articleMarkdown) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-bold text-gray-900">Content Diagnostic</h2>
            <p className="text-xs text-gray-400">Select which areas to improve with AI</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={15} className="text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {phase === "select" && (
            <div className="space-y-3">
              {categories.map((cat) => (
                <CategoryCard key={cat.id} {...cat} selected={selected.has(cat.id)} onToggle={() => toggle(cat.id)} />
              ))}
              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>
          )}

          {phase === "streaming" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Loader2 size={14} className="animate-spin text-purple-500" />
                Improving content…
              </div>
              <div className="bg-gray-50 rounded-xl p-4 font-mono text-[11px] text-gray-700 max-h-64 overflow-y-auto whitespace-pre-wrap">
                {streamText || "Generating…"}
              </div>
            </div>
          )}

          {phase === "diff" && (
            <div className="space-y-4">
              {/* Changes summary */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-green-50 rounded-xl p-3">
                  <p className="text-xs font-semibold text-green-800">Words added</p>
                  <p className="text-lg font-bold text-green-700">+{changes.wordsAdded ?? 0}</p>
                </div>
                <div className="bg-red-50 rounded-xl p-3">
                  <p className="text-xs font-semibold text-red-800">Words removed</p>
                  <p className="text-lg font-bold text-red-700">−{changes.wordsRemoved ?? 0}</p>
                </div>
              </div>

              {/* Improvements applied */}
              {(changes.improvementsApplied ?? []).length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Changes made</p>
                  <ul className="space-y-1">
                    {changes.improvementsApplied!.map((item, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Check size={11} className="text-green-500 mt-0.5 shrink-0" />
                        <span className="text-xs text-gray-600">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Diff view */}
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Preview</p>
                <div className="bg-gray-50 rounded-xl p-3 max-h-56 overflow-y-auto text-[11px] font-mono space-y-0.5">
                  {diffLines.filter((l) => l.type !== "same" || l.text.trim()).slice(0, 60).map((line, i) => (
                    <div
                      key={i}
                      className={`px-1 rounded leading-relaxed ${line.type === "add" ? "bg-green-100 text-green-800" : line.type === "remove" ? "bg-red-100 text-red-700 line-through" : "text-gray-600"}`}
                    >
                      {line.type === "add" ? "+ " : line.type === "remove" ? "− " : "  "}{line.text || " "}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
          {phase === "select" && (
            <>
              <span className="text-xs text-gray-400">{selected.size} categor{selected.size === 1 ? "y" : "ies"} selected</span>
              <div className="flex gap-2">
                <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">Cancel</button>
                <button
                  onClick={runRewrite}
                  disabled={selected.size === 0}
                  className="flex items-center gap-2 px-5 py-2 bg-purple-600 text-white text-sm font-semibold rounded-xl hover:bg-purple-700 disabled:opacity-50 transition-colors"
                >
                  <Sparkles size={13} /> AI Rewrite
                </button>
              </div>
            </>
          )}
          {phase === "streaming" && (
            <>
              <span className="text-xs text-gray-400">This may take 15–30 seconds…</span>
              <button onClick={() => { abortRef.current?.abort(); setPhase("select"); }} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">Cancel</button>
            </>
          )}
          {phase === "diff" && (
            <>
              <button onClick={() => setPhase("select")} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">Discard</button>
              <button
                onClick={() => onApply(articleMarkdown)}
                className="flex items-center gap-2 px-5 py-2 bg-green-600 text-white text-sm font-semibold rounded-xl hover:bg-green-700 transition-colors"
              >
                <Check size={13} /> Apply changes
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
