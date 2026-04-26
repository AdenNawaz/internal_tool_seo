"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Pin, CheckCircle2, ChevronRight, Loader2, AlertTriangle, TrendingUp, Target, MessageCircle, Zap, BarChart3, BookOpen } from "lucide-react";

type PinType = "keyword" | "header" | "question" | "opportunity" | "evidence";

interface PinnedItem {
  id: string;
  type: PinType;
  content: string;
  metadata?: Record<string, unknown>;
}

interface KwItem { keyword: string; volume: number; difficulty: number; coverage: number }
interface HeaderItem { level: number; text: string; source: string }
interface QuestionItem { question: string; source: string }
interface OpportunityItem { type: string; priority: string; title: string; description: string }
interface EvidenceItem { type: "stat" | "quote" | "finding"; text: string; context: string; source: string; sourceUrl: string; year: string | null }

function StepBar({ active }: { active: number }) {
  const steps = ["Configure", "Research", "Brief", "Write"];
  return (
    <div className="flex items-center gap-1 mb-6">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-1">
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${i === active ? "bg-blue-600 text-white" : i < active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
            <span>{i < active ? "✓" : i + 1}</span><span>{s}</span>
          </div>
          {i < steps.length - 1 && <ChevronRight size={12} className="text-gray-300" />}
        </div>
      ))}
    </div>
  );
}

function DifficultyBadge({ kd }: { kd: number }) {
  const [label, color] = kd <= 30 ? ["Easy", "bg-green-100 text-green-700"] : kd <= 60 ? ["Med", "bg-amber-100 text-amber-700"] : ["Hard", "bg-red-100 text-red-700"];
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${color}`}>{label}</span>;
}

function PinButton({ pinned, onPin, onUnpin }: { pinned: boolean; onPin: () => void; onUnpin: () => void }) {
  return (
    <button onClick={pinned ? onUnpin : onPin} className={`flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg transition-colors ${pinned ? "bg-blue-100 text-blue-700 hover:bg-blue-200" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
      {pinned ? <><CheckCircle2 size={11} />Pinned</> : <><Pin size={11} />Pin</>}
    </button>
  );
}

export default function ResearchPage() {
  const { articleId } = useParams<{ articleId: string }>();
  const router = useRouter();

  const [status, setStatus] = useState("connecting");
  const [stepMsg, setStepMsg] = useState("Starting research…");
  const [keywords, setKeywords] = useState<KwItem[]>([]);
  const [headers, setHeaders] = useState<HeaderItem[]>([]);
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [opportunities, setOpportunities] = useState<OpportunityItem[]>([]);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<Record<string, unknown> | null>(null);
  const [pins, setPins] = useState<PinnedItem[]>([]);
  const [generating, setGenerating] = useState(false);
  const started = useRef(false);

  // SSE connection
  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const es = new EventSource(`/api/create/research/${articleId}`);
    es.onmessage = (e) => {
      const event = JSON.parse(e.data) as { type: string; step?: string; message?: string; data?: unknown };
      if (event.type === "status") { setStepMsg(event.message ?? ""); setStatus("loading"); }
      else if (event.type === "keywords") { setKeywords(event.data as KwItem[]); }
      else if (event.type === "headers") { setHeaders(event.data as HeaderItem[]); }
      else if (event.type === "questions") { setQuestions(event.data as QuestionItem[]); }
      else if (event.type === "ai_analysis") { setAiAnalysis(event.data as Record<string, unknown>); }
      else if (event.type === "opportunities") { setOpportunities(event.data as OpportunityItem[]); }
      else if (event.type === "evidence") { setEvidence(event.data as EvidenceItem[]); }
      else if (event.type === "done") { setStatus("complete"); es.close(); }
      else if (event.type === "error") { setStatus("error"); es.close(); }
    };
    es.onerror = () => { setStatus("error"); es.close(); };
    return () => es.close();
  }, [articleId]);

  async function pin(type: PinType, content: string, metadata?: Record<string, unknown>) {
    const res = await fetch(`/api/create/research/${articleId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pin", type, content, metadata }),
    });
    const { id } = await res.json() as { id: string };
    setPins((prev) => [...prev, { id, type, content, metadata }]);
  }

  async function unpin(pinId: string) {
    await fetch(`/api/create/research/${articleId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unpin", pinId }),
    });
    setPins((prev) => prev.filter((p) => p.id !== pinId));
  }

  function isPinned(type: PinType, content: string) {
    return pins.some((p) => p.type === type && p.content === content);
  }

  function getPinId(type: PinType, content: string) {
    return pins.find((p) => p.type === type && p.content === content)?.id ?? "";
  }

  async function pinAll(type: PinType, items: Array<{ content: string; metadata?: Record<string, unknown> }>) {
    for (const item of items) {
      if (!isPinned(type, item.content)) await pin(type, item.content, item.metadata);
    }
  }

  const kwPins = pins.filter((p) => p.type === "keyword").length;
  const headerPins = pins.filter((p) => p.type === "header").length;
  const questionPins = pins.filter((p) => p.type === "question").length;
  const oppPins = pins.filter((p) => p.type === "opportunity").length;
  const evidencePins = pins.filter((p) => p.type === "evidence").length;

  const canGenerate = kwPins >= 3 && headerPins >= 2;

  async function handleGenerateBrief() {
    setGenerating(true);
    const res = await fetch("/api/brief/generate-from-pins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ articleId }),
    });
    if (res.ok) {
      router.push(`/create/brief/${articleId}`);
    } else {
      setGenerating(false);
    }
  }

  const aiSummary = aiAnalysis?.summary as Record<string, unknown> | undefined;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-6 py-10 flex gap-6">
        {/* Left: Pinned items sidebar */}
        <div className="w-64 shrink-0">
          <div className="sticky top-10">
            <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4">
              <p className="text-xs font-semibold text-gray-800 mb-4">Pinned items</p>
              <div className="space-y-2">
                {([["keyword", kwPins, "Keywords"], ["header", headerPins, "Headers"], ["question", questionPins, "Questions"], ["opportunity", oppPins, "Opportunities"], ["evidence", evidencePins, "Evidence"]] as const).map(([type, count, label]) => (
                  <div key={type} className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">{label}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${count > 0 ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-400"}`}>{count}</span>
                  </div>
                ))}
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100">
                {!canGenerate && (
                  <p className="text-[10px] text-gray-400 mb-3">
                    Pin at least {Math.max(0, 3 - kwPins)} more keyword{3 - kwPins !== 1 ? "s" : ""} and {Math.max(0, 2 - headerPins)} more header{2 - headerPins !== 1 ? "s" : ""} to generate the brief.
                  </p>
                )}
                <button
                  onClick={handleGenerateBrief}
                  disabled={!canGenerate || generating}
                  className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-1.5"
                >
                  {generating ? <><Loader2 size={12} className="animate-spin" />Generating…</> : "Generate brief →"}
                </button>
              </div>
            </div>

            {/* Pinned items list */}
            {pins.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2 max-h-80 overflow-y-auto">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Pinned</p>
                {pins.map((p) => (
                  <div key={p.id} className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-1.5 min-w-0">
                      <span className="text-[9px] font-semibold text-gray-400 uppercase mt-0.5 shrink-0">{p.type.slice(0, 2)}</span>
                      <span className="text-[11px] text-gray-700 truncate">{p.content}</span>
                    </div>
                    <button onClick={() => unpin(p.id)} className="text-gray-300 hover:text-gray-500 shrink-0 text-[10px]">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Research steps */}
        <div className="flex-1 min-w-0">
          <StepBar active={1} />

          {/* Summary card */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
            <div className="flex items-start gap-3">
              {status === "loading" ? (
                <Loader2 size={16} className="text-blue-500 animate-spin mt-0.5 shrink-0" />
              ) : status === "complete" ? (
                <CheckCircle2 size={16} className="text-green-500 mt-0.5 shrink-0" />
              ) : status === "error" ? (
                <AlertTriangle size={16} className="text-red-500 mt-0.5 shrink-0" />
              ) : null}
              <div>
                <p className="text-sm font-medium text-gray-800">{status === "complete" ? "Research complete — pin what you want to carry into the brief." : stepMsg}</p>
                <p className="text-xs text-gray-400 mt-1">Move through the research in a few quick decisions. Pin what you want to carry into the brief, then generate.</p>
              </div>
            </div>
          </div>

          {/* Step 1: Keywords */}
          <Section icon={<BarChart3 size={15} />} step={1} title="Confirm the keyword set" sub="Lock the core search intent before moving on.">
            {keywords.length === 0 ? (
              <LoadingOrEmpty loading={status === "loading"} msg="Fetching keyword data from Ahrefs…" empty="No keyword data available." />
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Recommended keywords</p>
                  <button onClick={() => pinAll("keyword", keywords.slice(0, 5).map((k) => ({ content: k.keyword, metadata: { volume: k.volume, difficulty: k.difficulty } })))} className="text-[10px] text-blue-600 hover:underline">Pin all top 5</button>
                </div>
                <div className="space-y-2">
                  {keywords.map((kw) => (
                    <div key={kw.keyword} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50/50">
                      <span className="text-xs font-medium text-gray-800 flex-1 min-w-0 truncate">{kw.keyword}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-gray-500">{kw.volume.toLocaleString()} /mo</span>
                        <span className="text-[10px] text-gray-400">{kw.coverage}% coverage</span>
                        <DifficultyBadge kd={kw.difficulty} />
                        <PinButton
                          pinned={isPinned("keyword", kw.keyword)}
                          onPin={() => pin("keyword", kw.keyword, { volume: kw.volume, difficulty: kw.difficulty })}
                          onUnpin={() => unpin(getPinId("keyword", kw.keyword))}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Section>

          {/* Step 2: Headers */}
          <Section icon={<BookOpen size={15} />} step={2} title="Confirm the SERP structure" sub="Use these recurring patterns to decide which sections belong in the brief.">
            <div className="mb-3 p-3 rounded-xl bg-amber-50 border border-amber-100">
              <p className="text-[10px] text-amber-700 leading-relaxed">Pinned headers shape the brief, but are not copied verbatim. We review your pinned headers, combine them with other pinned inputs, merge overlaps, rewrite awkward phrasing, and reorder sections so the brief reads as one coherent outline.</p>
            </div>
            {headers.length === 0 ? (
              <LoadingOrEmpty loading={status === "loading"} msg="Scraping competitor pages…" empty="No headers found." />
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Competitor headings</p>
                  <button onClick={() => pinAll("header", headers.slice(0, 8).map((h) => ({ content: h.text, metadata: { level: h.level, source: h.source } })))} className="text-[10px] text-blue-600 hover:underline">Pin top 8</button>
                </div>
                {/* Group by source */}
                {Array.from(new Set(headers.map((h) => h.source))).map((source) => (
                  <div key={source} className="mb-4">
                    <p className="text-[10px] font-semibold text-gray-400 mb-1.5">{source}</p>
                    <div className="space-y-1.5">
                      {headers.filter((h) => h.source === source).map((h, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-gray-100">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${h.level === 2 ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-500"}`}>H{h.level}</span>
                            <span className="text-xs text-gray-700 truncate">{h.text}</span>
                          </div>
                          <PinButton
                            pinned={isPinned("header", h.text)}
                            onPin={() => pin("header", h.text, { level: h.level, source: h.source })}
                            onUnpin={() => unpin(getPinId("header", h.text))}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </Section>

          {/* Step 3: Audience questions */}
          <Section icon={<MessageCircle size={15} />} step={3} title="Audience questions" sub="Pin the recurring questions worth answering.">
            {questions.length === 0 ? (
              <LoadingOrEmpty loading={status === "loading"} msg="Finding PAA and Reddit questions…" empty="No questions found." />
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Questions ({questions.length})</p>
                  <button onClick={() => pinAll("question", questions.map((q) => ({ content: q.question, metadata: { source: q.source } })))} className="text-[10px] text-blue-600 hover:underline">Pin all</button>
                </div>
                <div className="space-y-2">
                  {questions.map((q, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border border-gray-100">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${q.source === "reddit.com" ? "bg-orange-100 text-orange-600" : "bg-gray-100 text-gray-500"}`}>{q.source === "reddit.com" ? "Reddit" : "PAA"}</span>
                        <span className="text-xs text-gray-700">{q.question}</span>
                      </div>
                      <PinButton
                        pinned={isPinned("question", q.question)}
                        onPin={() => pin("question", q.question, { source: q.source })}
                        onUnpin={() => unpin(getPinId("question", q.question))}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </Section>

          {/* Step 4: AI Platform Analysis */}
          <Section icon={<Zap size={15} />} step={4} title="AI Platform Analysis" sub="See who gets cited and where the gaps are.">
            {!aiAnalysis ? (
              <LoadingOrEmpty loading={status === "loading"} msg="Querying AI platforms…" empty="AI analysis not available." />
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <StatBox label="AI sources cited" value={String(aiSummary?.aiSourcesCount ?? 0)} />
                  <StatBox label="Total citations" value={String(aiSummary?.totalCitations ?? 0)} />
                  <StatBox label="Platforms analysed" value={String(aiSummary?.totalPlatforms ?? 0)} />
                </div>
                {((aiSummary?.opportunities as unknown[]) ?? []).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Opportunities</p>
                    {((aiSummary?.opportunities as OpportunityItem[]) ?? []).map((opp, i) => (
                      <div key={i} className={`p-3 rounded-xl border ${opp.priority === "high" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${opp.priority === "high" ? "bg-red-200 text-red-700" : "bg-amber-200 text-amber-700"}`}>{opp.priority.toUpperCase()}</span>
                            </div>
                            <p className="text-xs font-medium text-gray-800">{opp.title}</p>
                            <p className="text-[10px] text-gray-500 mt-0.5">{opp.description}</p>
                          </div>
                          <PinButton
                            pinned={isPinned("opportunity", opp.title)}
                            onPin={() => pin("opportunity", opp.title, { description: opp.description, priority: opp.priority, type: opp.type })}
                            onUnpin={() => unpin(getPinId("opportunity", opp.title))}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </Section>

          {/* Step 5: Opportunities */}
          <Section icon={<Target size={15} />} step={5} title="Confirm the strongest opportunities" sub="Use SERP and AI visibility insights to find where the brief can add something new.">
            {opportunities.length === 0 ? (
              <LoadingOrEmpty loading={status === "loading"} msg="Identifying opportunities…" empty="No opportunities found." />
            ) : (
              <div className="space-y-2">
                {opportunities.map((opp, i) => (
                  <div key={i} className={`p-3 rounded-xl border ${opp.priority === "HIGH" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${opp.priority === "HIGH" ? "bg-red-200 text-red-700" : "bg-amber-200 text-amber-700"}`}>{opp.type.replace(/_/g, " ")}</span>
                          <span className={`text-[9px] font-semibold ${opp.priority === "HIGH" ? "text-red-600" : "text-amber-600"}`}>{opp.priority}</span>
                        </div>
                        <p className="text-xs font-medium text-gray-800">{opp.title}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5">{opp.description}</p>
                      </div>
                      <PinButton
                        pinned={isPinned("opportunity", opp.title)}
                        onPin={() => pin("opportunity", opp.title, { description: opp.description, priority: opp.priority, type: opp.type })}
                        onUnpin={() => unpin(getPinId("opportunity", opp.title))}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Step 6: Evidence */}
          <Section icon={<TrendingUp size={15} />} step={6} title="Pin the proof points" sub="Lock in the strongest statistics, quotes, and data so the brief has real support.">
            {evidence.length === 0 ? (
              <LoadingOrEmpty loading={status === "loading"} msg="Gathering evidence and statistics…" empty="No evidence found." />
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Recommended evidence</p>
                  <button onClick={() => pinAll("evidence", evidence.slice(0, 5).map((e) => ({ content: e.text, metadata: { type: e.type, source: e.source, sourceUrl: e.sourceUrl, year: e.year } })))} className="text-[10px] text-blue-600 hover:underline">Pin top 5</button>
                </div>
                <div className="space-y-2">
                  {evidence.map((ev, i) => (
                    <div key={i} className="p-3 rounded-xl border border-gray-100 bg-white">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${ev.type === "stat" ? "bg-green-100 text-green-700" : ev.type === "quote" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>{ev.type.toUpperCase()}</span>
                            {ev.year && <span className="text-[9px] text-gray-400">{ev.year}</span>}
                          </div>
                          <p className="text-xs text-gray-800 leading-relaxed">{ev.text}</p>
                          <p className="text-[10px] text-gray-400 mt-1">{ev.source} · <a href={ev.sourceUrl} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">{new URL(ev.sourceUrl).hostname.replace("www.", "")}</a></p>
                        </div>
                        <PinButton
                          pinned={isPinned("evidence", ev.text)}
                          onPin={() => pin("evidence", ev.text, { type: ev.type, source: ev.source, sourceUrl: ev.sourceUrl, year: ev.year })}
                          onUnpin={() => unpin(getPinId("evidence", ev.text))}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ icon, step, title, sub, children }: { icon: React.ReactNode; step: number; title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 text-gray-500">{icon}</div>
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Step {step}</p>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-center">
      <p className="text-lg font-bold text-gray-900">{value}</p>
      <p className="text-[10px] text-gray-400">{label}</p>
    </div>
  );
}

function LoadingOrEmpty({ loading, msg, empty }: { loading: boolean; msg: string; empty: string }) {
  return loading ? (
    <div className="flex items-center gap-2 text-xs text-gray-400 py-4">
      <Loader2 size={13} className="animate-spin" />{msg}
    </div>
  ) : (
    <p className="text-xs text-gray-400 py-4">{empty}</p>
  );
}
