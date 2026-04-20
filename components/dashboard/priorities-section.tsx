"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, TrendingUp, AlertTriangle, ArrowUpCircle, Target } from "lucide-react";
import type { PriorityAction, PriorityType } from "@/app/api/dashboard/priorities/route";

const TYPE_CONFIG: Record<PriorityType, {
  label: string;
  color: string;
  bg: string;
  border: string;
  icon: React.ReactNode;
}> = {
  refresh_opportunity: {
    label: "Refresh",
    color: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
    icon: <RefreshCw size={13} />,
  },
  trending_cluster: {
    label: "Trending",
    color: "text-green-700",
    bg: "bg-green-50",
    border: "border-green-200",
    icon: <TrendingUp size={13} />,
  },
  untouched_cluster: {
    label: "Gap",
    color: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-200",
    icon: <Target size={13} />,
  },
  competitor_gaining: {
    label: "Competitor",
    color: "text-red-700",
    bg: "bg-red-50",
    border: "border-red-200",
    icon: <AlertTriangle size={13} />,
  },
  low_coverage_high_volume: {
    label: "Under-covered",
    color: "text-purple-700",
    bg: "bg-purple-50",
    border: "border-purple-200",
    icon: <ArrowUpCircle size={13} />,
  },
};

export function PrioritiesSection() {
  const router = useRouter();
  const [actions, setActions] = useState<PriorityAction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/priorities")
      .then(r => r.json())
      .then((data: { actions: PriorityAction[] }) => setActions(data.actions ?? []))
      .catch(() => setActions([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="mb-10">
        <h2 className="text-base font-semibold text-gray-900 mb-4">What to do next</h2>
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Loader2 size={14} className="animate-spin" /> Loading priorities…
        </div>
      </div>
    );
  }

  return (
    <div className="mb-10">
      <h2 className="text-base font-semibold text-gray-900 mb-4">What to do next</h2>

      {actions.length === 0 ? (
        <div className="rounded-xl border border-gray-100 bg-gray-50 px-5 py-6 text-center">
          <p className="text-sm text-gray-500">Everything looks good — no urgent actions right now.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {actions.map((action, i) => {
            const cfg = TYPE_CONFIG[action.type];
            return (
              <div
                key={i}
                className={`flex items-center gap-4 rounded-xl border px-4 py-3 ${cfg.bg} ${cfg.border}`}
              >
                {/* Type indicator */}
                <div className={`flex items-center gap-1.5 shrink-0 ${cfg.color}`}>
                  {cfg.icon}
                  <span className="text-[10px] font-semibold uppercase tracking-wide">{cfg.label}</span>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{action.title}</p>
                  <p className={`text-xs ${cfg.color} mt-0.5`}>{action.message}</p>
                  {action.detail && (
                    <p className="text-[10px] text-gray-400 mt-0.5">{action.detail}</p>
                  )}
                </div>

                {/* Action button */}
                <button
                  onClick={() => router.push(action.actionUrl)}
                  className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${cfg.color} ${cfg.border} hover:bg-white`}
                >
                  {action.actionLabel}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
