"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, FileText } from "lucide-react";

export default function OptimizePage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleStart() {
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revampUrl: url.trim(), isRevamp: true, title: `Revamp: ${url.trim()}` }),
      });
      if (!res.ok) throw new Error("Failed");
      const { id } = await res.json();
      router.push(`/articles/${id}`);
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-4">
            <FileText size={22} className="text-amber-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Optimize existing content</h1>
          <p className="text-sm text-gray-400 mt-2">Paste the URL of the page you want to improve. We&apos;ll scrape it, compare against top competitors, and highlight what&apos;s missing.</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
          <div>
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide block mb-1.5">Page URL</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://yourdomain.com/your-article"
              className="w-full text-sm border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-amber-300 transition-colors"
              onKeyDown={(e) => { if (e.key === "Enter") handleStart(); }}
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <button
            onClick={handleStart}
            disabled={loading || !url.trim()}
            className="w-full py-3 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {loading ? <><Loader2 size={14} className="animate-spin" /> Opening editor…</> : "Start optimizing →"}
          </button>
        </div>
      </div>
    </div>
  );
}
