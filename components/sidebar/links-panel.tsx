"use client";

import { useEffect, useRef, useState } from "react";
import type { PublishedArticle, LinkSuggestion } from "@/lib/link-suggester";
import { extractPlainText } from "@/lib/text-analysis";

interface EnrichmentData {
  url: string;
  topExternalAnchors: { anchor: string; referringDomains: number }[];
}

interface Props {
  articleId: string;
  analysisContent: unknown;
}

export function LinksPanel({ articleId, analysisContent }: Props) {
  const [open, setOpen] = useState(false);
  const [published, setPublished] = useState<PublishedArticle[] | null>(null);
  const [suggestions, setSuggestions] = useState<LinkSuggestion[]>([]);
  const [wordCount, setWordCount] = useState(0);
  const [enriching, setEnriching] = useState(false);
  const [enriched, setEnriched] = useState<Map<string, EnrichmentData>>(new Map());
  const [copied, setCopied] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch published articles once when section opens
  useEffect(() => {
    if (!open || published !== null) return;
    fetch("/api/articles/published")
      .then((r) => r.json())
      .then((data) => setPublished(Array.isArray(data) ? data : []))
      .catch(() => setPublished([]));
  }, [open, published]);

  // Re-run matching whenever content changes (2s debounce)
  useEffect(() => {
    if (!open || published === null) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const plainText = Array.isArray(analysisContent)
        ? extractPlainText(analysisContent as unknown[])
        : "";
      const wc = plainText.match(/\b\w+\b/g)?.length ?? 0;
      setWordCount(wc);
      if (wc < 100) { setSuggestions([]); return; }

      // Dynamic import — runs client-side only
      const { extractTopics, findLinkOpportunities } = await import("@/lib/link-suggester");
      const topics = extractTopics(plainText);
      const results = findLinkOpportunities(topics, published, articleId);
      setSuggestions(results);
      setEnriched(new Map()); // reset enrichment on content change
    }, 2000);
  }, [analysisContent, open, published, articleId]);

  async function handleEnrich() {
    if (!suggestions.length) return;
    setEnriching(true);
    try {
      const top3 = suggestions.slice(0, 3).map((s) => ({
        url: s.matchedArticle.url,
        anchorText: s.suggestedAnchorText,
      }));
      const res = await fetch("/api/links/anchor-intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestions: top3 }),
      });
      if (!res.ok) return;
      const data: EnrichmentData[] = await res.json();
      const map = new Map<string, EnrichmentData>();
      for (const item of data) map.set(item.url, item);
      setEnriched(map);
    } finally {
      setEnriching(false);
    }
  }

  function copyMarkdown(suggestion: LinkSuggestion) {
    const md = `[${suggestion.suggestedAnchorText}](${suggestion.matchedArticle.url})`;
    navigator.clipboard.writeText(md).catch(() => {});
    setCopied(suggestion.matchedArticle.id);
    setTimeout(() => setCopied(null), 2000);
  }

  if (published !== null && published.length < 3 && open) {
    return (
      <div className="space-y-2">
        <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Internal Links</p>
          <span className="text-gray-400 text-xs">{open ? "▲" : "▼"}</span>
        </button>
        {open && (
          <p className="text-[11px] text-gray-400">
            Publish more articles to enable internal link suggestions.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Internal Links</p>
        <span className="text-gray-400 text-xs">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="space-y-3">
          {wordCount < 100 && (
            <p className="text-[11px] text-gray-400">Write more to get suggestions.</p>
          )}

          {wordCount >= 100 && suggestions.length === 0 && (
            <p className="text-[11px] text-gray-400">No suggestions yet — keep writing.</p>
          )}

          {suggestions.length > 0 && (
            <>
              <p className="text-[10px] text-gray-400">{suggestions.length} suggestions</p>
              <div className="space-y-2">
                {suggestions.map((s) => {
                  const enrichData = enriched.get(s.matchedArticle.url);
                  const topAnchor = enrichData?.topExternalAnchors[0];
                  return (
                    <div key={s.matchedArticle.id} className="rounded-md border border-gray-100 px-3 py-2 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-gray-800 truncate">{s.suggestedAnchorText}</p>
                          <p className="text-[10px] text-gray-400 truncate">→ {s.matchedArticle.title}</p>
                        </div>
                        <span className={`shrink-0 text-[9px] font-medium px-1.5 py-0.5 rounded-full ${
                          s.confidence === "high" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                        }`}>
                          {s.confidence === "high" ? "Strong match" : "Possible match"}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-400">{s.reason}</p>
                      {topAnchor && (
                        <p className="text-[10px] text-blue-500">
                          External sites use: &ldquo;{topAnchor.anchor}&rdquo;
                        </p>
                      )}
                      <button
                        onClick={() => copyMarkdown(s)}
                        className="text-[10px] text-gray-400 hover:text-gray-700 underline"
                      >
                        {copied === s.matchedArticle.id ? "Copied!" : "Copy markdown"}
                      </button>
                    </div>
                  );
                })}
              </div>

              <button
                onClick={handleEnrich}
                disabled={enriching}
                className="text-[11px] text-gray-400 hover:text-gray-700 underline disabled:opacity-40"
              >
                {enriching ? "Fetching anchor data…" : "Enrich with Ahrefs"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
