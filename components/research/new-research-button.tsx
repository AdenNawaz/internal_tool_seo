"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewResearchButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    if (!keyword.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/research/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: keyword.trim() }),
      });

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");

      const dec = new TextDecoder();
      let reportId: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = dec.decode(value);
        for (const line of text.split("\n\n")) {
          if (line.startsWith("data:")) {
            const payload = JSON.parse(line.slice(5).trim());
            if (payload.reportId) reportId = payload.reportId;
          }
        }
      }

      if (reportId) {
        router.push(`/research/${reportId}`);
      } else {
        setError("Report creation failed");
        setLoading(false);
      }
    } catch (e) {
      setError(String(e));
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm font-medium bg-gray-900 text-white rounded-md px-4 py-2 hover:bg-gray-700 transition-colors"
      >
        New report
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 items-end">
      <div className="flex gap-2">
        <input
          autoFocus
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleStart()}
          placeholder="Enter keyword…"
          className="text-sm border border-gray-200 rounded-md px-2.5 py-1.5 outline-none focus:border-gray-400 w-56"
        />
        <button
          onClick={handleStart}
          disabled={loading || !keyword.trim()}
          className="text-sm font-medium bg-gray-900 text-white rounded-md px-4 py-1.5 hover:bg-gray-700 disabled:opacity-40 transition-colors"
        >
          {loading ? "Running…" : "Run"}
        </button>
        <button
          onClick={() => { setOpen(false); setKeyword(""); }}
          className="text-sm text-gray-400 hover:text-gray-700 px-2"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
