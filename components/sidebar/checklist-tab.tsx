"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, CheckCircle2, AlertCircle, User, Link2, Quote, BarChart2, Plus } from "lucide-react";
import type { DiagnosticResult } from "@/lib/content-diagnostic";
import { computeTopicCoverage, buildCoverageKeywords, type KeywordCoverage, type CoverageStatus } from "@/lib/topic-coverage";


interface PinnedItem {
  id: string;
  type: string;
  content: string;
  metadata: Record<string, unknown> | null;
}

interface ChecklistTabProps {
  articleId: string;
  content: unknown;
  plainText: string;
  targetKeyword: string | null;
  secondaryKeywords: string[];
  scores: DiagnosticResult | null;
  authorProfile: { name?: string } | null;
  onInsertEvidence: (text: string) => void;
}

const STATUS_COLORS: Record<CoverageStatus, string> = {
  completed: "bg-green-100 text-green-800",
  in_progress: "bg-amber-100 text-amber-800",
  overuse: "bg-red-100 text-red-700",
  topic_gap: "bg-gray-100 text-gray-500",
};

const STATUS_LABELS: Record<CoverageStatus, string> = {
  completed: "✓",
  in_progress: "↑",
  overuse: "↑↑",
  topic_gap: "—",
};

function Section({ title, badge, children, defaultOpen = true }: { title: string; badge?: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between py-2 group">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{title}</span>
          {badge && <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full font-medium">{badge}</span>}
        </div>
        {open ? <ChevronDown size={12} className="text-gray-400" /> : <ChevronRight size={12} className="text-gray-400" />}
      </button>
      {open && <div className="pb-3">{children}</div>}
    </div>
  );
}

export function ChecklistTab({ articleId, content, plainText, targetKeyword, secondaryKeywords, scores, authorProfile, onInsertEvidence }: ChecklistTabProps) {
  const [coverageFilter, setCoverageFilter] = useState<CoverageStatus | "all">("all");
  const [coverageSearch, setCoverageSearch] = useState("");
  const [pins, setPins] = useState<PinnedItem[]>([]);
  const [pinsExpanded, setPinsExpanded] = useState(false);

  useEffect(() => {
    fetch(`/api/articles/${articleId}/pins`)
      .then((r) => r.ok ? r.json() : [])
      .then((data: PinnedItem[]) => setPins(data ?? []))
      .catch(() => {});
  }, [articleId]);

  const wordCount = useMemo(() => (plainText.match(/\b\w+\b/g) ?? []).length, [plainText]);

  const coverageKeywords = useMemo(() =>
    buildCoverageKeywords({ targetKeyword, secondaryKeywords, wordCount }),
    [targetKeyword, secondaryKeywords, wordCount]
  );

  const coverage = useMemo(() =>
    computeTopicCoverage({ plainText, keywords: coverageKeywords }),
    [plainText, coverageKeywords]
  );

  const filteredCoverage = useMemo(() => {
    let items = coverage;
    if (coverageFilter !== "all") items = items.filter((k) => k.status === coverageFilter);
    if (coverageSearch.trim()) items = items.filter((k) => k.keyword.toLowerCase().includes(coverageSearch.toLowerCase()));
    return items;
  }, [coverage, coverageFilter, coverageSearch]);

  // Extract headings from content for structure checklist
  const headings = useMemo(() => {
    if (!Array.isArray(content)) return [];
    const result: Array<{ level: number; text: string }> = [];
    function walk(blocks: unknown[]) {
      for (const block of blocks) {
        if (!block || typeof block !== "object") continue;
        const b = block as Record<string, unknown>;
        if (b.type === "heading") {
          const level = Number((b.props as Record<string, unknown>)?.level ?? 2);
          const text = (b.content as Array<{ text?: string }> | undefined)?.map((c) => c.text ?? "").join("") ?? "";
          result.push({ level, text });
        }
        if (Array.isArray(b.children)) walk(b.children as unknown[]);
      }
    }
    walk(content as unknown[]);
    return result;
  }, [content]);

  // Authority checks
  const stats = scores?.eeat.breakdown.find((b) => b.label.includes("statistics"));
  const links = scores?.eeat.breakdown.find((b) => b.label.includes("authoritative"));
  const authorityChecks = [
    {
      id: "author",
      icon: User,
      label: "Named author with credentials",
      passed: !!authorProfile?.name,
      hint: !authorProfile?.name ? "Complete Profile →" : undefined,
      hintHref: "/settings/author-profile",
    },
    {
      id: "stats",
      icon: BarChart2,
      label: "Contains concrete facts or statistics",
      passed: (stats?.earned ?? 0) >= 30,
      hint: (stats?.earned ?? 0) < 30 ? "Add 2–3 specific statistics with numbers" : undefined,
    },
    {
      id: "links",
      icon: Link2,
      label: "Claims backed by source links",
      passed: (links?.earned ?? 0) >= 20,
      hint: (links?.earned ?? 0) < 20 ? "Add links to authoritative sources" : undefined,
    },
    {
      id: "quotable",
      icon: Quote,
      label: "Has quotable takeaway statements",
      passed: (scores?.geo.quotability ?? 0) >= 50,
      hint: (scores?.geo.quotability ?? 0) < 50 ? "Add 2–3 short standalone declarative sentences" : undefined,
    },
  ];

  const authorityPassed = authorityChecks.filter((c) => c.passed).length;

  const evidencePins = pins.filter((p) => p.type === "evidence");
  const visiblePins = pinsExpanded ? evidencePins : evidencePins.slice(0, 3);

  const TYPE_COLORS: Record<string, string> = {
    stat: "bg-green-100 text-green-700",
    quote: "bg-blue-100 text-blue-700",
    finding: "bg-purple-100 text-purple-700",
  };

  return (
    <div className="px-4 py-3 space-y-1 divide-y divide-gray-50">
      {/* Topic Coverage */}
      <Section title="Topic Coverage" badge={`${coverage.filter((c) => c.status === "completed").length}/${coverage.length}`}>
        {coverage.length === 0 ? (
          <p className="text-xs text-gray-400">Set a target keyword to see coverage.</p>
        ) : (
          <>
            <div className="flex gap-1.5 mb-2">
              <input
                value={coverageSearch}
                onChange={(e) => setCoverageSearch(e.target.value)}
                placeholder="Filter topics…"
                className="flex-1 text-[11px] border border-gray-200 rounded-md px-2 py-1 outline-none focus:border-gray-300"
              />
              <select
                value={coverageFilter}
                onChange={(e) => setCoverageFilter(e.target.value as CoverageStatus | "all")}
                className="text-[11px] border border-gray-200 rounded-md px-1.5 py-1 outline-none bg-white"
              >
                <option value="all">All</option>
                <option value="completed">Completed</option>
                <option value="in_progress">In Progress</option>
                <option value="overuse">Overuse</option>
                <option value="topic_gap">Gap</option>
              </select>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {filteredCoverage.map((kw: KeywordCoverage) => (
                <span
                  key={kw.keyword}
                  className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full cursor-default ${STATUS_COLORS[kw.status]}`}
                  title={`${kw.keyword}: ${kw.actual} occurrences, target ${kw.target}`}
                >
                  <span className="font-medium">{STATUS_LABELS[kw.status]}</span>
                  {kw.keyword} {kw.ratio}
                </span>
              ))}
            </div>
          </>
        )}
      </Section>

      {/* Structure Checklist */}
      <Section title="Structure" badge={`${headings.length} headings`} defaultOpen={false}>
        {headings.length === 0 ? (
          <p className="text-xs text-gray-400">No headings found in the article yet.</p>
        ) : (
          <div className="space-y-1.5">
            {headings.map((h, i) => {
              const hasKw = targetKeyword ? h.text.toLowerCase().includes(targetKeyword.toLowerCase()) : true;
              return (
                <div key={i} className="flex items-center gap-2 group">
                  <span className={`text-[9px] font-bold px-1 py-0.5 rounded shrink-0 ${h.level === 1 ? "bg-red-100 text-red-700" : h.level === 2 ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"}`}>
                    H{h.level}
                  </span>
                  <span className="text-xs text-gray-700 truncate flex-1">{h.text || "(empty)"}</span>
                  {targetKeyword && !hasKw && (
                    <span className="text-[9px] text-amber-600 shrink-0 hidden group-hover:block">+ keyword</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* Authority Checklist */}
      <Section title="Authority" badge={`${authorityPassed}/${authorityChecks.length}`} defaultOpen={false}>
        <div className="space-y-2">
          {authorityChecks.map((check) => {
            const Icon = check.icon;
            return (
              <div key={check.id} className="flex items-start gap-2">
                {check.passed
                  ? <CheckCircle2 size={13} className="text-green-500 mt-0.5 shrink-0" />
                  : <AlertCircle size={13} className="text-amber-500 mt-0.5 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <Icon size={10} className="text-gray-400 shrink-0" />
                    <span className={`text-xs ${check.passed ? "text-gray-600" : "text-gray-800"}`}>{check.label}</span>
                  </div>
                  {check.hint && (
                    check.hintHref
                      ? <a href={check.hintHref} className="text-[10px] text-blue-600 hover:underline">{check.hint}</a>
                      : <p className="text-[10px] text-amber-600 mt-0.5">{check.hint}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Evidence */}
      {evidencePins.length > 0 && (
        <Section title="Evidence to include" badge={`${evidencePins.length}`} defaultOpen={false}>
          <div className="space-y-2">
            {visiblePins.map((pin) => {
              const meta = pin.metadata ?? {};
              const type = String((meta as Record<string, unknown>).type ?? "stat");
              return (
                <div key={pin.id} className="bg-gray-50 rounded-lg p-2.5 group">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${TYPE_COLORS[type] ?? "bg-gray-100 text-gray-500"}`}>
                        {type}
                      </span>
                      <p className="text-xs text-gray-700 mt-1 line-clamp-2">{pin.content}</p>
                      {!!(meta as Record<string, unknown>).source && (
                        <p className="text-[10px] text-gray-400 mt-0.5">— {String((meta as Record<string, unknown>).source)}</p>
                      )}
                    </div>
                    <button
                      onClick={() => onInsertEvidence(
                        type === "quote"
                          ? `> "${pin.content}" — ${String((meta as Record<string, unknown>).source ?? "Source")}`
                          : `According to ${String((meta as Record<string, unknown>).source ?? "research")}, ${pin.content}`
                      )}
                      className="shrink-0 text-[10px] text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded flex items-center gap-1 transition-colors"
                    >
                      <Plus size={9} /> Add
                    </button>
                  </div>
                </div>
              );
            })}
            {evidencePins.length > 3 && (
              <button onClick={() => setPinsExpanded((v) => !v)} className="text-[10px] text-blue-600 hover:underline">
                {pinsExpanded ? "Show less" : `Show all ${evidencePins.length} items`}
              </button>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}
