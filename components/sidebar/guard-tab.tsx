"use client";

import { useEffect, useState } from "react";
import { Shield, ExternalLink, Clock } from "lucide-react";

interface Ranking {
  id: string;
  keyword: string;
  position: number | null;
  checkedAt: string;
}

interface GuardTabProps {
  articleId: string;
  status: string;
  publishedUrl: string | null;
  createdAt?: string;
  onSaveField: (patch: Record<string, unknown>) => void;
}

export function GuardTab({ articleId, status, publishedUrl, createdAt, onSaveField }: GuardTabProps) {
  const [guardEnabled, setGuardEnabled] = useState(false);
  const [rankings, setRankings] = useState<Ranking[]>([]);

  useEffect(() => {
    fetch(`/api/articles/${articleId}/rankings`)
      .then((r) => r.ok ? r.json() : [])
      .then((data: Ranking[]) => setRankings(data ?? []))
      .catch(() => {});
  }, [articleId]);

  const isPublished = status === "published" || status === "ready";

  function toggleGuard() {
    const next = !guardEnabled;
    setGuardEnabled(next);
    onSaveField({ status: next && status === "ready" ? "guarded" : status });
  }

  // Build timeline events
  const timeline: Array<{ label: string; date: string }> = [];
  if (createdAt) timeline.push({ label: "Article created", date: createdAt });
  if (rankings.length > 0) {
    const first = rankings[rankings.length - 1];
    if (first.position) timeline.push({ label: `First ranked at #${first.position} for "${first.keyword}"`, date: first.checkedAt });
    const latest = rankings[0];
    if (latest.id !== first.id && latest.position) {
      timeline.push({ label: `Latest rank: #${latest.position} for "${latest.keyword}"`, date: latest.checkedAt });
    }
  }

  return (
    <div className="px-4 py-4 space-y-5">
      {/* Guard toggle */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield size={14} className={guardEnabled ? "text-blue-500" : "text-gray-400"} />
            <div>
              <p className="text-xs font-semibold text-gray-800">Guard this article</p>
              <p className="text-[10px] text-gray-400 mt-0.5">Monitor rankings weekly and alert on drops</p>
            </div>
          </div>
          <button
            onClick={toggleGuard}
            disabled={!isPublished}
            className={`relative inline-flex h-5 w-9 rounded-full transition-colors focus:outline-none ${guardEnabled ? "bg-blue-500" : "bg-gray-200"} ${!isPublished ? "opacity-40 cursor-not-allowed" : ""}`}
          >
            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform mt-0.5 ${guardEnabled ? "translate-x-4" : "translate-x-0.5"}`} />
          </button>
        </div>
        {!isPublished && (
          <p className="text-[10px] text-amber-600 mt-2">Publish this article to enable monitoring.</p>
        )}
      </div>

      {/* Connections */}
      <div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Connections</p>
        <div className="space-y-2">
          <div className="flex items-center justify-between bg-white rounded-lg border border-gray-100 px-3 py-2.5">
            <div>
              <p className="text-xs text-gray-700 font-medium">CMS</p>
              <p className="text-[10px] text-gray-400">No CMS connected</p>
            </div>
            <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Coming soon</span>
          </div>
          <div className="flex items-center justify-between bg-white rounded-lg border border-gray-100 px-3 py-2.5">
            <div>
              <p className="text-xs text-gray-700 font-medium">Google Search Console</p>
              <p className="text-[10px] text-gray-400">Not connected</p>
            </div>
            <a
              href="/api/integrations/gsc/connect"
              className="flex items-center gap-1 text-[10px] text-blue-600 hover:underline"
            >
              Connect <ExternalLink size={9} />
            </a>
          </div>
        </div>
      </div>

      {/* Published URL */}
      {publishedUrl && (
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Published at</p>
          <a href={publishedUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-blue-600 hover:underline truncate">
            {publishedUrl} <ExternalLink size={10} />
          </a>
        </div>
      )}

      {/* Timeline */}
      <div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Timeline</p>
        {timeline.length === 0 ? (
          <p className="text-xs text-gray-300">No history yet.</p>
        ) : (
          <div className="space-y-2">
            {timeline.map((event, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="mt-1 w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0" />
                <div>
                  <p className="text-xs text-gray-600">{event.label}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
                    <Clock size={9} /> {new Date(event.date).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
