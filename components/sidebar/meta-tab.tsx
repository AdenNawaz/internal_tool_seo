"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, Loader2, Wand2 } from "lucide-react";

interface MetaTabProps {
  title: string;
  metaDescription: string;
  targetKeyword: string | null;
  articleId: string;
  content: unknown;
  onTitleChange: (v: string) => void;
  onMetaChange: (v: string) => void;
  onSaveField: (patch: Record<string, unknown>) => void;
}

function Check({ pass, label, hint }: { pass: boolean; label: string; hint?: string }) {
  return (
    <div className="flex items-start gap-2.5 py-2 border-b border-gray-50 last:border-0">
      {pass
        ? <CheckCircle2 size={14} className="text-green-500 mt-0.5 shrink-0" />
        : <XCircle size={14} className="text-red-400 mt-0.5 shrink-0" />}
      <div className="flex-1 min-w-0">
        <span className={`text-xs ${pass ? "text-gray-600" : "text-gray-800"}`}>{label}</span>
        {hint && !pass && <p className="text-[10px] text-amber-600 mt-0.5">{hint}</p>}
      </div>
      <span className={`text-[10px] font-semibold shrink-0 ${pass ? "text-green-600" : "text-red-400"}`}>
        {pass ? "1/1" : "0/1"}
      </span>
    </div>
  );
}

export function MetaTab({ title, metaDescription, targetKeyword, articleId: _articleId, content, onTitleChange, onMetaChange, onSaveField }: MetaTabProps) {
  const [editing, setEditing] = useState(false);
  const [localTitle, setLocalTitle] = useState(title);
  const [localMeta, setLocalMeta] = useState(metaDescription);
  const [generating, setGenerating] = useState(false);

  const kw = (targetKeyword ?? "").toLowerCase().trim();
  const titleLen = title.length;
  const metaLen = metaDescription.length;

  const checks = [
    { label: "Title added", pass: title.trim().length > 0 },
    { label: `Title length 50–60 chars (${titleLen})`, pass: titleLen >= 50 && titleLen <= 60, hint: titleLen < 50 ? `Too short — add ${50 - titleLen} more chars` : `Too long — remove ${titleLen - 60} chars` },
    { label: "Title contains keyword", pass: !!kw && title.toLowerCase().includes(kw), hint: kw ? `Add "${targetKeyword}" near the start of the title` : "Set a target keyword first" },
    { label: "Description added", pass: metaDescription.trim().length > 0 },
    { label: `Description 120–160 chars (${metaLen})`, pass: metaLen >= 120 && metaLen <= 160, hint: metaLen < 120 ? `Too short — add ${120 - metaLen} more chars` : metaLen > 160 ? `Too long — remove ${metaLen - 160} chars` : undefined },
    { label: "Description contains keyword", pass: !!kw && metaDescription.toLowerCase().includes(kw), hint: kw ? `Include "${targetKeyword}" in the description` : "Set a target keyword first" },
  ];

  const passCount = checks.filter((c) => c.pass).length;

  async function generateMeta() {
    setGenerating(true);
    try {
      // Get first paragraph text for context
      let excerpt = "";
      if (Array.isArray(content)) {
        for (const block of content as Array<Record<string, unknown>>) {
          if (block.type === "paragraph") {
            excerpt = (block.content as Array<{ text?: string }> | undefined)
              ?.map((c) => c.text ?? "").join("") ?? "";
            if (excerpt) break;
          }
        }
      }
      const res = await fetch("/api/content/generate-meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: targetKeyword, title, excerpt }),
      });
      const data = await res.json() as { meta?: string };
      if (data.meta) {
        setLocalMeta(data.meta);
        onMetaChange(data.meta);
        onSaveField({ metaDescription: data.meta });
      }
    } finally {
      setGenerating(false);
    }
  }

  function commitEdit() {
    if (localTitle !== title) { onTitleChange(localTitle); onSaveField({ title: localTitle }); }
    if (localMeta !== metaDescription) { onMetaChange(localMeta); onSaveField({ metaDescription: localMeta }); }
    setEditing(false);
  }

  return (
    <div className="px-4 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-gray-700">Meta Tags</p>
          <p className="text-[10px] text-gray-400">{passCount}/6 checks passing</p>
        </div>
        <button
          onClick={() => { setLocalTitle(title); setLocalMeta(metaDescription); setEditing((v) => !v); }}
          className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${editing ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
        >
          {editing ? "Done" : "Edit"}
        </button>
      </div>

      {/* Checks */}
      <div className="bg-white rounded-xl border border-gray-100 px-3">
        {checks.map((c, i) => <Check key={i} pass={c.pass} label={c.label} hint={c.hint} />)}
      </div>

      {/* Inline editor */}
      {editing && (
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Title</label>
              <span className={`text-[10px] ${titleLen >= 50 && titleLen <= 60 ? "text-green-500" : "text-amber-500"}`}>{localTitle.length} chars</span>
            </div>
            <input
              value={localTitle}
              onChange={(e) => setLocalTitle(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-blue-300 transition-colors"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Meta description</label>
              <span className={`text-[10px] ${localMeta.length >= 120 && localMeta.length <= 160 ? "text-green-500" : "text-amber-500"}`}>{localMeta.length} chars</span>
            </div>
            <textarea
              value={localMeta}
              onChange={(e) => setLocalMeta(e.target.value)}
              rows={3}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-blue-300 transition-colors resize-none"
            />
            <div className="flex items-center justify-between mt-1.5">
              <button
                onClick={generateMeta}
                disabled={generating}
                className="flex items-center gap-1.5 text-[10px] text-purple-600 hover:text-purple-800 disabled:opacity-50 transition-colors"
              >
                {generating ? <Loader2 size={10} className="animate-spin" /> : <Wand2 size={10} />}
                Generate with AI
              </button>
              <button
                onClick={commitEdit}
                className="text-[10px] font-semibold text-gray-900 bg-gray-100 hover:bg-gray-200 px-2.5 py-1 rounded-md transition-colors"
              >
                Apply changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
