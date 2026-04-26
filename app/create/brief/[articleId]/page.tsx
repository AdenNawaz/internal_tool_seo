"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, FileText, ChevronDown, ChevronRight, CheckCircle2, Loader2, Sparkles } from "lucide-react";

interface OutlineSection {
  heading: string;
  level: number;
  description: string;
  wordTarget: number;
  keyPoints: string[];
  evidenceToUse: string[];
}

interface Outline {
  title: string;
  metaDescription: string;
  sections: OutlineSection[];
}

export default function BriefReviewPage() {
  const { articleId } = useParams<{ articleId: string }>();
  const router = useRouter();
  const [outline, setOutline] = useState<Outline | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set([0]));
  const [writingArticle, setWritingArticle] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/brief/fetch?articleId=${articleId}`);
        if (!res.ok) throw new Error("Brief not found");
        const data = await res.json() as { outline?: Outline; editableOutline?: Outline };
        const ol = data.editableOutline ?? data.outline;
        if (ol) {
          setOutline(ol as Outline);
        } else {
          setError("No outline found. Please generate a brief from the research page.");
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [articleId]);

  function toggleSection(i: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  async function writeArticle() {
    setWritingArticle(true);
    try {
      const patchRes = await fetch(`/api/articles/${articleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatOutline: outline?.sections }),
      });
      if (!patchRes.ok) throw new Error("Failed to save outline to article");
      router.push(`/articles/${articleId}`);
    } catch (e) {
      setError((e as Error).message);
      setWritingArticle(false);
    }
  }

  const totalWords = outline?.sections.reduce((sum, s) => sum + (s.wordTarget ?? 0), 0) ?? 0;
  const h2Count = outline?.sections.filter((s) => s.level === 2).length ?? 0;
  const h3Count = outline?.sections.filter((s) => s.level === 3).length ?? 0;

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

  if (error) {
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/create/research/${articleId}`)}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={16} className="text-gray-500" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-purple-500" />
              <span className="text-sm font-semibold text-gray-900">Brief Review</span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">Review and confirm your article outline before writing</p>
          </div>
        </div>
        <button
          onClick={writeArticle}
          disabled={writingArticle || !outline}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-semibold rounded-xl hover:bg-purple-700 disabled:opacity-50 transition-colors"
        >
          {writingArticle ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          Write article →
        </button>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Title + meta */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
          <h1 className="text-lg font-bold text-gray-900 mb-2">{outline?.title}</h1>
          <p className="text-sm text-gray-500 leading-relaxed">{outline?.metaDescription}</p>
        </div>

        {/* Quality indicators */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">{totalWords.toLocaleString()}</div>
            <div className="text-xs text-gray-400 mt-1">Target words</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">{h2Count}</div>
            <div className="text-xs text-gray-400 mt-1">H2 sections</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">{h3Count}</div>
            <div className="text-xs text-gray-400 mt-1">H3 subsections</div>
          </div>
        </div>

        {/* Outline sections */}
        <div className="space-y-2">
          {outline?.sections.map((section, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <button
                onClick={() => toggleSection(i)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${section.level === 2 ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-500"}`}>
                    H{section.level}
                  </span>
                  <span className="text-sm font-medium text-gray-800 text-left">{section.heading}</span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-xs text-gray-400">{section.wordTarget}w</span>
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
                            <CheckCircle2 size={11} className="text-green-500 mt-0.5 flex-shrink-0" />
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
                          <li key={j} className="text-xs text-gray-500 italic bg-amber-50 px-2 py-1 rounded border-l-2 border-amber-300">
                            {ev}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={() => router.push(`/create/research/${articleId}`)}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            ← Back to research
          </button>
          <button
            onClick={writeArticle}
            disabled={writingArticle || !outline}
            className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white text-sm font-semibold rounded-xl hover:bg-purple-700 disabled:opacity-50 transition-colors"
          >
            {writingArticle ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            Write article →
          </button>
        </div>
      </div>
    </div>
  );
}
