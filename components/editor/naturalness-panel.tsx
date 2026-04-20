"use client";

import { useState } from "react";
import { Loader2, X, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import type { NaturalnessFlag, NaturalnessResult } from "@/app/api/content/review-naturalness/route";
import type { EditorAPI } from "./blocknote-editor";

interface Props {
  articleId: string;
  editorApi: EditorAPI | null;
  content: unknown;
  onClose: () => void;
  onTextReplaced: () => void;
}

function scoreLabel(score: number): { label: string; color: string; bg: string } {
  if (score >= 90) return { label: "Reads naturally", color: "text-green-700", bg: "bg-green-50 border-green-200" };
  if (score >= 70) return { label: "Minor issues", color: "text-amber-700", bg: "bg-amber-50 border-amber-200" };
  if (score >= 50) return { label: "Needs work", color: "text-orange-700", bg: "bg-orange-50 border-orange-200" };
  return { label: "Heavy editing needed", color: "text-red-700", bg: "bg-red-50 border-red-200" };
}

function severityIcon(severity: string) {
  if (severity === "high") return <XCircle size={12} className="text-red-500 shrink-0 mt-0.5" />;
  if (severity === "medium") return <AlertTriangle size={12} className="text-amber-500 shrink-0 mt-0.5" />;
  return <AlertTriangle size={12} className="text-gray-400 shrink-0 mt-0.5" />;
}

function estimateScoreDelta(severity: string): number {
  return severity === "high" ? 8 : severity === "medium" ? 4 : 2;
}

export function NaturalnessPanel({ articleId, editorApi, content, onClose, onTextReplaced }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<NaturalnessResult | null>(null);
  const [flags, setFlags] = useState<(NaturalnessFlag & { dismissed: boolean; applied: boolean })[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState(0);

  async function runReview() {
    setLoading(true);
    setError(null);
    setResult(null);
    setFlags([]);
    try {
      const res = await fetch("/api/content/review-naturalness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId, content }),
      });
      const data = await res.json() as NaturalnessResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Review failed");
      setResult(data);
      setScore(data.overallScore);
      setFlags(data.flags.map(f => ({ ...f, dismissed: false, applied: false })));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  function applyFix(idx: number) {
    const flag = flags[idx];
    if (!flag || flag.applied || flag.dismissed) return;

    // Find and replace text in editor via DOM manipulation on the BlockNote content
    // BlockNote doesn't expose a direct text search API, so we use the editor's replaceSection
    // For text replacement, we do a global search using the replaceContent approach
    // Actually: we replace in the raw content if the editor API supports it
    // The cleanest approach: rebuild content blocks with text replaced
    const newContent = replaceTextInContent(content, flag.originalText, flag.suggestion);
    if (newContent) {
      editorApi?.replaceContent(newContent);
      onTextReplaced();
    }

    setFlags(prev => prev.map((f, i) => i === idx ? { ...f, applied: true } : f));
    setScore(prev => Math.min(100, prev + estimateScoreDelta(flag.severity)));
  }

  function dismissFlag(idx: number) {
    const flag = flags[idx];
    setFlags(prev => prev.map((f, i) => i === idx ? { ...f, dismissed: true } : f));
    setScore(prev => Math.min(100, prev + Math.floor(estimateScoreDelta(flag.severity) / 2)));
  }

  const activeFlags = flags.filter(f => !f.dismissed && !f.applied);
  const resolvedCount = flags.filter(f => f.dismissed || f.applied).length;
  const sl = scoreLabel(score);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
        <p className="text-xs font-semibold text-gray-700">Writing Review</p>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors">
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Score card */}
        {result && (
          <div className={`rounded-xl border p-4 ${sl.bg}`}>
            <div className="flex items-end gap-3">
              <span className={`text-4xl font-bold ${sl.color}`}>{score}</span>
              <div className="mb-1">
                <p className={`text-sm font-semibold ${sl.color}`}>{sl.label}</p>
                {resolvedCount > 0 && (
                  <p className="text-[10px] text-gray-500">{resolvedCount} issue{resolvedCount > 1 ? "s" : ""} resolved</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Top issues */}
        {result?.topIssues && result.topIssues.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Common patterns detected</p>
            {result.topIssues.map((issue, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <div className="w-1 h-1 rounded-full bg-gray-300 mt-1.5 shrink-0" />
                <p className="text-[11px] text-gray-600">{issue}</p>
              </div>
            ))}
          </div>
        )}

        {/* Run button */}
        {!result && (
          <button
            onClick={runReview}
            disabled={loading}
            className="w-full text-xs font-medium bg-gray-900 text-white rounded-lg px-3 py-2.5 hover:bg-gray-700 disabled:opacity-40 transition-colors"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 size={12} className="animate-spin" /> Analyzing writing…
              </span>
            ) : "Analyze writing naturalness"}
          </button>
        )}

        {result && (
          <button
            onClick={runReview}
            disabled={loading}
            className="w-full text-[10px] text-gray-400 hover:text-gray-700 underline transition-colors disabled:opacity-40"
          >
            {loading ? "Re-analyzing…" : "Re-analyze"}
          </button>
        )}

        {error && <p className="text-xs text-red-500">{error}</p>}

        {/* Flags */}
        {activeFlags.length > 0 && (
          <div className="space-y-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
              {activeFlags.length} issue{activeFlags.length > 1 ? "s" : ""} found
            </p>
            {flags.map((flag, i) => {
              if (flag.dismissed || flag.applied) return null;
              return (
                <div key={i} className="rounded-lg border border-gray-100 p-3 space-y-2">
                  {/* Issue */}
                  <div className="flex items-start gap-1.5">
                    {severityIcon(flag.severity)}
                    <p className="text-[11px] text-gray-500 leading-relaxed">{flag.issue}</p>
                  </div>

                  {/* Flagged text */}
                  <div className="bg-amber-50 border border-amber-100 rounded px-2.5 py-2">
                    <p className="text-[11px] text-amber-900 italic leading-relaxed">&ldquo;{flag.originalText}&rdquo;</p>
                  </div>

                  {/* Suggestion */}
                  <div className="bg-green-50 border border-green-100 rounded px-2.5 py-2">
                    <p className="text-[10px] text-green-600 font-medium mb-0.5">Suggested alternative:</p>
                    <p className="text-[11px] text-green-900 leading-relaxed">&ldquo;{flag.suggestion}&rdquo;</p>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => applyFix(i)}
                      disabled={!editorApi}
                      className="flex-1 text-[10px] font-medium bg-gray-900 text-white rounded-md px-2 py-1.5 hover:bg-gray-700 disabled:opacity-40 transition-colors"
                    >
                      Apply fix
                    </button>
                    <button
                      onClick={() => dismissFlag(i)}
                      className="flex-1 text-[10px] text-gray-500 border border-gray-200 rounded-md px-2 py-1.5 hover:bg-gray-50 transition-colors"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* All resolved */}
        {result && activeFlags.length === 0 && resolvedCount > 0 && (
          <div className="text-center py-6 space-y-2">
            <CheckCircle2 size={24} className="text-green-500 mx-auto" />
            <p className="text-sm font-medium text-gray-700">All issues resolved</p>
            <p className="text-xs text-gray-400">Your writing looks natural.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Replace first occurrence of originalText with suggestion in BlockNote blocks
function replaceTextInContent(content: unknown, originalText: string, suggestion: string): unknown[] | null {
  if (!Array.isArray(content)) return null;
  let replaced = false;

  function replaceInInline(inlineContent: unknown[]): unknown[] {
    if (replaced) return inlineContent;
    const joined = inlineContent
      .map((c) => (typeof c === "object" && c !== null && "text" in c ? (c as { text: string }).text : ""))
      .join("");

    if (!joined.includes(originalText)) return inlineContent;

    // Replace in the joined text and rebuild inline content
    const newText = joined.replace(originalText, suggestion);
    replaced = true;
    return [{ type: "text", text: newText, styles: {} }];
  }

  const newBlocks = (content as unknown[]).map((block) => {
    if (replaced) return block;
    if (typeof block !== "object" || block === null) return block;
    const b = block as Record<string, unknown>;
    if (Array.isArray(b.content)) {
      const newContent = replaceInInline(b.content as unknown[]);
      if (replaced) return { ...b, content: newContent };
    }
    return block;
  });

  return replaced ? newBlocks : null;
}
