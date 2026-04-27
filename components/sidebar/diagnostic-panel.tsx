"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarChart2, Shield, ClipboardList, Tag, Zap } from "lucide-react";
import { computeDiagnostic, type DiagnosticResult } from "@/lib/content-diagnostic";
import { extractPlainText, getReadabilityScore } from "@/lib/text-analysis";
import { MetaTab } from "./meta-tab";
import { GuardTab } from "./guard-tab";
import { ChecklistTab } from "./checklist-tab";

interface AuthorProfile {
  name?: string;
  bio?: string;
  credentials?: string;
  linkedinUrl?: string;
}

type PanelTab = "score" | "checklist" | "meta" | "guard";

interface DiagnosticPanelProps {
  articleId: string;
  title: string;
  metaDescription: string;
  targetKeyword: string | null;
  content: unknown;
  status: string;
  publishedUrl: string | null;
  createdAt?: string;
  secondaryKeywords?: string[];
  onTitleChange: (v: string) => void;
  onMetaChange: (v: string) => void;
  onSaveField: (patch: Record<string, unknown>) => void;
  onReplaceContent: (blocks: unknown) => void;
  onMarkReady: () => void;
  onInsertEvidence?: (text: string) => void;
}

// ── Gauge ─────────────────────────────────────────────────────────────────

function ScoreGauge({ score }: { score: number }) {
  const r = 50;
  const circ = Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 80 ? "#22c55e" : score >= 60 ? "#f59e0b" : "#ef4444";
  const label = score >= 80 ? "Good" : score >= 60 ? "Fair" : "Needs work";
  return (
    <div className="flex flex-col items-center py-2">
      <svg width="120" height="72" viewBox="0 0 120 72">
        <path d="M 10 62 A 50 50 0 0 1 110 62" stroke="#f3f4f6" strokeWidth="10" fill="none" strokeLinecap="round" />
        <path d="M 10 62 A 50 50 0 0 1 110 62" stroke={color} strokeWidth="10" fill="none" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease", transformOrigin: "60px 62px" }} />
        <text x="60" y="56" textAnchor="middle" fontSize="22" fontWeight="700" fill={color}>{score}</text>
      </svg>
      <p className="text-[10px] font-medium mt-0.5" style={{ color }}>{label}</p>
      <p className="text-[10px] text-gray-400">Combined optimization score</p>
    </div>
  );
}

// ── Sub-bar ───────────────────────────────────────────────────────────────

function SubBar({ label, value }: { label: string; value: number }) {
  const color = value >= 80 ? "bg-green-500" : value >= 50 ? "bg-amber-400" : "bg-red-400";
  const textColor = value >= 80 ? "text-green-600" : value >= 50 ? "text-amber-600" : "text-red-500";
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="text-[10px] text-gray-500 w-20 shrink-0 truncate">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
        <div className={`h-1.5 rounded-full ${color} transition-all duration-500`} style={{ width: `${value}%` }} />
      </div>
      <span className={`text-[10px] font-semibold w-7 text-right ${textColor}`}>{value}</span>
    </div>
  );
}

// ── Score card ────────────────────────────────────────────────────────────

function ScoreCard({ label, score, bars, accent, onImprove }: {
  label: string;
  score: number;
  bars: Array<{ label: string; value: number }>;
  accent: string;
  onImprove?: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const scoreColor = score >= 80 ? "text-green-600" : score >= 50 ? "text-amber-600" : "text-red-500";
  const ringColor = score >= 80 ? "border-green-200 bg-green-50" : score >= 50 ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50";
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${ringColor} ${accent}`}>{label}</span>
          {onImprove && score < 70 && (
            <button
              onClick={(e) => { e.stopPropagation(); onImprove(); }}
              className="text-[9px] text-purple-600 bg-purple-50 hover:bg-purple-100 px-1.5 py-0.5 rounded transition-colors"
            >
              Improve +
            </button>
          )}
        </div>
        <span className={`text-sm font-bold ${scoreColor}`}>{score}</span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-0.5">
          {bars.map((b) => <SubBar key={b.label} label={b.label} value={b.value} />)}
        </div>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────

export function DiagnosticPanel({
  articleId, title, metaDescription, targetKeyword, content, status, publishedUrl, createdAt,
  secondaryKeywords = [],
  onTitleChange, onMetaChange, onSaveField, onReplaceContent, onMarkReady, onInsertEvidence,
}: DiagnosticPanelProps) {
  const [tab, setTab] = useState<PanelTab>("score");
  const [scores, setScores] = useState<DiagnosticResult | null>(null);
  const [authorProfile, setAuthorProfile] = useState<AuthorProfile | null>(null);
  const [diagnosticOpen, setDiagnosticOpen] = useState(false);
  const scoreTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load author profile once
  useEffect(() => {
    fetch("/api/settings/author-profile")
      .then((r) => r.ok ? r.json() : null)
      .then((data: AuthorProfile | null) => setAuthorProfile(data))
      .catch(() => {});
  }, []);

  const plainText = useMemo(() =>
    Array.isArray(content) ? extractPlainText(content as unknown[]) : "",
    [content]
  );

  // Recompute on 3s debounce
  const recompute = useCallback(() => {
    const readability = getReadabilityScore(plainText);
    const result = computeDiagnostic({
      plainText,
      content,
      title,
      metaDescription: metaDescription || null,
      targetKeyword,
      readabilityScore: readability.score,
      authorName: authorProfile?.name ?? null,
      authorBio: authorProfile?.bio ?? null,
      authorLinkedin: authorProfile?.linkedinUrl ?? null,
      authorCredentials: authorProfile?.credentials ?? null,
    });
    setScores(result);
  }, [plainText, content, title, metaDescription, targetKeyword, authorProfile]);

  useEffect(() => {
    if (scoreTimer.current) clearTimeout(scoreTimer.current);
    scoreTimer.current = setTimeout(recompute, 3000);
    return () => { if (scoreTimer.current) clearTimeout(scoreTimer.current); };
  }, [recompute]);

  // Trigger immediate recompute on mount
  useEffect(() => { recompute(); }, [recompute]);

  const TABS: Array<{ id: PanelTab; icon: typeof BarChart2; label: string }> = [
    { id: "score", icon: BarChart2, label: "Score" },
    { id: "checklist", icon: ClipboardList, label: "Checklist" },
    { id: "meta", icon: Tag, label: "Meta" },
    { id: "guard", icon: Shield, label: "Guard" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Sub-tabs */}
      <div className="flex border-b border-gray-100 shrink-0">
        {TABS.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2 transition-colors ${tab === id ? "text-gray-900 border-b-2 border-gray-900" : "text-gray-400 hover:text-gray-600"}`}
          >
            <Icon size={13} />
            <span className="text-[9px] font-medium">{label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* SCORE TAB */}
        {tab === "score" && (
          <div className="px-3 py-3 space-y-3">
            <ScoreGauge score={scores?.combined ?? 0} />

            {/* Metric pills */}
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { label: "Words", value: scores?.wordCount ?? 0 },
                { label: "Headers", value: scores?.headerCount ?? 0 },
                { label: "Links", value: scores?.linkCount ?? 0 },
              ].map(({ label, value }) => (
                <div key={label} className="bg-gray-50 rounded-lg p-2 text-center">
                  <p className="text-sm font-bold text-gray-900">{value}</p>
                  <p className="text-[10px] text-gray-400">{label}</p>
                </div>
              ))}
            </div>

            {/* Improve EEAT button */}
            {scores && scores.eeat.score < 70 && (
              <button
                onClick={() => setDiagnosticOpen(true)}
                className="w-full flex items-center justify-center gap-1.5 py-2 bg-purple-600 text-white text-xs font-semibold rounded-xl hover:bg-purple-700 transition-colors"
              >
                <Zap size={12} />
                Improve EEAT (+{Math.min(70 - scores.eeat.score, 30)} pts)
              </button>
            )}

            {/* Score cards */}
            {scores ? (
              <div className="space-y-2">
                <ScoreCard
                  label="EEAT"
                  score={scores.eeat.score}
                  accent="text-blue-700"
                  onImprove={() => setDiagnosticOpen(true)}
                  bars={[
                    { label: "Trust", value: scores.eeat.trust },
                    { label: "Expertise", value: scores.eeat.expertise },
                    { label: "Authority", value: scores.eeat.authority },
                  ]}
                />
                <ScoreCard
                  label="GEO"
                  score={scores.geo.score}
                  accent="text-green-700"
                  onImprove={() => setDiagnosticOpen(true)}
                  bars={[
                    { label: "Quotability", value: scores.geo.quotability },
                    { label: "Structure", value: scores.geo.structure },
                    { label: "Definitions", value: scores.geo.definitions },
                    { label: "Takeaways", value: scores.geo.takeaways },
                    { label: "Citable data", value: scores.geo.citableData },
                  ]}
                />
                <ScoreCard
                  label="SEO"
                  score={scores.seo.score}
                  accent="text-amber-700"
                  bars={[
                    { label: "Keywords", value: scores.seo.keywords },
                    { label: "Meta tags", value: scores.seo.metaTags },
                    { label: "Structure", value: scores.seo.structure },
                    { label: "Readability", value: scores.seo.readability },
                  ]}
                />
              </div>
            ) : (
              <p className="text-xs text-gray-400 text-center py-4">Scoring in 3s…</p>
            )}

            {/* Mark ready */}
            <button
              onClick={onMarkReady}
              disabled={status === "ready" || status === "published"}
              className={`w-full text-xs font-medium rounded-xl px-3 py-2 transition-colors ${status === "ready" || status === "published" ? "bg-green-50 text-green-600" : "bg-gray-900 text-white hover:bg-gray-700"}`}
            >
              {status === "ready" || status === "published" ? "Marked as ready ✓" : "Mark as ready"}
            </button>
          </div>
        )}

        {tab === "checklist" && (
          <ChecklistTab
            articleId={articleId}
            content={content}
            plainText={plainText}
            targetKeyword={targetKeyword}
            secondaryKeywords={secondaryKeywords}
            scores={scores}
            authorProfile={authorProfile}
            onInsertEvidence={onInsertEvidence ?? (() => {})}
          />
        )}

        {tab === "meta" && (
          <MetaTab
            title={title}
            metaDescription={metaDescription}
            targetKeyword={targetKeyword}
            articleId={articleId}
            content={content}
            onTitleChange={onTitleChange}
            onMetaChange={onMetaChange}
            onSaveField={onSaveField}
          />
        )}

        {tab === "guard" && (
          <GuardTab
            articleId={articleId}
            status={status}
            publishedUrl={publishedUrl}
            createdAt={createdAt}
            onSaveField={onSaveField}
          />
        )}
      </div>

      {/* Diagnostic modal — lazy import to keep bundle small */}
      {diagnosticOpen && scores && (
        <DiagnosticModalLazy
          articleId={articleId}
          scores={scores}
          onClose={() => setDiagnosticOpen(false)}
          onApply={(markdown) => {
            // Parse markdown back to blocks (simplified: inject as a single paragraph for now)
            // Real impl would go through a markdown-to-blocknote parser
            const blocks = markdownToBlocks(markdown);
            onReplaceContent(blocks);
            setDiagnosticOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ── Lazy modal wrapper ────────────────────────────────────────────────────

import { DiagnosticModal } from "@/components/diagnostic-modal";

function DiagnosticModalLazy(props: React.ComponentProps<typeof DiagnosticModal>) {
  return <DiagnosticModal {...props} />;
}

// ── Markdown → BlockNote blocks (simplified) ──────────────────────────────

function markdownToBlocks(markdown: string): unknown[] {
  const lines = markdown.split("\n");
  const blocks: unknown[] = [];
  let id = 0;
  const nextId = () => `gen-${++id}`;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("### ")) {
      blocks.push({ id: nextId(), type: "heading", props: { level: 3, textColor: "default", backgroundColor: "default" }, content: [{ type: "text", text: trimmed.slice(4), styles: {} }], children: [] });
    } else if (trimmed.startsWith("## ")) {
      blocks.push({ id: nextId(), type: "heading", props: { level: 2, textColor: "default", backgroundColor: "default" }, content: [{ type: "text", text: trimmed.slice(3), styles: {} }], children: [] });
    } else if (trimmed.startsWith("# ")) {
      blocks.push({ id: nextId(), type: "heading", props: { level: 1, textColor: "default", backgroundColor: "default" }, content: [{ type: "text", text: trimmed.slice(2), styles: {} }], children: [] });
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      blocks.push({ id: nextId(), type: "bulletListItem", props: { textColor: "default", backgroundColor: "default" }, content: [{ type: "text", text: trimmed.slice(2), styles: {} }], children: [] });
    } else if (/^\d+\. /.test(trimmed)) {
      blocks.push({ id: nextId(), type: "numberedListItem", props: { textColor: "default", backgroundColor: "default" }, content: [{ type: "text", text: trimmed.replace(/^\d+\. /, ""), styles: {} }], children: [] });
    } else if (trimmed.startsWith("> ")) {
      blocks.push({ id: nextId(), type: "paragraph", props: { textColor: "default", backgroundColor: "default", textAlignment: "left" }, content: [{ type: "text", text: trimmed.slice(2), styles: { italic: true } }], children: [] });
    } else {
      blocks.push({ id: nextId(), type: "paragraph", props: { textColor: "default", backgroundColor: "default", textAlignment: "left" }, content: [{ type: "text", text: trimmed, styles: {} }], children: [] });
    }
  }
  return blocks;
}
