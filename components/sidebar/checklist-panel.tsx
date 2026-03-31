"use client";

import { useMemo } from "react";
import { runChecklist, type ChecklistInput } from "@/lib/checklist";

interface Props {
  input: ChecklistInput;
  onMarkReady: () => void;
  status: string;
}

export function ChecklistPanel({ input, onMarkReady, status }: Props) {
  const result = useMemo(() => runChecklist(input), [input]);

  const scoreColor =
    result.score >= 80
      ? "text-green-600 bg-green-50"
      : result.score >= 50
      ? "text-amber-600 bg-amber-50"
      : "text-red-600 bg-red-50";

  const isReady = status === "ready" || status === "published";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pre-publish checklist</p>
        <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${scoreColor}`}>
          {result.score}%
        </span>
      </div>

      <div className="space-y-2">
        {result.items.map((item) => (
          <div key={item.id} className="flex items-start gap-2">
            <span
              className={`mt-0.5 shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                item.passed ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-400"
              }`}
            >
              {item.passed ? "✓" : "·"}
            </span>
            <div className="min-w-0">
              <p className={`text-xs ${item.passed ? "text-gray-600" : "text-gray-400"}`}>
                {item.label}
              </p>
              {item.hint && (
                <p className="text-[10px] text-gray-400 mt-0.5">{item.hint}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={onMarkReady}
        disabled={isReady}
        className={`w-full text-xs font-medium rounded-md px-3 py-2 transition-colors ${
          isReady
            ? "bg-green-50 text-green-600 cursor-default"
            : "bg-gray-900 text-white hover:bg-gray-700"
        }`}
      >
        {isReady ? "Marked as ready ✓" : "Mark as ready"}
      </button>
    </div>
  );
}
