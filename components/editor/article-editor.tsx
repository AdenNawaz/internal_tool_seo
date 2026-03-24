"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { KeywordPanel } from "@/components/sidebar/keyword-panel";

const BlockNoteEditorComponent = dynamic(
  () => import("./blocknote-editor"),
  { ssr: false }
);

type SaveState = "saved" | "saving" | "unsaved" | "idle";

interface Props {
  id: string;
  initialTitle: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialContent: any;
  initialKeyword: string | null;
}

export function ArticleEditor({ id, initialTitle, initialContent, initialKeyword }: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [panelOpen, setPanelOpen] = useState(false);
  // Debounced copy of editor content passed to the keyword panel for analysis
  const [analysisContent, setAnalysisContent] = useState<unknown>(initialContent);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analysisTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{ title?: string; content?: unknown; targetKeyword?: string | null }>({});

  const scheduleSave = useCallback(
    (patch: { title?: string; content?: unknown; targetKeyword?: string | null }) => {
      pendingRef.current = { ...pendingRef.current, ...patch };
      setSaveState("saving");

      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        const payload = pendingRef.current;
        pendingRef.current = {};
        try {
          const res = await fetch(`/api/articles/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!res.ok) throw new Error("Save failed");
          setSaveState("saved");
        } catch {
          setSaveState("unsaved");
        }
      }, 1500);
    },
    [id]
  );

  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setTitle(val);
    scheduleSave({ title: val });
  }

  function handleContentChange(content: unknown) {
    scheduleSave({ content });
    // Debounce separately for analysis — 3s after typing stops
    if (analysisTimer.current) clearTimeout(analysisTimer.current);
    analysisTimer.current = setTimeout(() => setAnalysisContent(content), 3000);
  }

  function handleKeywordChange(keyword: string) {
    scheduleSave({ targetKeyword: keyword || null });
  }

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (analysisTimer.current) clearTimeout(analysisTimer.current);
    };
  }, []);

  const saveLabel =
    saveState === "saving"
      ? "Saving…"
      : saveState === "saved"
      ? "Saved"
      : saveState === "unsaved"
      ? "Unsaved changes"
      : "";

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-gray-100">
        <Link
          href="/articles"
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft size={15} />
          Articles
        </Link>
        <span
          className={`text-xs transition-colors ${
            saveState === "unsaved"
              ? "text-red-400"
              : saveState === "saving"
              ? "text-gray-400 animate-pulse"
              : "text-gray-400"
          }`}
        >
          {saveLabel}
        </span>
      </div>

      {/* Body: editor + sidebar */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Editor area */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-[720px] mx-auto px-8 py-12">
            <input
              type="text"
              value={title}
              onChange={handleTitleChange}
              placeholder="Untitled"
              className="w-full text-4xl font-bold text-gray-900 placeholder-gray-300 border-none outline-none bg-transparent mb-8 leading-tight"
            />
            <BlockNoteEditorComponent
              initialContent={initialContent}
              onChange={handleContentChange}
            />
          </div>
        </div>

        {/* Sidebar panel */}
        <div
          className={`shrink-0 border-l border-gray-100 bg-white overflow-hidden transition-all duration-200 ${
            panelOpen ? "w-[280px]" : "w-0"
          }`}
        >
          {panelOpen && (
            <KeywordPanel
              articleId={id}
              initialKeyword={initialKeyword}
              onKeywordChange={handleKeywordChange}
              analysisContent={analysisContent}
            />
          )}
        </div>

        {/* Toggle button */}
        <button
          onClick={() => setPanelOpen((v) => !v)}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-5 h-10 bg-white border border-gray-200 border-r-0 rounded-l-md text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors"
          style={{ right: panelOpen ? "280px" : "0px" }}
          aria-label={panelOpen ? "Close keyword panel" : "Open keyword panel"}
        >
          {panelOpen ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </div>
    </div>
  );
}
