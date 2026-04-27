"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ChevronDown, X, Loader2, ChevronRight } from "lucide-react";

const CONTENT_TYPES = [
  { value: "blog_post", label: "Blog Post", description: "Conversational, story-driven", defaultWords: 1500 },
  { value: "guide", label: "Guide", description: "Step-by-step instructions", defaultWords: 2000 },
  { value: "pillar_page", label: "Pillar Page", description: "Comprehensive reference", defaultWords: 3000 },
  { value: "comparison", label: "Comparison Article", description: "Value proposition focused", defaultWords: 2000 },
  { value: "product_announcement", label: "Product Announcement", description: "Feature highlights and benefits", defaultWords: 800 },
];

const INTENT_TYPES = [
  { value: "experience", label: "Experience", description: "Write from first-hand perspective. Best for opinion pieces and case studies." },
  { value: "research", label: "Research", description: "Synthesize from multiple authoritative sources. Best for SEO content and guides." },
  { value: "teaching", label: "Teaching", description: "Explain concepts step by step. Best for tutorials and how-to content." },
];

const AUTHORITY_LEVELS = [
  { value: "standard", label: "Standard", description: "Reputable sources including industry blogs" },
  { value: "high", label: "High", description: "Major publications and academic sources only" },
  { value: "peer_reviewed", label: "Peer-reviewed", description: "Academic and research papers only" },
];

const COUNTRIES = [
  { value: "us", label: "United States" },
  { value: "gb", label: "United Kingdom" },
  { value: "ca", label: "Canada" },
  { value: "au", label: "Australia" },
  { value: "de", label: "Germany" },
  { value: "in", label: "India" },
];

function TagInput({ values, onChange, placeholder }: { values: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [input, setInput] = useState("");
  function add() {
    const trimmed = input.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
    if (trimmed && !values.includes(trimmed)) onChange([...values, trimmed]);
    setInput("");
  }
  return (
    <div className="flex flex-wrap gap-1.5 p-2.5 rounded-lg border border-gray-200 bg-white min-h-[40px]">
      {values.map((v) => (
        <span key={v} className="flex items-center gap-1 text-[11px] bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
          {v}
          <button onClick={() => onChange(values.filter((x) => x !== v))}><X size={10} /></button>
        </span>
      ))}
      <input
        className="flex-1 min-w-[120px] text-xs outline-none bg-transparent placeholder-gray-400"
        placeholder={values.length === 0 ? placeholder : "Add another…"}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }}
        onBlur={add}
      />
    </div>
  );
}

function StepBar({ active }: { active: number }) {
  const steps = ["Configure", "Research", "Brief", "Write"];
  return (
    <div className="flex items-center gap-1 mb-8">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-1">
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${i === active ? "bg-blue-600 text-white" : i < active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
            <span>{i < active ? "✓" : i + 1}</span>
            <span>{s}</span>
          </div>
          {i < steps.length - 1 && <ChevronRight size={12} className="text-gray-300" />}
        </div>
      ))}
    </div>
  );
}

function GenerateForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialContentType = searchParams.get("contentType") ?? "blog_post";
  const ct = CONTENT_TYPES.find((c) => c.value === initialContentType) ?? CONTENT_TYPES[0];

  const [contentType, setContentType] = useState(initialContentType);
  const [topic, setTopic] = useState("");
  const [intentType, setIntentType] = useState("research");
  const [country, setCountry] = useState("us");
  const [wordCount, setWordCount] = useState(ct.defaultWords);
  const [useSmartContext, setUseSmartContext] = useState(true);
  const [authorityLevel, setAuthorityLevel] = useState("standard");
  const [preferredSources, setPreferredSources] = useState<string[]>([]);
  const [excludedSources, setExcludedSources] = useState<string[]>([]);
  const [allowCompetitorMentions, setAllowCompetitorMentions] = useState(true);
  const [uniqueAngle, setUniqueAngle] = useState("");
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const topicRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const found = CONTENT_TYPES.find((c) => c.value === contentType);
    if (found) setWordCount(found.defaultWords);
  }, [contentType]);

  async function handleStart() {
    if (!topic.trim()) { topicRef.current?.focus(); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: topic.trim(),
          targetKeyword: topic.trim(),
          contentType,
          intentType,
          wordCountTarget: wordCount,
          country,
          useSmartContext,
          preferredSources,
          excludedSources,
          allowCompetitorMentions,
          uniqueAngle: uniqueAngle.trim() || undefined,
        }),
      });
      const { id } = await res.json();
      router.push(`/create/research/${id}`);
    } catch {
      setSaving(false);
    }
  }

  const selectedCt = CONTENT_TYPES.find((c) => c.value === contentType) ?? CONTENT_TYPES[0];

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <StepBar active={0} />

        <h1 className="text-2xl font-bold text-gray-900 mb-1">What do you want to write about?</h1>
        <p className="text-sm text-gray-400 mb-8">Configure the topic and intent — this shapes everything in the research pipeline.</p>

        {/* Sentence form */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-5 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-gray-500">I want to write a</span>
            <div className="relative">
              <select
                value={contentType}
                onChange={(e) => setContentType(e.target.value)}
                className="appearance-none text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg pl-3 pr-7 py-1.5 outline-none cursor-pointer"
              >
                {CONTENT_TYPES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-blue-500 pointer-events-none" />
            </div>
            <span className="text-sm text-gray-500">about</span>
          </div>

          <div>
            <textarea
              ref={topicRef}
              value={topic}
              onChange={(e) => setTopic(e.target.value.slice(0, 500))}
              placeholder="e.g. best project management tools for remote teams"
              rows={3}
              className="w-full text-sm text-gray-900 placeholder-gray-300 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-blue-300 resize-none transition-colors"
            />
            <div className="flex justify-between items-center mt-1">
              <span className="text-[10px] text-gray-400">{selectedCt.description}</span>
              <span className="text-[10px] text-gray-400">{topic.length}/500</span>
            </div>
          </div>

          {/* Smart Context toggle */}
          <div className="flex items-center justify-between pt-1">
            <div>
              <p className="text-xs font-medium text-gray-700">Smart Context</p>
              <p className="text-[10px] text-gray-400 mt-0.5">Use company profile and past content to ground the pipeline</p>
            </div>
            <button
              onClick={() => setUseSmartContext((v) => !v)}
              className={`w-10 h-5 rounded-full transition-colors relative ${useSmartContext ? "bg-blue-500" : "bg-gray-200"}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${useSmartContext ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </div>
        </div>

        {/* Settings row */}
        <div className="grid grid-cols-2 gap-4 mb-5">
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-2">Country</label>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full text-sm text-gray-800 border border-gray-200 rounded-lg px-3 py-2 outline-none"
            >
              {COUNTRIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-2">Target word count</label>
            <input
              type="number"
              value={wordCount}
              onChange={(e) => setWordCount(Number(e.target.value))}
              step={100}
              min={300}
              max={10000}
              className="w-full text-sm text-gray-800 border border-gray-200 rounded-lg px-3 py-2 outline-none"
            />
          </div>
        </div>

        {/* Content intent */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-5">
          <p className="text-xs font-semibold text-gray-700 mb-3">Content intent</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {INTENT_TYPES.map((intent) => (
              <button
                key={intent.value}
                onClick={() => setIntentType(intent.value)}
                className={`text-left p-3 rounded-xl border transition-colors ${intentType === intent.value ? "border-blue-300 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}
              >
                <p className={`text-xs font-semibold mb-1 ${intentType === intent.value ? "text-blue-700" : "text-gray-700"}`}>{intent.label}</p>
                <p className="text-[10px] text-gray-400 leading-relaxed">{intent.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Unique angle */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-5">
          <p className="text-xs font-semibold text-gray-700 mb-1">What makes your take different? <span className="font-normal text-gray-400">(optional)</span></p>
          <textarea
            value={uniqueAngle}
            onChange={(e) => setUniqueAngle(e.target.value)}
            placeholder="e.g. We have firsthand experience, We focus on a specific audience, We have proprietary data..."
            rows={2}
            className="w-full text-sm text-gray-900 placeholder-gray-300 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-blue-300 resize-none transition-colors mt-2"
          />
          <p className="text-[10px] text-gray-400 mt-1.5">This shapes the introduction and creates a dedicated section that stands out from competitors.</p>
        </div>

        {/* Source preferences (collapsible) */}
        <div className="bg-white rounded-2xl border border-gray-100 mb-8">
          <button
            onClick={() => setSourcesOpen((v) => !v)}
            className="w-full flex items-center justify-between px-6 py-4 text-left"
          >
            <p className="text-xs font-semibold text-gray-700">Source preferences <span className="font-normal text-gray-400 ml-1">— optional</span></p>
            <ChevronDown size={14} className={`text-gray-400 transition-transform ${sourcesOpen ? "rotate-180" : ""}`} />
          </button>

          {sourcesOpen && (
            <div className="px-6 pb-6 space-y-4 border-t border-gray-100 pt-4">
              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1.5">Authority level</label>
                <div className="space-y-1.5">
                  {AUTHORITY_LEVELS.map((a) => (
                    <label key={a.value} className="flex items-start gap-2 cursor-pointer">
                      <input type="radio" name="authority" value={a.value} checked={authorityLevel === a.value} onChange={() => setAuthorityLevel(a.value)} className="mt-0.5" />
                      <div>
                        <span className="text-xs font-medium text-gray-700">{a.label}</span>
                        <span className="text-[10px] text-gray-400 ml-1.5">{a.description}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1.5">Prioritise sources from</label>
                <TagInput values={preferredSources} onChange={setPreferredSources} placeholder="gartner.com, mckinsey.com…" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1.5">Never link to</label>
                <TagInput values={excludedSources} onChange={setExcludedSources} placeholder="competitor.com…" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={allowCompetitorMentions} onChange={(e) => setAllowCompetitorMentions(e.target.checked)} />
                <span className="text-xs text-gray-700">Include competitor mentions in generated content</span>
              </label>
            </div>
          )}
        </div>

        <button
          onClick={handleStart}
          disabled={saving || !topic.trim()}
          className="w-full py-3.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          {saving ? <><Loader2 size={15} className="animate-spin" /> Creating research session…</> : "Start Research →"}
        </button>
      </div>
    </div>
  );
}

export default function GeneratePage() {
  return <Suspense><GenerateForm /></Suspense>;
}
