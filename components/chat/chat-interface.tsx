"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Send, RotateCcw, Loader2 } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface PipelineCard {
  type: "research";
  keyword: string;
  contentType: string;
  status: "running" | "done" | "error";
  reportId?: string;
  message?: string;
}

const STORAGE_KEY = "seo-tool-chat-history";

function parseActions(text: string): { type: string; [k: string]: string }[] {
  const actions: { type: string; [k: string]: string }[] = [];
  const regex = /<action>([\s\S]*?)<\/action>/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    try {
      actions.push(JSON.parse(m[1]));
    } catch { /* ignore malformed */ }
  }
  return actions;
}

function stripActions(text: string) {
  return text.replace(/<action>[\s\S]*?<\/action>/g, "").trim();
}

export function ChatInterface() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? (JSON.parse(stored) as Message[]) : [];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [pipelines, setPipelines] = useState<Map<number, PipelineCard>>(new Map());
  const [revampUrl, setRevampUrl] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    if (messages.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    }
  }, [messages]);

  // Start with a greeting if no history
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([{
        role: "assistant",
        content: "Hi! I'm your SEO research assistant. What topic or page do you want to work on today?",
      }]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSend() {
    const text = input.trim();
    if (!text || thinking) return;
    setInput("");

    const updated: Message[] = [...messages, { role: "user", content: text }];
    setMessages(updated);
    setThinking(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updated }),
      });

      if (!res.ok || !res.body) throw new Error("Chat failed");

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let fullText = "";

      // Add empty assistant message to stream into
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += dec.decode(value);
        setMessages((prev) => [
          ...prev.slice(0, -1),
          { role: "assistant", content: fullText },
        ]);
      }

      // Parse and execute actions
      const actions = parseActions(fullText);
      for (const action of actions) {
        await executeAction(action, updated.length + 1);
      }

      // Clean action tags from displayed message
      if (actions.length > 0) {
        setMessages((prev) => [
          ...prev.slice(0, -1),
          { role: "assistant", content: stripActions(fullText) },
        ]);
      }
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Sorry, something went wrong: ${String(e)}` },
      ]);
    } finally {
      setThinking(false);
    }
  }

  async function executeAction(action: { type: string; [k: string]: string }, msgIndex: number) {
    if (action.type === "set_revamp_url") {
      setRevampUrl(action.url);
      return;
    }

    if (action.type === "start_article") {
      try {
        const res = await fetch("/api/articles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: action.keyword }),
        });
        const data = await res.json();
        if (data.id) router.push(`/articles/${data.id}`);
      } catch { /* ignore */ }
      return;
    }

    if (action.type === "start_research") {
      const card: PipelineCard = {
        type: "research",
        keyword: action.keyword,
        contentType: action.contentType ?? "blog",
        status: "running",
      };
      setPipelines((prev) => new Map(prev).set(msgIndex, card));

      try {
        const res = await fetch("/api/research/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keyword: action.keyword }),
        });
        if (!res.body) throw new Error("No stream");

        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let reportId: string | undefined;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = dec.decode(value);
          for (const chunk of text.split("\n\n")) {
            for (const line of chunk.split("\n")) {
              if (!line.startsWith("data:")) continue;
              try {
                const payload = JSON.parse(line.slice(5).trim());
                if (payload.reportId) reportId = payload.reportId;
                if (payload.message) {
                  setPipelines((prev) => {
                    const next = new Map(prev);
                    next.set(msgIndex, { ...card, status: "running", message: payload.message, reportId });
                    return next;
                  });
                }
              } catch { /* ignore */ }
            }
          }
        }

        setPipelines((prev) => {
          const next = new Map(prev);
          next.set(msgIndex, { ...card, status: "done", reportId });
          return next;
        });
      } catch {
        setPipelines((prev) => {
          const next = new Map(prev);
          next.set(msgIndex, { ...card, status: "error", message: "Research failed" });
          return next;
        });
      }
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function clearHistory() {
    localStorage.removeItem(STORAGE_KEY);
    setMessages([{ role: "assistant", content: "Hi! I'm your SEO research assistant. What topic or page do you want to work on today?" }]);
    setPipelines(new Map());
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100">
        <p className="text-sm font-semibold text-gray-800">SEO Research Assistant</p>
        <button onClick={clearHistory} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors">
          <RotateCcw size={12} /> New conversation
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
        {messages.map((msg, i) => {
          const pipeline = pipelines.get(i);
          const displayContent = stripActions(msg.content);

          return (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] space-y-2`}>
                <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-gray-900 text-white rounded-br-sm"
                    : "bg-gray-100 text-gray-800 rounded-bl-sm"
                }`}>
                  {displayContent || (thinking && i === messages.length - 1 ? (
                    <span className="flex items-center gap-1 text-gray-400"><Loader2 size={13} className="animate-spin" /> Thinking…</span>
                  ) : "")}
                </div>

                {/* Pipeline card */}
                {pipeline && (
                  <div className={`rounded-xl border p-3 space-y-1.5 text-xs ${
                    pipeline.status === "done" ? "border-green-200 bg-green-50" :
                    pipeline.status === "error" ? "border-red-200 bg-red-50" :
                    "border-blue-200 bg-blue-50"
                  }`}>
                    <div className="flex items-center gap-2">
                      {pipeline.status === "running" && <Loader2 size={11} className="animate-spin text-blue-600" />}
                      {pipeline.status === "done" && <span className="text-green-600">✓</span>}
                      {pipeline.status === "error" && <span className="text-red-600">✗</span>}
                      <p className="font-medium text-gray-700">
                        Research: {pipeline.keyword}
                      </p>
                    </div>
                    {pipeline.message && <p className="text-gray-500">{pipeline.message}</p>}
                    {pipeline.status === "done" && pipeline.reportId && (
                      <button
                        onClick={() => router.push(`/research/${pipeline.reportId}`)}
                        className="mt-1 text-xs font-medium text-blue-700 underline"
                      >
                        View research report →
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {thinking && messages[messages.length - 1]?.role === "user" && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm text-gray-400 flex items-center gap-1.5">
              <Loader2 size={13} className="animate-spin" /> Thinking…
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-100 px-6 py-4">
        {revampUrl && (
          <div className="mb-2 text-xs text-gray-500 bg-gray-50 rounded-md px-2.5 py-1.5">
            Revamp URL set: <span className="font-mono text-gray-700">{revampUrl}</span>
            <button onClick={() => setRevampUrl(null)} className="ml-2 text-gray-400 hover:text-gray-700">✕</button>
          </div>
        )}
        <div className="flex gap-3 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask me about a topic, keyword, or page…"
            rows={2}
            className="flex-1 text-sm border border-gray-200 rounded-xl px-3.5 py-2.5 outline-none focus:border-gray-400 resize-none placeholder-gray-300"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || thinking}
            className="flex items-center justify-center w-10 h-10 bg-gray-900 text-white rounded-xl hover:bg-gray-700 disabled:opacity-40 transition-colors flex-shrink-0"
          >
            <Send size={15} />
          </button>
        </div>
        <p className="text-[10px] text-gray-400 mt-1.5">Press Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  );
}
