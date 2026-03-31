"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { KeywordPanel } from "@/components/sidebar/keyword-panel";
import { ChecklistPanel } from "@/components/sidebar/checklist-panel";
import { BriefPanel } from "@/components/sidebar/brief-panel";
import { GapPanel } from "@/components/sidebar/gap-panel";
import type { ChecklistInput } from "@/lib/checklist";

const BlockNoteEditorComponent = dynamic(
  () => import("./blocknote-editor"),
  { ssr: false }
);

type SaveState = "saved" | "saving" | "unsaved" | "idle";
type SidebarTab = "keywords" | "brief" | "gap" | "checklist";

interface Props {
  id: string;
  initialTitle: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialContent: any;
  initialKeyword: string | null;
  initialMeta: string | null;
  initialSlug: string | null;
  initialPublishedUrl: string | null;
  initialStatus: string;
}

export function ArticleEditor({
  id,
  initialTitle,
  initialContent,
  initialKeyword,
  initialMeta,
  initialSlug,
  initialPublishedUrl,
  initialStatus,
}: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [metaDescription, setMetaDescription] = useState(initialMeta ?? "");
  const [slug, setSlug] = useState(initialSlug ?? "");
  const [publishedUrl, setPublishedUrl] = useState(initialPublishedUrl ?? "");
  const [status, setStatus] = useState(initialStatus);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [panelOpen, setPanelOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<SidebarTab>("keywords");
  const [analysisContent, setAnalysisContent] = useState<unknown>(initialContent);
  const [keyword, setKeyword] = useState(initialKeyword ?? "");
  const [competitorAvgWords, setCompetitorAvgWords] = useState<number | null>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analysisTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Record<string, unknown>>({});
  const contentRef = useRef<unknown>(initialContent);

  const scheduleSave = useCallback(
    (patch: Record<string, unknown>) => {
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
    contentRef.current = content;
    scheduleSave({ content });
    if (analysisTimer.current) clearTimeout(analysisTimer.current);
    analysisTimer.current = setTimeout(() => setAnalysisContent(content), 2000);
  }

  function handleKeywordChange(kw: string) {
    setKeyword(kw);
    scheduleSave({ targetKeyword: kw || null });
  }

  function handleMetaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setMetaDescription(val);
    scheduleSave({ metaDescription: val || null });
  }

  function handleSlugChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    setSlug(val);
    scheduleSave({ slug: val || null });
  }

  function handlePublishedUrlChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setPublishedUrl(val);
    scheduleSave({ publishedUrl: val || null });
  }

  async function handleMarkReady() {
    setStatus("ready");
    await fetch(`/api/articles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ready" }),
    });
  }

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (analysisTimer.current) clearTimeout(analysisTimer.current);
    };
  }, []);

  const checklistInput = useMemo<ChecklistInput>(
    () => ({
      title,
      metaDescription: metaDescription || null,
      slug: slug || null,
      targetKeyword: keyword || null,
      content: analysisContent,
      competitorAvgWords,
    }),
    [title, metaDescription, slug, keyword, analysisContent, competitorAvgWords]
  );

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
          <div className="max-w-[720px] mx-auto px-8 py-12 space-y-6">
            <input
              type="text"
              value={title}
              onChange={handleTitleChange}
              placeholder="Untitled"
              className="w-full text-4xl font-bold text-gray-900 placeholder-gray-300 border-none outline-none bg-transparent leading-tight"
            />

            {/* Slug + Published URL row */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-[10px] text-gray-400 uppercase tracking-wide mb-1">Slug</label>
                <input
                  type="text"
                  value={slug}
                  onChange={handleSlugChange}
                  placeholder="my-article-slug"
                  className="w-full text-sm border border-gray-200 rounded-md px-2.5 py-1.5 outline-none focus:border-gray-400 placeholder-gray-300 font-mono"
                />
              </div>
              <div className="flex-1">
                <label className="block text-[10px] text-gray-400 uppercase tracking-wide mb-1">Published URL</label>
                <input
                  type="text"
                  value={publishedUrl}
                  onChange={handlePublishedUrlChange}
                  placeholder="https://..."
                  className="w-full text-sm border border-gray-200 rounded-md px-2.5 py-1.5 outline-none focus:border-gray-400 placeholder-gray-300"
                />
              </div>
            </div>

            {/* Meta description */}
            <div>
              <label className="block text-[10px] text-gray-400 uppercase tracking-wide mb-1">
                Meta description
                <span className={`ml-2 font-normal ${
                  metaDescription.length >= 150 && metaDescription.length <= 160
                    ? "text-green-500"
                    : metaDescription.length > 0
                    ? "text-amber-500"
                    : ""
                }`}>
                  {metaDescription.length > 0 ? `${metaDescription.length} chars` : ""}
                </span>
              </label>
              <textarea
                value={metaDescription}
                onChange={handleMetaChange}
                placeholder="Write a compelling meta description (150–160 chars)…"
                rows={2}
                className="w-full text-sm border border-gray-200 rounded-md px-2.5 py-1.5 outline-none focus:border-gray-400 placeholder-gray-300 resize-none"
              />
            </div>

            <BlockNoteEditorComponent
              initialContent={initialContent}
              onChange={handleContentChange}
            />
          </div>
        </div>

        {/* Sidebar panel */}
        <div
          className={`shrink-0 border-l border-gray-100 bg-white overflow-hidden transition-all duration-200 ${
            panelOpen ? "w-[300px]" : "w-0"
          }`}
        >
          {panelOpen && (
            <div className="flex flex-col h-full">
              {/* Tabs */}
              <div className="flex border-b border-gray-100 shrink-0">
                {(["keywords", "brief", "gap", "checklist"] as SidebarTab[]).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 text-xs py-2.5 font-medium capitalize transition-colors ${
                      activeTab === tab
                        ? "text-gray-900 border-b-2 border-gray-900"
                        : "text-gray-400 hover:text-gray-700"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-y-auto">
                {activeTab === "keywords" && (
                  <KeywordPanel
                    articleId={id}
                    initialKeyword={initialKeyword}
                    onKeywordChange={handleKeywordChange}
                    analysisContent={analysisContent}
                    onCompetitorAvgWords={setCompetitorAvgWords}
                  />
                )}
                {activeTab === "brief" && (
                  <div className="px-4 py-5">
                    <BriefPanel
                      articleId={id}
                      keyword={keyword}
                      onCompetitorAvgWords={setCompetitorAvgWords}
                    />
                  </div>
                )}
                {activeTab === "gap" && (
                  <div className="px-4 py-5">
                    <GapPanel
                      onPrefillKeyword={(kw) => {
                        setKeyword(kw);
                        setActiveTab("keywords");
                        handleKeywordChange(kw);
                      }}
                    />
                  </div>
                )}
                {activeTab === "checklist" && (
                  <div className="px-4 py-5">
                    <ChecklistPanel
                      input={checklistInput}
                      onMarkReady={handleMarkReady}
                      status={status}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Toggle button */}
        <button
          onClick={() => setPanelOpen((v) => !v)}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-5 h-10 bg-white border border-gray-200 border-r-0 rounded-l-md text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors"
          style={{ right: panelOpen ? "300px" : "0px" }}
          aria-label={panelOpen ? "Close panel" : "Open panel"}
        >
          {panelOpen ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </div>
    </div>
  );
}
