"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, Minimize2, Maximize2, MessageCircle, PlusCircle, Undo2 } from "lucide-react";
import { markdownToBlocks } from "@/lib/markdown-to-blocknote";
import type { CursorHeading, EditorAPI } from "./blocknote-editor";

type Action = "regenerate" | "shorter" | "longer" | "conversational" | "authoritative" | "simpler" | "add_example";

interface UndoEntry {
  headingText: string;
  level: number;
  blocks: unknown[];
}

interface Props {
  articleId: string;
  targetKeyword: string;
  heading: CursorHeading | null;
  editorApi: EditorAPI | null;
  chatOutline?: unknown[];
  onContentChanged: () => void;
}

const TONE_ACTIONS: { value: Action; label: string }[] = [
  { value: "conversational", label: "More conversational" },
  { value: "authoritative", label: "More authoritative" },
  { value: "simpler", label: "Simpler language" },
];

function getSeoType(headingText: string, outline: unknown[]): string {
  if (!outline?.length) return "seo";
  const match = (outline as Array<{ text: string; type?: string; seoType?: string }>).find(
    (item) => item.text?.trim().toLowerCase() === headingText.trim().toLowerCase()
  );
  return match?.type ?? match?.seoType ?? "seo";
}

export function SectionActionBar({ articleId, targetKeyword, heading, editorApi, chatOutline, onContentChanged }: Props) {
  const [loading, setLoading] = useState<Action | null>(null);
  const [showTone, setShowTone] = useState(false);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [undoVisible, setUndoVisible] = useState(false);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset dropdown when heading changes
  useEffect(() => { setShowTone(false); }, [heading?.blockId]);

  if (!heading || !editorApi) return null;

  async function runAction(action: Action) {
    if (!heading || !editorApi || loading) return;
    setShowTone(false);

    const currentContent = editorApi.getSectionText(heading.text, heading.level);
    const seoType = getSeoType(heading.text, chatOutline ?? []);

    // Save to undo stack before replacing
    const all = editorApi as unknown as { replaceSection?: unknown };
    void all; // silence unused warning

    // Capture current section blocks for undo
    const snapshotText = currentContent;
    setUndoStack(prev => [
      ...prev.slice(-9),
      { headingText: heading.text, level: heading.level, blocks: markdownToBlocks(snapshotText || " ") }
    ]);

    setLoading(action);
    try {
      const res = await fetch("/api/content/regenerate-section", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          articleId,
          headingText: heading.text,
          headingLevel: heading.level,
          currentContent,
          action,
          context: { targetKeyword, outline: chatOutline ?? [], seoType },
        }),
      });

      if (!res.ok || !res.body) throw new Error("Regeneration failed");

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += dec.decode(value);
      }

      const newBlocks = markdownToBlocks(fullText);
      const ok = editorApi.replaceSection(heading.text, heading.level, newBlocks);
      if (ok) {
        onContentChanged();
        showUndoButton();
      }
    } catch (e) {
      console.error("Section regenerate failed:", e);
    } finally {
      setLoading(null);
    }
  }

  function showUndoButton() {
    setUndoVisible(true);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => setUndoVisible(false), 30000);
  }

  function handleUndo() {
    if (!undoStack.length || !editorApi) return;
    const last = undoStack[undoStack.length - 1];
    editorApi.replaceSection(last.headingText, last.level, last.blocks);
    setUndoStack(prev => prev.slice(0, -1));
    setUndoVisible(false);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    onContentChanged();
  }

  const isLoading = loading !== null;

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {/* Regenerate */}
      <ActionBtn
        onClick={() => runAction("regenerate")}
        loading={loading === "regenerate"}
        disabled={isLoading}
        icon={<RefreshCw size={11} />}
        label="Regenerate"
        title="Rewrite this section"
      />

      {/* Shorter */}
      <ActionBtn
        onClick={() => runAction("shorter")}
        loading={loading === "shorter"}
        disabled={isLoading}
        icon={<Minimize2 size={11} />}
        label="Shorter"
        title="Make this section shorter"
      />

      {/* Longer */}
      <ActionBtn
        onClick={() => runAction("longer")}
        loading={loading === "longer"}
        disabled={isLoading}
        icon={<Maximize2 size={11} />}
        label="Longer"
        title="Expand this section"
      />

      {/* Change tone dropdown */}
      <div className="relative">
        <ActionBtn
          onClick={() => setShowTone(v => !v)}
          loading={false}
          disabled={isLoading}
          icon={<MessageCircle size={11} />}
          label="Tone"
          title="Change tone of this section"
          active={showTone}
        />
        {showTone && (
          <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[170px]">
            {TONE_ACTIONS.map(t => (
              <button
                key={t.value}
                onClick={() => runAction(t.value)}
                className="w-full text-left text-xs px-3 py-1.5 hover:bg-gray-50 text-gray-700 transition-colors"
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Add example */}
      <ActionBtn
        onClick={() => runAction("add_example")}
        loading={loading === "add_example"}
        disabled={isLoading}
        icon={<PlusCircle size={11} />}
        label="Add example"
        title="Append a concrete example to this section"
      />

      {/* Undo */}
      {undoVisible && undoStack.length > 0 && (
        <button
          onClick={handleUndo}
          className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors animate-fade-in"
          title="Undo last regeneration"
        >
          <Undo2 size={10} /> Undo
        </button>
      )}
    </div>
  );
}

function ActionBtn({
  onClick, loading, disabled, icon, label, title, active,
}: {
  onClick: () => void;
  loading: boolean;
  disabled: boolean;
  icon: React.ReactNode;
  label: string;
  title: string;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border transition-colors disabled:opacity-40 disabled:pointer-events-none ${
        active
          ? "bg-gray-900 text-white border-gray-900"
          : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:border-gray-300"
      }`}
    >
      {loading ? <Loader2 size={10} className="animate-spin" /> : icon}
      {label}
    </button>
  );
}
