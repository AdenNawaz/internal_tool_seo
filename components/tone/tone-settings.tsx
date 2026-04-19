"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

interface ToneProfile {
  id: string;
  type: string;
  sourceUrls: string[];
  profile: string;
  examples: string[];
  updatedAt: string;
}

interface AnalysisResult {
  summary: string;
  characteristics: string[];
  avoid: string[];
  examples: string[];
  cta_style: string;
}

interface Props {
  initialProfiles: ToneProfile[];
}

function ProfileSection({ type, label, initialProfile }: { type: "blog" | "landing-page"; label: string; initialProfile: ToneProfile | null }) {
  const [profile, setProfile] = useState<ToneProfile | null>(initialProfile);
  const [analyzing, setAnalyzing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [urls, setUrls] = useState<string[]>([""]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  function addUrl() {
    if (urls.length < 5) setUrls([...urls, ""]);
  }

  function removeUrl(i: number) {
    setUrls(urls.filter((_, idx) => idx !== i));
  }

  function updateUrl(i: number, val: string) {
    const updated = [...urls];
    updated[i] = val;
    setUrls(updated);
  }

  async function handleAnalyze() {
    const validUrls = urls.filter((u) => u.trim().startsWith("http"));
    if (validUrls.length === 0) {
      setError("Enter at least one valid URL starting with http");
      return;
    }
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch("/api/tone/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: validUrls, type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed");
      setProfile(data.profile);
      setResult(data.result);
      setShowForm(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="border border-gray-200 rounded-lg p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-800">{label}</h2>
        {profile && (
          <span className="text-[10px] text-gray-400">
            Updated {new Date(profile.updatedAt).toLocaleDateString()}
          </span>
        )}
      </div>

      {profile ? (
        <div className="space-y-3">
          <p className="text-[12px] text-gray-700 leading-relaxed">{profile.profile}</p>
          {result?.characteristics && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Characteristics</p>
              <ul className="space-y-0.5">
                {result.characteristics.map((c, i) => (
                  <li key={i} className="text-[11px] text-gray-600">• {c}</li>
                ))}
              </ul>
            </div>
          )}
          {(profile.examples as string[]).length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Example sentences</p>
              {(profile.examples as string[]).map((ex, i) => (
                <p key={i} className="text-[11px] text-gray-500 italic border-l-2 border-gray-100 pl-2 mb-1">"{ex}"</p>
              ))}
            </div>
          )}
          <button
            onClick={() => setShowForm(true)}
            className="text-[11px] text-gray-400 hover:text-gray-700 underline"
          >
            Re-analyze
          </button>
        </div>
      ) : (
        <p className="text-[11px] text-gray-400">No profile yet.</p>
      )}

      {!profile && !showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="w-full text-xs font-medium bg-gray-900 text-white rounded-md px-3 py-2 hover:bg-gray-700 transition-colors"
        >
          Analyze from URLs
        </button>
      )}

      {showForm && (
        <div className="space-y-3">
          <p className="text-[11px] text-gray-500">Enter 3–5 existing {label.toLowerCase()} URLs from your site:</p>
          <div className="space-y-2">
            {urls.map((url, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  type="url"
                  value={url}
                  onChange={(e) => updateUrl(i, e.target.value)}
                  placeholder="https://10pearls.com/blog/..."
                  className="flex-1 text-xs border border-gray-200 rounded px-2.5 py-1.5 outline-none focus:border-gray-400"
                />
                {urls.length > 1 && (
                  <button onClick={() => removeUrl(i)} className="text-gray-300 hover:text-red-500">
                    <X size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {urls.length < 5 && (
            <button onClick={addUrl} className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-700">
              <Plus size={12} /> Add URL
            </button>
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="flex-1 text-xs font-medium bg-gray-900 text-white rounded-md px-3 py-2 hover:bg-gray-700 disabled:opacity-40 transition-colors"
            >
              {analyzing ? "Analyzing…" : "Analyze"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="text-xs text-gray-400 hover:text-gray-700 px-3 py-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ToneSettings({ initialProfiles }: Props) {
  const blogProfile = initialProfiles.find((p) => p.type === "blog") ?? null;
  const lpProfile = initialProfiles.find((p) => p.type === "landing-page") ?? null;

  return (
    <div className="space-y-6">
      <ProfileSection type="blog" label="Blog tone" initialProfile={blogProfile} />
      <ProfileSection type="landing-page" label="Landing page tone" initialProfile={lpProfile} />
    </div>
  );
}
