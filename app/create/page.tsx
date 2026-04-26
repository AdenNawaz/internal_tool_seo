"use client";

import { useRouter } from "next/navigation";
import { Sparkles, FileText, Upload, Play, ChevronRight } from "lucide-react";

const PLAYBOOKS = [
  {
    id: "seo-blog",
    name: "SEO Blog Post",
    description: "Keyword-driven article optimised for search and AI discovery.",
    steps: 5,
    stepLabels: ["Configure", "Research", "AI visibility check", "Brief", "Write"],
    contentType: "blog_post",
  },
  {
    id: "pillar-page",
    name: "Pillar Page",
    description: "Comprehensive reference covering a topic end-to-end.",
    steps: 6,
    stepLabels: ["Configure", "Research", "AI visibility check", "Opportunity analysis", "Evidence", "Write"],
    contentType: "pillar_page",
  },
  {
    id: "quick-update",
    name: "Quick Update",
    description: "Import an existing page, gap-analyse it, patch weak sections.",
    steps: 3,
    stepLabels: ["Import URL", "Gap analysis", "Rewrite"],
    contentType: "guide",
  },
];

export default function CreatePage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-start pt-16 px-4 pb-20">
      <div className="w-full max-w-3xl">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-2xl font-bold text-gray-900">What do you want to create today?</h1>
          <p className="text-sm text-gray-400 mt-2">Choose a mode to get started — each one shapes the pipeline that follows.</p>
        </div>

        {/* Mode cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
          {/* Generate Article */}
          <button
            onClick={() => router.push("/create/generate")}
            className="relative flex flex-col items-start p-5 rounded-2xl border-2 border-blue-200 bg-white hover:border-blue-400 hover:shadow-md transition-all text-left group"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                <Sparkles size={16} className="text-blue-600" />
              </div>
              <span className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide bg-blue-50 px-2 py-0.5 rounded-full">Recommended</span>
            </div>
            <h2 className="text-sm font-semibold text-gray-900 mb-1">Generate Article</h2>
            <p className="text-xs text-gray-500 leading-relaxed">Research a topic, build an outline, and generate content.</p>
            <ChevronRight size={14} className="absolute top-5 right-5 text-gray-300 group-hover:text-blue-400 transition-colors" />
          </button>

          {/* Optimize Existing */}
          <button
            onClick={() => router.push("/create/optimize")}
            className="relative flex flex-col items-start p-5 rounded-2xl border border-gray-200 bg-white hover:border-gray-400 hover:shadow-md transition-all text-left group"
          >
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center mb-3">
              <FileText size={16} className="text-amber-600" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900 mb-1">Optimize Existing</h2>
            <p className="text-xs text-gray-500 leading-relaxed">Import an existing page from a URL. See what&apos;s missing vs competitors and improve it.</p>
            <ChevronRight size={14} className="absolute top-5 right-5 text-gray-300 group-hover:text-gray-500 transition-colors" />
          </button>

          {/* Import Brief */}
          <button
            onClick={() => router.push("/create/import-brief")}
            className="relative flex flex-col items-start p-5 rounded-2xl border border-gray-200 bg-white hover:border-gray-400 hover:shadow-md transition-all text-left group"
          >
            <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center mb-3">
              <Upload size={16} className="text-green-600" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900 mb-1">Import Brief</h2>
            <p className="text-xs text-gray-500 leading-relaxed">Paste a brief, upload a PDF, or link a Google Doc. Extract structure and generate content.</p>
            <ChevronRight size={14} className="absolute top-5 right-5 text-gray-300 group-hover:text-gray-500 transition-colors" />
          </button>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-4 mb-8">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400 uppercase tracking-wide font-medium">Or start from a playbook</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* Playbooks */}
        <div className="space-y-3">
          {PLAYBOOKS.map((pb) => (
            <button
              key={pb.id}
              onClick={() => router.push(`/create/generate?playbook=${pb.id}&contentType=${pb.contentType}`)}
              className="w-full flex items-center justify-between p-4 rounded-xl border border-gray-100 bg-white hover:border-gray-300 hover:shadow-sm transition-all text-left group"
            >
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                  <Play size={13} className="text-gray-500 ml-0.5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{pb.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{pb.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="hidden md:flex items-center gap-1">
                  {pb.stepLabels.map((s, i) => (
                    <span key={i} className="text-[10px] text-gray-400 flex items-center gap-1">
                      {i > 0 && <span className="text-gray-200">›</span>}
                      {s}
                    </span>
                  ))}
                </div>
                <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{pb.steps} steps</span>
                <ChevronRight size={14} className="text-gray-300 group-hover:text-gray-500 transition-colors" />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
