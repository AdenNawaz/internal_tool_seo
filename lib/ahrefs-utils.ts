import { cachedAhrefs } from "./ahrefs-cached";

export interface RankingEntry {
  keyword: string;
  position: number;
  url: string;
  volume: number | null;
}

export function parseMcpRows(result: unknown): Record<string, unknown>[] {
  if (!result || typeof result !== "object") return [];
  const r = result as { content?: { type: string; text: string }[] };
  if (!Array.isArray(r.content)) return [];
  const first = r.content[0];
  if (first?.type !== "text") return [];
  try {
    const parsed = JSON.parse(first.text);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") {
      for (const k of Object.keys(parsed)) {
        if (Array.isArray(parsed[k])) return parsed[k];
      }
    }
    return [];
  } catch {
    return [];
  }
}

export function parseMcpText(result: unknown): unknown {
  if (!result || typeof result !== "object") return result;
  const r = result as { content?: { type: string; text: string }[] };
  if (!Array.isArray(r.content)) return result;
  const first = r.content[0];
  if (first?.type !== "text") return result;
  try {
    return JSON.parse(first.text);
  } catch {
    return first.text;
  }
}

// Shared args object — key order must stay consistent for cache hits
const OWN_DOMAIN_ARGS = (domain: string) => ({
  target: domain,
  select: "keyword,volume,url,position",
  limit: 1000,
  order_by: "volume:desc",
  country: "us",
});

export async function fetchOwnDomainRankings(): Promise<RankingEntry[]> {
  const ownDomain = process.env.OWN_DOMAIN ?? "";
  if (!ownDomain) return [];
  const result = await cachedAhrefs(
    "site-explorer-organic-keywords",
    OWN_DOMAIN_ARGS(ownDomain),
    86400
  );
  return parseMcpRows(result).map((row) => ({
    keyword: String(row.keyword ?? ""),
    position: Number(row.position ?? 99),
    url: String(row.url ?? ""),
    volume: row.volume != null ? Number(row.volume) : null,
  }));
}

export function matchRisk(
  keyword: string,
  rankings: RankingEntry[]
): { risk: "none" | "low" | "medium" | "high"; match: RankingEntry | null } {
  const kw = keyword.toLowerCase().trim();
  let bestMatch: RankingEntry | null = null;
  let bestIsExact = false;

  for (const r of rankings) {
    const rKw = r.keyword.toLowerCase();
    const exact = rKw === kw;
    const fuzzy =
      !exact &&
      ((rKw.includes(kw) && kw.length > 3) ||
        (kw.includes(rKw) && rKw.length > 3));

    if (exact) {
      if (!bestMatch || r.position < bestMatch.position) {
        bestMatch = r;
        bestIsExact = true;
      }
    } else if (fuzzy && !bestIsExact) {
      if (!bestMatch || r.position < bestMatch.position) {
        bestMatch = r;
      }
    }
  }

  if (!bestMatch) return { risk: "none", match: null };
  const pos = bestMatch.position;
  if (bestIsExact && pos <= 10) return { risk: "high", match: bestMatch };
  if (pos <= 20) return { risk: "medium", match: bestMatch };
  return { risk: "low", match: bestMatch };
}
