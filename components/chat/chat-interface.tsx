"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Send, RotateCcw, Loader2, CheckCircle2, Circle, ExternalLink } from "lucide-react";
import { ResearchState, ResearchStep, KeywordData, OutlineItem, CompetitorData, SSEEvent } from "@/lib/agents/types";

const STORAGE_KEY = "seo-tool-chat-state";

const STEPS: { key: ResearchStep; label: string }[] = [
  { key: "keywords", label: "Keywords" },
  { key: "keywords_approval", label: "Approve" },
  { key: "competitors", label: "Competitors" },
  { key: "outline", label: "Outline" },
  { key: "outline_approval", label: "Review" },
  { key: "writing", label: "Writing" },
  { key: "complete", label: "Done" },
];

const STEP_ORDER: ResearchStep[] = [
  "init", "keywords", "keywords_approval", "competitors",
  "outline", "outline_approval", "writing", "complete",
];

const QUICK_REPLIES: Partial<Record<ResearchStep, string[]>> = {
  keywords_approval: ["Looks good, proceed", "Find easier keywords", "More volume please", "Focus on long-tail"],
  outline_approval: ["Looks good, start writing", "Add a section about pricing", "Make it shorter", "Add more AEO questions"],
};

const TYPE_COLORS: Record<string, string> = {
  seo: "bg-blue-100 text-blue-700",
  geo: "bg-green-100 text-green-700",
  aeo: "bg-purple-100 text-purple-700",
  general: "bg-gray-100 text-gray-600",
  primary: "bg-yellow-100 text-yellow-800",
  informational: "bg-sky-100 text-sky-700",
  commercial: "bg-orange-100 text-orange-700",
  transactional: "bg-red-100 text-red-700",
  navigational: "bg-gray-100 text-gray-600",
};

function defaultState(): ResearchState {
  return {
    topic: "",
    country: "us",
    contentType: "blog",
    primaryKeyword: "",
    secondaryKeywords: [],
    keywordsApproved: false,
    competitorUrls: [],
    competitorData: [],
    outline: [],
    outlineApproved: false,
    articleContent: "",
    articleId: null,
    currentStep: "init",
    messages: [],
  };
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  keywords?: KeywordData[];
  competitors?: CompetitorData[];
  outline?: OutlineItem[];
  articleId?: string;
}

function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, '<code class="bg-gray-100 text-gray-800 px-1 rounded text-xs font-mono">$1</code>')
    .replace(/^### (.+)$/gm, '<h3 class="font-semibold text-sm mt-3 mb-1 text-gray-800">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="font-semibold text-base mt-4 mb-1 text-gray-900">$1</h2>')
    .replace(/^---$/gm, '<hr class="my-3 border-gray-200"/>')
    .replace(/^- (.+)$/gm, '<li class="ml-3 list-disc text-sm leading-relaxed">$1</li>')
    .replace(/(<li.*<\/li>\n?)+/g, '<ul class="my-1 space-y-0.5">$&</ul>')
    .replace(/\n\n/g, "<br/><br/>")
    .replace(/\n/g, "<br/>");
}

function StepBar({ current }: { current: ResearchStep }) {
  const currentIdx = STEP_ORDER.indexOf(current);
  const visibleSteps = STEPS.filter(s => s.key !== "init");

  return (
    <div className="flex items-center gap-1 px-4 py-2.5 border-b border-gray-100 bg-gray-50 overflow-x-auto flex-shrink-0">
      {visibleSteps.map((step, i) => {
        const stepIdx = STEP_ORDER.indexOf(step.key);
        const done = stepIdx < currentIdx;
        const active = step.key === current;
        return (
          <div key={step.key} className="flex items-center gap-1 flex-shrink-0">
            {i > 0 && <div className={`w-6 h-px ${done ? "bg-gray-400" : "bg-gray-200"}`} />}
            <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full transition-colors ${
              done ? "text-gray-400" :
              active ? "text-gray-900 bg-white border border-gray-300 shadow-sm font-medium" :
              "text-gray-300"
            }`}>
              {done
                ? <CheckCircle2 size={10} className="text-green-500" />
                : active
                ? <div className="w-2 h-2 rounded-full bg-gray-900" />
                : <Circle size={10} />
              }
              {step.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KeywordTable({ keywords }: { keywords: KeywordData[] }) {
  if (!keywords.length) return null;
  const [primary, ...secondary] = keywords;
  return (
    <div className="mt-2 rounded-xl border border-gray-200 overflow-hidden text-xs">
      <div className="bg-gray-50 px-3 py-2 font-medium text-gray-600 border-b border-gray-200 text-xs">
        Keyword Research
      </div>
      <div className="divide-y divide-gray-100">
        {primary && (
          <div className="flex items-center gap-2 px-3 py-2 bg-yellow-50">
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-yellow-200 text-yellow-800 flex-shrink-0">
              PRIMARY
            </span>
            <span className="font-medium text-gray-800">{primary.keyword}</span>
          </div>
        )}
        {secondary.map((kw, i) => (
          <div key={i} className="flex items-center justify-between px-3 py-2">
            <span className="text-gray-700">{kw.keyword}</span>
            <div className="flex items-center gap-3 text-gray-400 flex-shrink-0">
              {kw.volume > 0 && <span>vol: <span className="text-gray-600">{kw.volume.toLocaleString()}</span></span>}
              {kw.kd > 0 && <span>KD: <span className="text-gray-600">{kw.kd}</span></span>}
              {kw.intent && (
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${TYPE_COLORS[kw.intent] ?? "bg-gray-100 text-gray-500"}`}>
                  {kw.intent}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OutlineDisplay({ outline }: { outline: OutlineItem[] }) {
  if (!outline.length) return null;
  return (
    <div className="mt-2 rounded-xl border border-gray-200 overflow-hidden text-xs">
      <div className="bg-gray-50 px-3 py-2 font-medium text-gray-600 border-b border-gray-200">Content Outline</div>
      <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
        {outline.map((item, i) => (
          <div
            key={i}
            className={`flex items-center gap-2 px-3 py-2 ${item.level === 3 ? "pl-7 bg-gray-50/60" : ""}`}
          >
            <span className="text-gray-300 text-[10px] font-mono flex-shrink-0">H{item.level}</span>
            <span className="text-gray-700 flex-1 leading-relaxed">{item.text}</span>
            {item.type !== "general" && (
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 ${TYPE_COLORS[item.type] ?? "bg-gray-100 text-gray-500"}`}>
                {item.type.toUpperCase()}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ArticleSavedCard({ articleId, onOpen }: { articleId: string; onOpen: () => void }) {
  return (
    <div className="mt-2 rounded-xl border border-green-200 bg-green-50 p-4">
      <div className="flex items-center gap-2 text-green-700 font-medium text-sm mb-2">
        <CheckCircle2 size={16} />
        Article saved successfully!
      </div>
      <button
        onClick={onOpen}
        className="flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:text-blue-900 transition-colors"
      >
        Open in editor <ExternalLink size={13} />
      </button>
    </div>
  );
}

export function ChatInterface() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [state, setState] = useState<ResearchState>(defaultState);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [thinkingLabel, setThinkingLabel] = useState("Thinking…");
  const [setupPhase, setSetupPhase] = useState<"topic" | "type" | "country" | null>("topic");
  const [setupInput, setSetupInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Use a ref to hold the latest state for the runAgentStep closure
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  // Load from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as { messages: ChatMessage[]; state: ResearchState };
        if (parsed.messages?.length) {
          setMessages(parsed.messages);
          setState(parsed.state);
          setSetupPhase(null);
        }
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save to localStorage
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ messages, state }));
    }
  }, [messages, state]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  const appendToLastAssistant = useCallback((delta: string) => {
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant") {
        return [...prev.slice(0, -1), { ...last, content: last.content + delta }];
      }
      return [...prev, { role: "assistant", content: delta }];
    });
  }, []);

  function handleSetup(value: string) {
    if (!value.trim() && setupPhase !== "country") return;
    setSetupInput("");

    if (setupPhase === "topic") {
      setMessages(prev => [...prev, { role: "user", content: value }]);
      setState(prev => ({ ...prev, topic: value }));
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `Great! Is this a **blog post** or a **landing page**?`,
      }]);
      setSetupPhase("type");
      return;
    }

    if (setupPhase === "type") {
      const isLanding = /landing/i.test(value);
      const ct = isLanding ? "landing-page" : "blog";
      setMessages(prev => [...prev, { role: "user", content: value }]);
      setState(prev => ({ ...prev, contentType: ct }));
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `Got it — **${ct}**. Which country to target? (e.g. US, UK, CA — press Enter to default to US)`,
      }]);
      setSetupPhase("country");
      return;
    }

    if (setupPhase === "country") {
      const country = value.trim().toLowerCase() || "us";
      setMessages(prev => [...prev, { role: "user", content: value || "US" }]);
      const nextState = { ...stateRef.current, country, currentStep: "keywords" as ResearchStep };
      setState(nextState);
      setSetupPhase(null);
      runAgentStep(nextState, undefined);
    }
  }

  async function runAgentStep(currentState: ResearchState, userMsg: string | undefined) {
    setThinking(true);
    setMessages(prev => [...prev, { role: "assistant", content: "" }]);

    let localKeywords: KeywordData[] = [];
    let localCompetitors: CompetitorData[] = [];
    let localOutline: OutlineItem[] = [];
    let localArticleId: string | null = null;

    try {
      const res = await fetch("/api/chat/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: currentState, userMessage: userMsg }),
      });

      if (!res.ok || !res.body) throw new Error("Agent request failed");

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += dec.decode(value);

        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          for (const line of part.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            try {
              const event = JSON.parse(line.slice(6)) as SSEEvent;

              if (event.type === "text") {
                appendToLastAssistant(event.delta);
              } else if (event.type === "step") {
                setThinkingLabel(event.label);
              } else if (event.type === "keywords") {
                localKeywords = event.keywords;
                setMessages(prev => {
                  const last = prev[prev.length - 1];
                  if (last?.role === "assistant") {
                    return [...prev.slice(0, -1), { ...last, keywords: event.keywords }];
                  }
                  return prev;
                });
              } else if (event.type === "competitors") {
                localCompetitors = event.competitors;
              } else if (event.type === "outline") {
                localOutline = event.outline;
                setMessages(prev => {
                  const last = prev[prev.length - 1];
                  if (last?.role === "assistant") {
                    return [...prev.slice(0, -1), { ...last, outline: event.outline }];
                  }
                  return prev;
                });
              } else if (event.type === "article_saved") {
                localArticleId = event.articleId;
                setMessages(prev => {
                  const last = prev[prev.length - 1];
                  if (last?.role === "assistant") {
                    return [...prev.slice(0, -1), { ...last, articleId: event.articleId }];
                  }
                  return prev;
                });
              } else if (event.type === "done") {
                setState(prev => {
                  const next = { ...prev, ...(event.state as Partial<ResearchState>) };
                  if (localKeywords.length) {
                    const [primary, ...secondary] = localKeywords;
                    next.primaryKeyword = primary.keyword;
                    next.secondaryKeywords = secondary;
                  }
                  if (localCompetitors.length) next.competitorData = localCompetitors;
                  if (localOutline.length) next.outline = localOutline;
                  if (localArticleId) next.articleId = localArticleId;
                  return next;
                });
              } else if (event.type === "error") {
                appendToLastAssistant(`\n\n⚠️ Error: ${event.message}`);
              }
            } catch { /* ignore malformed JSON */ }
          }
        }
      }
    } catch (e) {
      appendToLastAssistant(`\n\nSomething went wrong: ${String(e)}`);
    } finally {
      setThinking(false);
      setThinkingLabel("Thinking…");
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || thinking) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: text }]);
    await runAgentStep(stateRef.current, text);
  }

  function handleQuickReply(reply: string) {
    if (thinking) return;
    setInput(reply);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function clearHistory() {
    localStorage.removeItem(STORAGE_KEY);
    setMessages([]);
    setState(defaultState());
    setSetupPhase("topic");
    setSetupInput("");
  }

  const quickReplies = QUICK_REPLIES[state.currentStep] ?? [];
  const isSetup = setupPhase !== null;

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-6">
          <p className="text-sm font-bold text-gray-900">SEO Tool</p>
          {[
            { href: "/chat", label: "New research" },
            { href: "/articles", label: "Articles" },
            { href: "/research", label: "Research" },
            { href: "/dashboard", label: "Dashboard" },
            { href: "/settings/tone", label: "Settings" },
          ].map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`text-sm transition-colors ${l.href === "/chat" ? "text-gray-900 font-medium" : "text-gray-400 hover:text-gray-700"}`}
            >
              {l.label}
            </Link>
          ))}
        </div>
        <button
          onClick={clearHistory}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors"
        >
          <RotateCcw size={12} /> New session
        </button>
      </div>

      {/* Step progress bar */}
      {!isSetup && state.currentStep !== "init" && (
        <StepBar current={state.currentStep} />
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
        {messages.length === 0 && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-gray-800 max-w-[80%]">
              Hi! I&#39;m your SEO research assistant. What topic or page do you want to work on today?
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[85%] space-y-2">
              <div
                className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-gray-900 text-white rounded-br-sm"
                    : "bg-gray-100 text-gray-800 rounded-bl-sm"
                }`}
              >
                {msg.role === "assistant" ? (
                  msg.content ? (
                    <span dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                  ) : (
                    thinking && i === messages.length - 1 ? (
                      <span className="flex items-center gap-1.5 text-gray-400">
                        <Loader2 size={13} className="animate-spin" /> {thinkingLabel}
                      </span>
                    ) : null
                  )
                ) : (
                  msg.content
                )}
              </div>

              {msg.keywords && <KeywordTable keywords={msg.keywords} />}
              {msg.outline && <OutlineDisplay outline={msg.outline} />}
              {msg.articleId && (
                <ArticleSavedCard
                  articleId={msg.articleId}
                  onOpen={() => router.push(`/articles/${msg.articleId}`)}
                />
              )}
            </div>
          </div>
        ))}

        {thinking && messages[messages.length - 1]?.role === "user" && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm text-gray-400 flex items-center gap-1.5">
              <Loader2 size={13} className="animate-spin" /> {thinkingLabel}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Quick replies */}
      {!thinking && quickReplies.length > 0 && !isSetup && (
        <div className="flex flex-wrap gap-2 px-6 pb-3">
          {quickReplies.map(reply => (
            <button
              key={reply}
              onClick={() => handleQuickReply(reply)}
              className="text-xs px-3 py-1.5 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
            >
              {reply}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="border-t border-gray-100 px-6 py-4 flex-shrink-0">
        {isSetup ? (
          <div className="space-y-3">
            <div className="text-xs text-gray-400 font-medium">
              {setupPhase === "topic" && "What topic do you want to research?"}
              {setupPhase === "type" && "Blog post or landing page?"}
              {setupPhase === "country" && "Target country? (leave blank for US)"}
            </div>
            <div className="flex gap-3">
              {setupPhase === "type" ? (
                <>
                  <button
                    onClick={() => handleSetup("blog")}
                    className="flex-1 py-2.5 text-sm border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    Blog post
                  </button>
                  <button
                    onClick={() => handleSetup("landing-page")}
                    className="flex-1 py-2.5 text-sm border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    Landing page
                  </button>
                </>
              ) : (
                <>
                  <input
                    autoFocus
                    value={setupInput}
                    onChange={e => setSetupInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") handleSetup(setupInput);
                    }}
                    placeholder={
                      setupPhase === "topic"
                        ? "e.g. AI software development"
                        : "e.g. US, UK, CA (or press Enter for US)"
                    }
                    className="flex-1 text-sm border border-gray-200 rounded-xl px-3.5 py-2.5 outline-none focus:border-gray-400"
                  />
                  <button
                    onClick={() => handleSetup(setupInput)}
                    className="flex items-center justify-center w-10 h-10 bg-gray-900 text-white rounded-xl hover:bg-gray-700 transition-colors flex-shrink-0"
                  >
                    <Send size={15} />
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="flex gap-3 items-end">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={thinking || state.currentStep === "complete"}
                placeholder={
                  state.currentStep === "keywords_approval"
                    ? "Approve or request changes to keywords…"
                    : state.currentStep === "outline_approval"
                    ? "Approve or edit the outline…"
                    : state.currentStep === "complete"
                    ? "Article saved! Open it in the editor above."
                    : "Type a message…"
                }
                rows={2}
                className="flex-1 text-sm border border-gray-200 rounded-xl px-3.5 py-2.5 outline-none focus:border-gray-400 resize-none placeholder-gray-300 disabled:opacity-40"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || thinking || state.currentStep === "complete"}
                className="flex items-center justify-center w-10 h-10 bg-gray-900 text-white rounded-xl hover:bg-gray-700 disabled:opacity-40 transition-colors flex-shrink-0"
              >
                <Send size={15} />
              </button>
            </div>
            <p className="text-[10px] text-gray-400 mt-1.5">Press Enter to send · Shift+Enter for new line</p>
          </>
        )}
      </div>
    </div>
  );
}
