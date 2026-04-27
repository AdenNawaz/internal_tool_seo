"use client";

import { useEffect, useState } from "react";
import { User, Loader2, CheckCircle2, ExternalLink } from "lucide-react";

interface AuthorProfile {
  id?: string;
  name: string;
  title: string;
  bio: string;
  credentials: string;
  linkedinUrl: string;
  avatarUrl: string;
}

const EMPTY: AuthorProfile = { name: "", title: "", bio: "", credentials: "", linkedinUrl: "", avatarUrl: "" };

export default function AuthorProfilePage() {
  const [form, setForm] = useState<AuthorProfile>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/settings/author-profile")
      .then((r) => r.json())
      .then((data: AuthorProfile | null) => { if (data) setForm(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function update(field: keyof AuthorProfile, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  }

  async function save() {
    if (!form.name.trim()) { setError("Name is required."); return; }
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/settings/author-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Save failed");
      setSaved(true);
    } catch {
      setError("Failed to save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 size={18} className="animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-xl mx-auto px-6 py-10">
        <div className="mb-8 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
            <User size={18} className="text-blue-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Author Profile</h1>
            <p className="text-sm text-gray-400">This feeds EEAT signals into your articles and content generation prompts.</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Full name *</label>
            <input
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="Jane Smith"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:border-blue-300 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Job title</label>
            <input
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="Senior SEO Strategist"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:border-blue-300 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Bio
              <span className={`ml-2 font-normal normal-case ${form.bio.length > 200 ? "text-red-500" : "text-gray-400"}`}>
                {form.bio.length}/200
              </span>
            </label>
            <textarea
              value={form.bio}
              onChange={(e) => update("bio", e.target.value)}
              maxLength={220}
              rows={3}
              placeholder="Jane is a content strategist with 8+ years helping B2B SaaS companies grow organic traffic…"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:border-blue-300 transition-colors resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Credentials / expertise summary</label>
            <input
              value={form.credentials}
              onChange={(e) => update("credentials", e.target.value)}
              placeholder="Google certified, 10 years SEO, ex-HubSpot"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:border-blue-300 transition-colors"
            />
            <p className="text-[10px] text-gray-400 mt-1">Used in generation prompts to add authorship signals.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">LinkedIn URL</label>
            <div className="flex gap-2">
              <input
                value={form.linkedinUrl}
                onChange={(e) => update("linkedinUrl", e.target.value)}
                placeholder="https://linkedin.com/in/janesmith"
                type="url"
                className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:border-blue-300 transition-colors"
              />
              {form.linkedinUrl && (
                <a href={form.linkedinUrl} target="_blank" rel="noreferrer" className="p-2.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  <ExternalLink size={13} className="text-gray-400" />
                </a>
              )}
            </div>
            <p className="text-[10px] text-gray-400 mt-1">+20 EEAT authority points for external credibility signal.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Avatar URL</label>
            <div className="flex gap-3">
              {form.avatarUrl && (
                <img src={form.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover border border-gray-200" />
              )}
              <input
                value={form.avatarUrl}
                onChange={(e) => update("avatarUrl", e.target.value)}
                placeholder="https://…/avatar.jpg"
                type="url"
                className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:border-blue-300 transition-colors"
              />
            </div>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex items-center justify-between pt-2">
            {saved && (
              <span className="flex items-center gap-1.5 text-xs text-green-600">
                <CheckCircle2 size={13} /> Saved
              </span>
            )}
            {!saved && <span />}
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : null}
              Save profile
            </button>
          </div>
        </div>

        {/* EEAT impact preview */}
        <div className="mt-4 bg-blue-50 rounded-xl p-4">
          <p className="text-xs font-semibold text-blue-800 mb-2">EEAT Authority impact</p>
          <div className="space-y-1.5">
            {[
              { label: "Named author", pts: 40, met: !!form.name.trim() },
              { label: "Author bio", pts: 30, met: !!form.bio.trim() },
              { label: "LinkedIn or credentials", pts: 20, met: !!(form.linkedinUrl.trim() || form.credentials.trim()) },
            ].map(({ label, pts, met }) => (
              <div key={label} className="flex items-center justify-between">
                <span className={`text-xs ${met ? "text-blue-700" : "text-blue-400"}`}>{label}</span>
                <span className={`text-xs font-semibold ${met ? "text-green-600" : "text-blue-400"}`}>{met ? `+${pts}` : `0/${pts}`}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
