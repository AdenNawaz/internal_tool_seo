"use client";

import { useEffect, useState } from "react";
import { Eye, MessageSquare, Bot, Plus, Trash2, Loader2, RefreshCw, CheckCircle, XCircle } from "lucide-react";

type Tab = "overview" | "prompts" | "crawlers";


interface TrackedPrompt {
  id: string;
  prompt: string;
  category: string | null;
  snapshotCount: number;
  platforms: string[];
  visibleCount: number;
  citedCount: number;
  lastChecked: string | null;
}

interface CrawlerLog {
  id: string;
  bot: string;
  url: string;
  visitedAt: string;
}

interface QueryResult {
  platforms: Array<{
    platform: string;
    companyAppears: boolean;
    companyCited: boolean;
    competitorsCited: string[];
    response: string;
  }>;
  summary: {
    totalPlatforms: number;
    platformsWhereVisible: number;
    platformsWhereCited: number;
    competitorsCited: string[];
    opportunities: Array<{ type: string; priority: string; title: string; description: string }>;
  };
}

export default function AIVisibilityPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [trackedPrompts, setTrackedPrompts] = useState<TrackedPrompt[]>([]);
  const [crawlerLogs, setCrawlerLogs] = useState<CrawlerLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPrompt, setNewPrompt] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [addingPrompt, setAddingPrompt] = useState(false);
  const [queryingPromptId, setQueryingPromptId] = useState<string | null>(null);
  const [queryResult, setQueryResult] = useState<{ promptId: string; result: QueryResult } | null>(null);

  useEffect(() => {
    void loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [promptsRes, crawlersRes] = await Promise.all([
        fetch("/api/ai-visibility/prompts"),
        fetch("/api/ai-visibility/log-crawl"),
      ]);
      const prompts = await promptsRes.json() as TrackedPrompt[];
      const crawlers = await crawlersRes.json() as CrawlerLog[];
      setTrackedPrompts(prompts);
      setCrawlerLogs(crawlers);
    } finally {
      setLoading(false);
    }
  }

  async function addPrompt() {
    if (!newPrompt.trim()) return;
    setAddingPrompt(true);
    try {
      const res = await fetch("/api/ai-visibility/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: newPrompt.trim(), category: newCategory.trim() || undefined }),
      });
      const created = await res.json() as TrackedPrompt;
      setTrackedPrompts((prev) => [{ ...created, snapshotCount: 0, platforms: [], visibleCount: 0, citedCount: 0, lastChecked: null }, ...prev]);
      setNewPrompt("");
      setNewCategory("");
    } finally {
      setAddingPrompt(false);
    }
  }

  async function deletePrompt(id: string) {
    await fetch("/api/ai-visibility/prompts", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setTrackedPrompts((prev) => prev.filter((p) => p.id !== id));
  }

  async function runQuery(prompt: TrackedPrompt) {
    setQueryingPromptId(prompt.id);
    setQueryResult(null);
    try {
      const res = await fetch("/api/ai-visibility/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: prompt.prompt, saveSnapshot: true }),
      });
      const result = await res.json() as QueryResult;
      setQueryResult({ promptId: prompt.id, result });
      await loadAll();
    } finally {
      setQueryingPromptId(null);
    }
  }

  // Overview stats from tracked prompts
  const totalChecks = trackedPrompts.reduce((sum, p) => sum + p.snapshotCount, 0);
  const visibleChecks = trackedPrompts.reduce((sum, p) => sum + p.visibleCount, 0);
  const citedChecks = trackedPrompts.reduce((sum, p) => sum + p.citedCount, 0);
  const visibilityRate = totalChecks > 0 ? Math.round((visibleChecks / totalChecks) * 100) : 0;
  const citationRate = totalChecks > 0 ? Math.round((citedChecks / totalChecks) * 100) : 0;

  const TABS: Array<{ id: Tab; label: string; icon: typeof Eye }> = [
    { id: "overview", label: "Overview", icon: Eye },
    { id: "prompts", label: "Prompts", icon: MessageSquare },
    { id: "crawlers", label: "Crawler Logs", icon: Bot },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">AI Visibility</h1>
          <p className="text-sm text-gray-400 mt-1">Track how AI platforms respond to queries related to your brand and topics.</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 w-fit">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        ) : (
          <>
            {/* Overview tab */}
            {tab === "overview" && (
              <div className="space-y-6">
                {/* Stats */}
                <div className="grid grid-cols-4 gap-4">
                  {[
                    { label: "Tracked queries", value: trackedPrompts.length },
                    { label: "Total checks", value: totalChecks },
                    { label: "Visibility rate", value: `${visibilityRate}%` },
                    { label: "Citation rate", value: `${citationRate}%` },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-white rounded-xl border border-gray-100 p-4">
                      <div className="text-2xl font-bold text-gray-900">{value}</div>
                      <div className="text-xs text-gray-400 mt-1">{label}</div>
                    </div>
                  ))}
                </div>

                {/* Per-prompt visibility breakdown */}
                {trackedPrompts.length === 0 ? (
                  <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
                    <MessageSquare size={28} className="text-gray-200 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">No prompts tracked yet. Add prompts in the Prompts tab.</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-50">
                      <h2 className="text-sm font-semibold text-gray-700">Prompt performance</h2>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-400 border-b border-gray-50">
                          <th className="px-5 py-2 text-left font-medium">Prompt</th>
                          <th className="px-4 py-2 text-center font-medium">Checks</th>
                          <th className="px-4 py-2 text-center font-medium">Visible</th>
                          <th className="px-4 py-2 text-center font-medium">Cited</th>
                          <th className="px-4 py-2 text-left font-medium">Platforms</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trackedPrompts.map((p) => (
                          <tr key={p.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                            <td className="px-5 py-3 text-gray-700 max-w-xs">
                              <div className="truncate">{p.prompt}</div>
                              {p.category && <div className="text-[10px] text-gray-400">{p.category}</div>}
                            </td>
                            <td className="px-4 py-3 text-center text-gray-500">{p.snapshotCount}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`text-xs font-medium ${p.visibleCount > 0 ? "text-green-600" : "text-gray-300"}`}>
                                {p.visibleCount}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`text-xs font-medium ${p.citedCount > 0 ? "text-blue-600" : "text-gray-300"}`}>
                                {p.citedCount}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex gap-1 flex-wrap">
                                {p.platforms.map((pl) => (
                                  <span key={pl} className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">{pl}</span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Prompts tab */}
            {tab === "prompts" && (
              <div className="space-y-4">
                {/* Add prompt form */}
                <div className="bg-white rounded-xl border border-gray-100 p-4">
                  <div className="flex gap-2">
                    <input
                      value={newPrompt}
                      onChange={(e) => setNewPrompt(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") void addPrompt(); }}
                      placeholder="Enter a query to track, e.g. 'best content marketing tools'"
                      className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-blue-300 transition-colors"
                    />
                    <input
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      placeholder="Category (optional)"
                      className="w-36 text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-blue-300 transition-colors"
                    />
                    <button
                      onClick={addPrompt}
                      disabled={addingPrompt || !newPrompt.trim()}
                      className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
                    >
                      {addingPrompt ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                      Add
                    </button>
                  </div>
                </div>

                {/* Prompt list */}
                {trackedPrompts.length === 0 ? (
                  <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
                    <p className="text-sm text-gray-400">No prompts tracked yet. Add one above.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {trackedPrompts.map((p) => (
                      <div key={p.id} className="bg-white rounded-xl border border-gray-100 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800">{p.prompt}</p>
                            {p.category && <p className="text-xs text-gray-400 mt-0.5">{p.category}</p>}
                            {p.lastChecked && (
                              <p className="text-xs text-gray-300 mt-1">
                                Last checked: {new Date(p.lastChecked).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              onClick={() => void runQuery(p)}
                              disabled={queryingPromptId === p.id}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-lg hover:bg-blue-100 disabled:opacity-50 transition-colors"
                            >
                              {queryingPromptId === p.id ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                              Run check
                            </button>
                            <button
                              onClick={() => void deletePrompt(p.id)}
                              className="p-1.5 text-gray-300 hover:text-red-500 transition-colors"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        {/* Inline result */}
                        {queryResult?.promptId === p.id && (
                          <div className="mt-4 border-t border-gray-50 pt-4">
                            <div className="grid grid-cols-3 gap-3 mb-3">
                              {queryResult.result.platforms.map((pl) => (
                                <div key={pl.platform} className="bg-gray-50 rounded-lg p-3">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-semibold text-gray-700 capitalize">{pl.platform.replace("_", " ")}</span>
                                    {pl.companyAppears ? (
                                      <CheckCircle size={12} className="text-green-500" />
                                    ) : (
                                      <XCircle size={12} className="text-gray-300" />
                                    )}
                                  </div>
                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between text-[10px]">
                                      <span className="text-gray-400">Mentioned</span>
                                      <span className={pl.companyAppears ? "text-green-600 font-medium" : "text-gray-300"}>
                                        {pl.companyAppears ? "Yes" : "No"}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between text-[10px]">
                                      <span className="text-gray-400">Cited</span>
                                      <span className={pl.companyCited ? "text-blue-600 font-medium" : "text-gray-300"}>
                                        {pl.companyCited ? "Yes" : "No"}
                                      </span>
                                    </div>
                                    {pl.competitorsCited.length > 0 && (
                                      <div className="text-[10px] text-orange-500 mt-1">
                                        Competitors: {pl.competitorsCited.join(", ")}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                            {queryResult.result.summary.opportunities.length > 0 && (
                              <div className="space-y-1.5">
                                {queryResult.result.summary.opportunities.map((opp, i) => (
                                  <div key={i} className={`px-3 py-2 rounded-lg text-xs ${opp.priority === "high" ? "bg-red-50 border border-red-100" : "bg-amber-50 border border-amber-100"}`}>
                                    <span className="font-medium text-gray-800">{opp.title}</span>
                                    <span className="text-gray-500 ml-2">{opp.description}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Crawler Logs tab */}
            {tab === "crawlers" && (
              <div>
                {crawlerLogs.length === 0 ? (
                  <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
                    <Bot size={28} className="text-gray-200 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">No crawler visits logged yet.</p>
                    <p className="text-xs text-gray-300 mt-1">Logs are recorded when AI bots visit your site via the log-crawl API.</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-400 border-b border-gray-100 bg-gray-50">
                          <th className="px-5 py-3 text-left font-medium">Bot</th>
                          <th className="px-5 py-3 text-left font-medium">URL visited</th>
                          <th className="px-5 py-3 text-left font-medium">Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {crawlerLogs.map((log) => (
                          <tr key={log.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                            <td className="px-5 py-3">
                              <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full font-medium">{log.bot}</span>
                            </td>
                            <td className="px-5 py-3 text-gray-500 max-w-sm">
                              <div className="truncate">{log.url}</div>
                            </td>
                            <td className="px-5 py-3 text-gray-400 text-xs whitespace-nowrap">
                              {new Date(log.visitedAt).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
