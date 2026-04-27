"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { KeywordPanel } from "@/components/sidebar/keyword-panel";
import { BriefPanel } from "@/components/sidebar/brief-panel";
import { GapPanel } from "@/components/sidebar/gap-panel";
import { DiagnosticPanel } from "@/components/sidebar/diagnostic-panel";
import { SectionActionBar } from "./section-action-bar";
import { NaturalnessPanel } from "./naturalness-panel";
import type { CursorHeading, EditorAPI } from "./blocknote-editor";

const BlockNoteEditorComponent = dynamic(
  () => import("./blocknote-editor"),
  { ssr: false }
);

type SaveState = "saved" | "saving" | "unsaved" | "idle";
type SidebarTab = "keywords" | "brief" | "gap" | "score";

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
  initialRevampUrl: string | null;
  initialIsRevamp: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialSecondaryKeywords?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialChatOutline?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialChatResearchState?: any;
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
  initialRevampUrl,
  initialIsRevamp,
  initialSecondaryKeywords,
  initialChatOutline,
  initialChatResearchState,
}: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [metaDescription, setMetaDescription] = useState(initialMeta ?? "");
  const [slug, setSlug] = useState(initialSlug ?? "");
  const [publishedUrl, setPublishedUrl] = useState(initialPublishedUrl ?? "");
  const [status, setStatus] = useState(initialStatus);
  const [isRevamp, setIsRevamp] = useState(initialIsRevamp);
  const [revampUrl, setRevampUrl] = useState(initialRevampUrl ?? "");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const hasChatState = !!initialChatResearchState;
  const [panelOpen, setPanelOpen] = useState(hasChatState);
  const [activeTab, setActiveTab] = useState<SidebarTab>("keywords");
  const [chatBannerDismissed, setChatBannerDismissed] = useState(false);
  const [analysisContent, setAnalysisContent] = useState<unknown>(initialContent);
  const [keyword, setKeyword] = useState(initialKeyword ?? "");
const [authorProfile, setAuthorProfile] = useState<{ name?: string } | null>(null);
  const [createdAt, setCreatedAt] = useState<string | undefined>(undefined);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analysisTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Record<string, unknown>>({});
  const contentRef = useRef<unknown>(initialContent);
  const editorApiRef = useRef<EditorAPI | null>(null);
  const [cursorHeading, setCursorHeading] = useState<CursorHeading | null>(null);
  const [reviewPanelOpen, setReviewPanelOpen] = useState(false);

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

  function handleRevampToggle(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.checked;
    setIsRevamp(val);
    scheduleSave({ isRevamp: val });
  }

  function handleRevampUrlBlur() {
    scheduleSave({ revampUrl: revampUrl || null });
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
    fetch("/api/settings/author-profile")
      .then((r) => r.ok ? r.json() : null)
      .then((data: { name?: string } | null) => setAuthorProfile(data))
      .catch(() => {});
    fetch(`/api/articles/${id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data: { createdAt?: string } | null) => { if (data?.createdAt) setCreatedAt(data.createdAt); })
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (analysisTimer.current) clearTimeout(analysisTimer.current);
    };
  }, []);

  const secondaryKeywords = useMemo(() => {
    if (!Array.isArray(initialSecondaryKeywords)) return [];
    return (initialSecondaryKeywords as Array<{ keyword?: string } | string>).map((k) =>
      typeof k === "string" ? k : (k.keyword ?? "")
    ).filter(Boolean);
  }, [initialSecondaryKeywords]);

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
        <div className="flex items-center gap-3">
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
          <button
            onClick={() => setReviewPanelOpen(v => !v)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              reviewPanelOpen
                ? "bg-gray-900 text-white border-gray-900"
                : "text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}
          >
            Review writing
          </button>
        </div>
      </div>

      {/* Body: review panel + editor + sidebar */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left: naturalness review panel */}
        <div
          className={`shrink-0 border-r border-gray-100 bg-white overflow-hidden transition-all duration-200 ${
            reviewPanelOpen ? "w-[280px]" : "w-0"
          }`}
        >
          {reviewPanelOpen && (
            <NaturalnessPanel
              articleId={id}
              editorApi={editorApiRef.current}
              content={analysisContent}
              onClose={() => setReviewPanelOpen(false)}
              onTextReplaced={() => {
                scheduleSave({ content: contentRef.current });
              }}
            />
          )}
        </div>

        {/* Editor area */}
        <div className="flex-1 overflow-y-auto">
          {/* Research-from-chat banner */}
          {hasChatState && !chatBannerDismissed && (
            <div className="flex items-center justify-between bg-green-50 border-b border-green-200 px-8 py-2.5">
              <p className="text-xs text-green-800">
                <span className="font-semibold">Research imported from chat</span> — keyword, outline, and brief are pre-loaded.
              </p>
              <button
                onClick={() => setChatBannerDismissed(true)}
                className="text-green-500 hover:text-green-700 text-xs ml-4"
              >
                ✕ Dismiss
              </button>
            </div>
          )}
          <div className="max-w-[720px] mx-auto px-8 py-12 space-y-6">
            <input
              type="text"
              value={title}
              onChange={handleTitleChange}
              placeholder="Untitled"
              className="w-full text-4xl font-bold text-gray-900 placeholder-gray-300 border-none outline-none bg-transparent leading-tight"
            />

            {/* Author byline */}
            {authorProfile?.name ? (
              <div className="flex items-center gap-2 -mt-3">
                <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-[9px] font-bold text-blue-700">
                  {authorProfile.name[0]?.toUpperCase()}
                </div>
                <a href="/settings/author-profile" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                  Written by {authorProfile.name}
                </a>
              </div>
            ) : (
              <a href="/settings/author-profile" className="text-xs text-gray-300 hover:text-gray-500 -mt-3 transition-colors">
                + Add author
              </a>
            )}

            {/* Revamp toggle */}
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={isRevamp} onChange={handleRevampToggle} className="rounded" />
                <span className="text-[11px] text-gray-500">Revamping an existing page</span>
              </label>
              {isRevamp && (
                <input
                  type="url"
                  value={revampUrl}
                  onChange={(e) => setRevampUrl(e.target.value)}
                  onBlur={handleRevampUrlBlur}
                  placeholder="https://10pearls.com/existing-page"
                  className="flex-1 text-xs border border-gray-200 rounded-md px-2.5 py-1.5 outline-none focus:border-gray-400 placeholder-gray-300"
                />
              )}
            </div>

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

            {/* Section action bar — shows when cursor is inside a heading */}
            {cursorHeading && (
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[10px] text-gray-400 font-mono shrink-0">H{cursorHeading.level}</span>
                <SectionActionBar
                  articleId={id}
                  targetKeyword={keyword}
                  heading={cursorHeading}
                  editorApi={editorApiRef.current}
                  chatOutline={Array.isArray(initialChatOutline) ? initialChatOutline : undefined}
                  onContentChanged={() => {
                    scheduleSave({ content: contentRef.current });
                  }}
                />
              </div>
            )}

            <BlockNoteEditorComponent
              initialContent={initialContent}
              onChange={handleContentChange}
              onMount={(api) => { editorApiRef.current = api; }}
              onCursorHeading={setCursorHeading}
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
                {(["keywords", "brief", "gap", "score"] as SidebarTab[]).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 text-xs py-2.5 font-medium capitalize transition-colors ${
                      activeTab === tab
                        ? "text-gray-900 border-b-2 border-gray-900"
                        : "text-gray-400 hover:text-gray-700"
                    }`}
                  >
                    {tab === "score" ? "Score" : tab}
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
                    onCompetitorAvgWords={() => {}}
                    autoLookup={hasChatState && !!initialKeyword}
                    initialSecondaryKeywords={initialSecondaryKeywords}
                  />
                )}
                {activeTab === "brief" && (
                  <div className="px-4 py-5">
                    <BriefPanel
                      articleId={id}
                      keyword={keyword}
                      revampUrl={isRevamp ? revampUrl : null}
                      isRevamp={isRevamp}
                      onCompetitorAvgWords={() => {}}
                      onInjectContent={(blocks) => {
                        editorApiRef.current?.replaceContent(blocks);
                        handleContentChange(blocks);
                      }}
                      initialChatOutline={initialChatOutline}
                      initialChatResearchState={initialChatResearchState}
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
                {activeTab === "score" && (
                  <DiagnosticPanel
                    articleId={id}
                    title={title}
                    metaDescription={metaDescription}
                    targetKeyword={keyword || null}
                    content={analysisContent}
                    status={status}
                    publishedUrl={publishedUrl || null}
                    createdAt={createdAt}
                    secondaryKeywords={secondaryKeywords}
                    onTitleChange={(v) => { setTitle(v); scheduleSave({ title: v }); }}
                    onMetaChange={(v) => { setMetaDescription(v); scheduleSave({ metaDescription: v || null }); }}
                    onSaveField={scheduleSave}
                    onReplaceContent={(blocks) => {
                      editorApiRef.current?.replaceContent(blocks as Parameters<typeof editorApiRef.current.replaceContent>[0]);
                      handleContentChange(blocks);
                    }}
                    onMarkReady={handleMarkReady}
                    onInsertEvidence={(text) => {
                      // Insert at end of document
                      const currentBlocks = Array.isArray(contentRef.current) ? contentRef.current as unknown[] : [];
                      const newBlock = { id: `ev-${Date.now()}`, type: "paragraph", props: { textColor: "default", backgroundColor: "default", textAlignment: "left" }, content: [{ type: "text", text, styles: {} }], children: [] };
                      const updated = [...currentBlocks, newBlock];
                      editorApiRef.current?.replaceContent(updated as Parameters<typeof editorApiRef.current.replaceContent>[0]);
                      handleContentChange(updated);
                    }}
                  />
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
