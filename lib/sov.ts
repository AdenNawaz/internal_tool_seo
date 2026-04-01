import { cachedAhrefs } from "./ahrefs-cached";
import { parseMcpText } from "./ahrefs-utils";

interface SovRow {
  keyword: string;
  target: string;
  share_of_voice?: number;
  traffic?: number;
}

interface SovResult {
  companySOV: number;
  competitors: Array<{ domain: string; sov: number }>;
  keywordCount: number;
  error?: string;
}

const OWN_DOMAIN = process.env.OWN_DOMAIN ?? "";

export async function fetchShareOfVoice(params: {
  trackedKeywords: string[];
  competitorDomains: string[];
  country: string;
}): Promise<SovResult> {
  if (!params.trackedKeywords.length) {
    return { companySOV: 0, competitors: [], keywordCount: 0, error: "No tracked keywords found. Publish articles with a target keyword to enable Share of Voice." };
  }
  if (!params.competitorDomains.length) {
    return { companySOV: 0, competitors: [], keywordCount: 0, error: "No competitor domains found. Run a research report first to identify competitors." };
  }

  const allDomains = [OWN_DOMAIN, ...params.competitorDomains.slice(0, 4)];

  let rawResult: unknown;
  try {
    rawResult = await cachedAhrefs(
      "rank-tracker-competitors-metrics",
      {
        select: "keyword,target,share_of_voice,traffic",
        country: params.country,
        competitors: params.competitorDomains.slice(0, 4).join(","),
        keywords: params.trackedKeywords.slice(0, 50).join(","),
      },
      86400 // 1-day TTL
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes("rank tracker") || msg.toLowerCase().includes("not configured")) {
      return { companySOV: 0, competitors: [], keywordCount: 0, error: "Rank Tracker must be configured in your Ahrefs account for this feature." };
    }
    return { companySOV: 0, competitors: [], keywordCount: 0, error: "Failed to fetch Share of Voice data from Ahrefs." };
  }

  let rows: SovRow[] = [];
  try {
    const parsed = parseMcpText(rawResult);
    if (Array.isArray(parsed)) {
      rows = parsed as SovRow[];
    }
  } catch {
    return { companySOV: 0, competitors: [], keywordCount: 0, error: "Rank Tracker must be configured in your Ahrefs account for this feature." };
  }

  if (!rows.length) {
    return { companySOV: 0, competitors: [], keywordCount: 0, error: "Rank Tracker must be configured in your Ahrefs account. No data returned." };
  }

  // Sum SOV per domain
  const sovMap = new Map<string, number>();
  for (const domain of allDomains) sovMap.set(domain, 0);

  for (const row of rows) {
    const domain = row.target;
    if (sovMap.has(domain)) {
      sovMap.set(domain, (sovMap.get(domain) ?? 0) + (row.share_of_voice ?? 0));
    }
  }

  const total = Array.from(sovMap.values()).reduce((a, b) => a + b, 0) || 1;

  const companySOV = Math.round(((sovMap.get(OWN_DOMAIN) ?? 0) / total) * 1000) / 10;
  const competitors = params.competitorDomains.slice(0, 4).map((domain) => ({
    domain,
    sov: Math.round(((sovMap.get(domain) ?? 0) / total) * 1000) / 10,
  }));

  const uniqueKeywords = new Set(rows.map((r) => r.keyword)).size;

  return { companySOV, competitors, keywordCount: uniqueKeywords };
}
