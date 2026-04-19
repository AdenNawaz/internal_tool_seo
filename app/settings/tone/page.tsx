import { db } from "@/lib/db";
import { ToneSettings } from "@/components/tone/tone-settings";

export default async function TonePage() {
  let profiles: unknown[] = [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    profiles = await (db as any).toneProfile.findMany({ orderBy: { updatedAt: "desc" } });
  } catch { /* table may not exist if prisma client not regenerated yet */ }

  return (
    <div className="max-w-2xl mx-auto px-8 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Tone profiles</h1>
        <p className="text-sm text-gray-500 mt-1">
          Analyze existing 10Pearls content to build a reusable tone profile for AI content generation.
          Run this once, or re-analyze when your brand voice changes.
        </p>
      </div>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <ToneSettings initialProfiles={profiles as any} />
    </div>
  );
}
