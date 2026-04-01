import { cachedAhrefs } from "./ahrefs-cached";
import { parseMcpText } from "./ahrefs-utils";

interface MonthlyVolume {
  month: string;
  volume: number;
}

interface VolumeRow {
  keyword: string;
  volume?: number;
  monthly_volumes?: MonthlyVolume[];
  // Ahrefs may return the field under different keys
  [key: string]: unknown;
}

export interface TrendingKeyword {
  keyword: string;
  currentVolume: number;
  previousVolume: number;
  growthPct: number;
  monthlyData: MonthlyVolume[];
}

export async function findTrendingKeywords(params: {
  keywords: string[];
  country: string;
}): Promise<TrendingKeyword[]> {
  if (!params.keywords.length) return [];

  const raw = await cachedAhrefs(
    "keywords-explorer-search-volumes",
    {
      keywords: params.keywords.slice(0, 50).join(","),
      country: params.country,
      select: "keyword,volume,monthly_volumes",
    },
    86400 * 3
  );

  let rows: VolumeRow[] = [];
  try {
    const parsed = parseMcpText(raw);
    if (Array.isArray(parsed)) {
      rows = parsed as VolumeRow[];
    } else if (parsed && typeof parsed === "object") {
      // Some responses wrap in a key
      for (const k of Object.keys(parsed as object)) {
        const v = (parsed as Record<string, unknown>)[k];
        if (Array.isArray(v)) { rows = v as VolumeRow[]; break; }
      }
    }
  } catch {
    return [];
  }

  const results: TrendingKeyword[] = [];

  for (const row of rows) {
    // monthly_volumes may be under different key names
    const monthlyRaw =
      (row.monthly_volumes as MonthlyVolume[] | undefined) ??
      (row["monthlyVolumes"] as MonthlyVolume[] | undefined) ??
      [];

    if (monthlyRaw.length < 4) continue;

    // Sort ascending by month
    const sorted = [...monthlyRaw].sort((a, b) =>
      new Date(a.month).getTime() - new Date(b.month).getTime()
    );

    const last6 = sorted.slice(-6);
    if (last6.length < 4) continue;

    const recent = last6.slice(-2).map((m) => m.volume);
    const prior = last6.slice(-4, -2).map((m) => m.volume);

    const currentVolume = Math.round(recent.reduce((a, b) => a + b, 0) / recent.length);
    const previousVolume = Math.round(prior.reduce((a, b) => a + b, 0) / prior.length);

    if (previousVolume === 0) continue;

    const growthPct =
      Math.round(((currentVolume - previousVolume) / previousVolume) * 1000) / 10;

    if (growthPct > 20) {
      results.push({
        keyword: String(row.keyword ?? ""),
        currentVolume,
        previousVolume,
        growthPct,
        monthlyData: last6,
      });
    }
  }

  return results.sort((a, b) => b.growthPct - a.growthPct);
}
