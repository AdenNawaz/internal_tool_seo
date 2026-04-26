"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Upload, Link2, FileText, Loader2, X } from "lucide-react";

type Mode = "paste" | "url" | "file";

export default function ImportBriefPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("paste");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleImport() {
    setLoading(true);
    setError("");
    try {
      let res: Response;
      if (mode === "file" && file) {
        const fd = new FormData();
        fd.append("file", file);
        res = await fetch("/api/import-brief", { method: "POST", body: fd });
      } else {
        res = await fetch("/api/import-brief", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: mode === "paste" ? text : undefined, url: mode === "url" ? url : undefined }),
        });
      }

      if (!res.ok) {
        const { error: e } = await res.json() as { error: string };
        throw new Error(e);
      }

      const { outline, title } = await res.json() as { outline: unknown[]; title: string };

      // Create article with extracted outline
      const articleRes = await fetch("/api/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, chatOutline: outline }),
      });
      const { id } = await articleRes.json() as { id: string };
      router.push(`/articles/${id}`);
    } catch (e) {
      setError((e as Error).message || "Something went wrong.");
      setLoading(false);
    }
  }

  const canSubmit = (mode === "paste" && text.trim()) || (mode === "url" && url.trim()) || (mode === "file" && !!file);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-xl">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-green-100 flex items-center justify-center mx-auto mb-4">
            <Upload size={22} className="text-green-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Import a brief</h1>
          <p className="text-sm text-gray-400 mt-2">Paste a brief, link a URL, or upload a PDF. We&apos;ll extract the outline and pre-load it in the editor.</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          {/* Mode tabs */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-5">
            {([["paste", FileText, "Paste text"], ["url", Link2, "URL / Google Doc"], ["file", Upload, "Upload file"]] as const).map(([m, Icon, label]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-colors ${mode === m ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
              >
                <Icon size={12} />
                {label}
              </button>
            ))}
          </div>

          {/* Content area */}
          {mode === "paste" && (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste your brief here — headings, sections, bullet points, anything with structure…"
              rows={10}
              className="w-full text-sm text-gray-900 placeholder-gray-300 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-green-300 resize-none transition-colors"
            />
          )}

          {mode === "url" && (
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://docs.google.com/... or any web page URL"
              className="w-full text-sm border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-green-300 transition-colors"
              onKeyDown={(e) => { if (e.key === "Enter") handleImport(); }}
            />
          )}

          {mode === "file" && (
            <div>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.txt,.doc,.docx"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {file ? (
                <div className="flex items-center justify-between p-3 rounded-xl border border-green-200 bg-green-50">
                  <div className="flex items-center gap-2">
                    <FileText size={14} className="text-green-600" />
                    <span className="text-sm text-green-800 font-medium">{file.name}</span>
                    <span className="text-[10px] text-green-600">({(file.size / 1024).toFixed(0)} KB)</span>
                  </div>
                  <button onClick={() => setFile(null)}><X size={14} className="text-green-500" /></button>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full border-2 border-dashed border-gray-200 rounded-xl p-8 flex flex-col items-center gap-2 hover:border-green-300 transition-colors"
                >
                  <Upload size={20} className="text-gray-300" />
                  <span className="text-sm text-gray-400">Click to upload PDF, DOCX, or TXT</span>
                  <span className="text-xs text-gray-300">Max 10 MB</span>
                </button>
              )}
            </div>
          )}

          {error && <p className="text-xs text-red-600 mt-3">{error}</p>}

          <button
            onClick={handleImport}
            disabled={loading || !canSubmit}
            className="w-full mt-5 py-3 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {loading ? <><Loader2 size={14} className="animate-spin" /> Extracting outline…</> : "Extract outline and open editor →"}
          </button>
        </div>
      </div>
    </div>
  );
}
