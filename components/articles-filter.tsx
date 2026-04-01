"use client";

import { useRouter } from "next/navigation";

export function ArticlesFilter({ mine }: { mine: boolean }) {
  const router = useRouter();

  return (
    <button
      onClick={() => router.push(mine ? "/articles" : "/articles?mine=true")}
      className={`text-xs font-medium rounded-md px-3 py-1.5 border transition-colors ${
        mine
          ? "bg-gray-900 text-white border-gray-900"
          : "text-gray-500 border-gray-200 hover:border-gray-400"
      }`}
    >
      {mine ? "All articles" : "My articles"}
    </button>
  );
}
