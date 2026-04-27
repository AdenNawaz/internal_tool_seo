"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, FileText, ChevronDown, ChevronRight, CheckCircle2, Loader2,
  Sparkles, Pencil, SplitSquareVertical, AlertTriangle, Zap, User,
} from "lucide-react";

interface OutlineSection {
  heading: string;
  level: number;
  description: string;
  wordTarget: number;
  keyPoints: string[];
  evidenceToUse: string[];
  writingMode?: "ai" | "manual";
}

interface Outline {
  title: string;
  metaDescription: string;
  sections: OutlineSection[];
}

type WritingMode = "ai" | "manual" | "mixed";

const WORDS_PER_SECTION: Record<string, number> = {
  blog: 200, pillar: 350, guide: 250,
};

function validate(sections: OutlineSection[]): string[] {
  const warnings: string[] = [];
  const h1s = sections.filter((s) => s.level === 1);
  if (h1s.length > 1) warnings.push(`Multiple H1 headings found (${h1s.length}) — only one H1 is allowed.`);
  const h2s = sections.filter((s) => s.level === 2);
  if (h2s.length < 2) warnings.push("At least 2 H2 sections are required for generation.");
  const empty = sections.filter((s) => !s.heading.trim());
  if (empty.length > 0) warnings.push(`${empty.length} heading${empty.length > 1 ? "s" : ""} with empty text.`);
  return warnings;
}

export default function BriefReviewPage() {
  const { articleId } = useParams<{ articleId: string }>();
  const router = useRouter();
  const [outline, setOutline] = useState<Outline | null>(null);
  const [sections, setSections] = useState<OutlineSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set([0]));
  const [writingMode, setWritingMode] = useState<WritingMode>("ai");
  const [generating, setGenerating] = useState(false);
  const [savingBrief, setSavingBrief] = useState(false);
  const [generatingSection, setGeneratingSection] = useState<number | null>(null);
  const [contentType, setContentType] = useState("blog");
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/brief/fetch?articleId=${articleId}`);
        if (!res.ok) throw new Error("Brief not found");
        const data = await res.json() as { outline?: Outline; editableOutline?: Outline };
        const ol = (data.editableOutline ?? data.outline) as Outline | null;
        if (ol) {
          setOutline(ol);
          setSections((ol.sections ?? []).map((s) => ({ ...s, writingMode: "ai" as const })));
        } else {
          setError("No outline found. Please generate a brief from the research page.");
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }
    // Also fetch article for contentType
    Promise.all([
      load(),
      fetch(`/api/articles/${articleId}`).then((r) => r.json()).then((d: { contentType?: string }) => {
        if (d.contentType) setContentType(d.contentType.toLowerCase());
      }).catch(() => {}),
    ]);
  }, [articleId]);

  const warnings = validate(sections);
  const canGenerate = warnings.length === 0 && sections.length > 0;

  function toggleSection(i: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  function setSectionMode(i: number, mode: "ai" | "manual") {
    setSections((prev) => prev.map((s, idx) => idx === i ? { ...s, writingMode: mode } : s));
  }

  function setLevel(i: number, level: number) {
    setSections((prev) => prev.map((s, idx) => idx === i ? { ...s, level } : s));
  }

  const wordsPerSection = WORDS_PER_SECTION[contentType] ?? 200;
  const totalWords = sections.reduce((sum, s) => sum + (s.wordTarget || wordsPerSection), 0);
  const readTime = Math.ceil(totalWords / 200);

  async function saveBriefOnly() {
    setSavingBrief(true);
    try {
      await fetch(`/api/articles/${articleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatOutline: sections }),
      });
    } finally {
      setSavingBrief(false);
    }
  }

  async function generateManualScaffold() {
    // "You write all" — create heading blocks with placeholder paragraphs
    setGenerating(true);
    try {
      const blocks: unknown[] = [];
      let id = 0;
      const nextId = () => `brief-${++id}`;
      for (const section of sections) {
        blocks.push({
          id: nextId(),
          type: "heading",
          props: { level: section.level, textColor: "default", backgroundColor: "default" },
          content: [{ type: "text", text: section.heading, styles: {} }],
          children: [],
        });
        blocks.push({
          id: nextId(),
          type: "paragraph",
          props: { textColor: "default", backgroundColor: "default", textAlignment: "left" },
          content: [{ type: "text", text: "Write this section here…", styles: { textColor: "gray" } }],
          children: [],
        });
      }
      await fetch(`/api/articles/${articleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatOutline: sections, content: blocks }),
      });
      router.push(`/articles/${articleId}`);
    } catch {
      setError("Failed to create article scaffold.");
      setGenerating(false);
    }
  }

  async function generateWithAI() {
    setGenerating(true);
    try {
      // Save outline first, then navigate — generation happens in the editor via BriefPanel
      await fetch(`/api/articles/${articleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatOutline: sections }),
      });
      router.push(`/articles/${articleId}`);
    } catch {
      setError("Failed to save outline.");
      setGenerating(false);
    }
  }

  async function handleGenerate() {
    if (!canGenerate) return;
    if (writingMode === "manual") {
      await generateManualScaffold();
    } else {
      await generateWithAI();
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">Loading brief…</span>
        </div>
      </div>
    );
  }

  if (error && !outline) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-sm text-red-600 mb-4">{error}</p>
          <button onClick={() => router.push(`/create/research/${articleId}`)} className="text-sm text-blue-600 hover:underline">
            ← Back to research
          </button>
        </div>
      </div>
    );
  }

  const aiSections = writingMode === "mixed" ? sections.filter((s) => s.writingMode !== "manual").length : writingMode === "ai" ? sections.length : 0;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center gap-3">
        <button onClick={() => router.push(`/create/research/${articleId}`)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft size={16} className="text-gray-500" />
        </button>
        <div>
          <div className="flex items-center gap-2">
            <FileText size={14} className="text-purple-500" />
            <span className="text-sm font-semibold text-gray-900">Brief Review</span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">Choose your writing mode, review the outline, then generate</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
        {/* Writing mode selector */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Writing mode</p>
          <div className="grid grid-cols-3 gap-3">
            {([
              { id: "ai" as const, icon: Sparkles, label: "AI Writes All", desc: "AI generates every section based on your outline and research." },
              { id: "manual" as const, icon: Pencil, label: "You Write All", desc: "Export the outline to the editor. You write each section yourself." },
              { id: "mixed" as const, icon: SplitSquareVertical, label: "Choose Per Section", desc: "Decide section by section who writes." },
            ] as const).map(({ id, icon: Icon, label, desc }) => (
              <button
                key={id}
                onClick={() => setWritingMode(id)}
                className={`text-left p-4 rounded-xl border-2 transition-colors ${writingMode === id ? "border-purple-500 bg-purple-50" : "border-gray-200 bg-white hover:border-gray-300"}`}
              >
                <Icon size={16} className={`mb-2 ${writingMode === id ? "text-purple-600" : "text-gray-400"}`} />
                <p className={`text-xs font-semibold mb-1 ${writingMode === id ? "text-purple-800" : "text-gray-700"}`}>{label}</p>
                <p className="text-[10px] text-gray-400 leading-relaxed">{desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Title + meta */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h1 className="text-base font-bold text-gray-900 mb-1">{outline?.title}</h1>
          <p className="text-xs text-gray-500">{outline?.metaDescription}</p>
        </div>

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="space-y-2">
            {warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-800">{w}</p>
              </div>
            ))}
          </div>
        )}

        {/* Outline sections */}
        <div className="space-y-2">
          {sections.map((section, i) => {
            const isH1Warning = section.level === 1 && sections.filter((s) => s.level === 1).length > 1;
            const isEmptyWarning = !section.heading.trim();
            return (
              <div key={i} className={`bg-white rounded-xl border overflow-hidden ${isH1Warning || isEmptyWarning ? "border-amber-300" : "border-gray-100"}`}>
                <button
                  onClick={() => toggleSection(i)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {/* Level badge — clickable to change level */}
                    <div className="flex gap-0.5 shrink-0">
                      {[1, 2, 3].map((lvl) => (
                        <button
                          key={lvl}
                          onClick={(e) => { e.stopPropagation(); setLevel(i, lvl); }}
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-colors ${section.level === lvl ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-400 hover:bg-gray-200"}`}
                        >
                          H{lvl}
                        </button>
                      ))}
                    </div>
                    <span className="text-sm font-medium text-gray-800 truncate">{section.heading || <span className="text-amber-500">Empty heading</span>}</span>
                    {isH1Warning && <AlertTriangle size={12} className="text-amber-500 shrink-0" />}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    {/* Per-section AI/Manual toggle */}
                    {writingMode === "mixed" && (
                      <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setSectionMode(i, "ai")}
                          className={`text-[9px] font-semibold px-2 py-1 rounded-md flex items-center gap-0.5 transition-colors ${section.writingMode !== "manual" ? "bg-white text-purple-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                        >
                          <Zap size={8} /> AI
                        </button>
                        <button
                          onClick={() => setSectionMode(i, "manual")}
                          className={`text-[9px] font-semibold px-2 py-1 rounded-md flex items-center gap-0.5 transition-colors ${section.writingMode === "manual" ? "bg-white text-gray-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                        >
                          <User size={8} /> Me
                        </button>
                      </div>
                    )}
                    <span className="text-xs text-gray-400">{section.wordTarget || wordsPerSection}w</span>
                    {expanded.has(i) ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                  </div>
                </button>

                {expanded.has(i) && (
                  <div className="px-4 pb-4 border-t border-gray-50">
                    <p className="text-xs text-gray-500 mt-3 mb-3">{section.description}</p>
                    {section.keyPoints.length > 0 && (
                      <div className="mb-3">
                        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Key points</div>
                        <ul className="space-y-1">
                          {section.keyPoints.map((point, j) => (
                            <li key={j} className="flex items-start gap-2">
                              <CheckCircle2 size={11} className="text-green-500 mt-0.5 shrink-0" />
                              <span className="text-xs text-gray-600">{point}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {section.evidenceToUse.length > 0 && (
                      <div>
                        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Evidence to include</div>
                        <ul className="space-y-1">
                          {section.evidenceToUse.map((ev, j) => (
                            <li key={j} className="text-xs text-gray-500 italic bg-amber-50 px-2 py-1 rounded border-l-2 border-amber-300">{ev}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Fixed bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-3 flex items-center justify-between z-30">
        <div className="flex items-center gap-3">
          <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full font-medium">
            {sections.length} sections
          </span>
          <span className="text-xs text-gray-500">~{totalWords.toLocaleString()} words</span>
          <span className="text-xs text-gray-400">~{readTime} min read</span>
          {writingMode === "mixed" && (
            <span className="text-xs text-purple-600">{aiSections} AI · {sections.length - aiSections} manual</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={saveBriefOnly}
            disabled={savingBrief}
            className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-200 hover:bg-gray-50 px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
          >
            {savingBrief ? <Loader2 size={13} className="animate-spin" /> : null}
            Save outline
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating || !canGenerate}
            className="flex items-center gap-2 px-5 py-2 bg-purple-600 text-white text-sm font-semibold rounded-xl hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {generating ? <Loader2 size={13} className="animate-spin" /> : writingMode === "manual" ? <Pencil size={13} /> : <Sparkles size={13} />}
            {writingMode === "manual" ? "Open editor" : "Generate article"}
          </button>
        </div>
      </div>
    </div>
  );
}
