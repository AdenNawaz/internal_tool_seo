import { cachedAhrefs } from "./ahrefs-cached";
import { parseMcpRows } from "./ahrefs-utils";

export interface CompetitorPage {
  domain: string;
  url: string;
  title: string;
  trafficShare: number | null;
}

export interface OwnDomainData {
  topKeywords: { keyword: string; position: number; volume: number | null }[];
  totalKeywords: number;
}

export interface CompetitorAnalysisSummary {
  topCompetitors: CompetitorPage[];
  ownDomain: OwnDomainData;
  keywordGapOpportunities: string[];
}

export async function analyzeCompetitors(
  keyword: string,
  ownDomain: string
): Promise<CompetitorAnalysisSummary> {
  const [serpCompResult, ownKeywordsResult] = await Promise.allSettled([
    cachedAhrefs("site-explorer-organic-competitors", {
      target: ownDomain,
      select: "competitor,common_keywords,competitor_keywords,traffic_share",
      limit: 10,
      country: "us",
    }),
    cachedAhrefs("site-explorer-organic-keywords", {
      target: ownDomain,
      select: "keyword,volume,position,url",
      limit: 100,
      order_by: "volume:desc",
      country: "us",
    }),
  ]);

  const competitors: CompetitorPage[] = [];
  if (serpCompResult.status === "fulfilled") {
    const rows = parseMcpRows(serpCompResult.value);
    for (const row of rows.slice(0, 8)) {
      const r = row as Record<string, unknown>;
      if (typeof r.competitor === "string") {
        competitors.push({
          domain: r.competitor,
          url: `https://${r.competitor}`,
          title: r.competitor,
          trafficShare: typeof r.traffic_share === "number" ? r.traffic_share : null,
        });
      }
    }
  }

  const ownKeywords: OwnDomainData["topKeywords"] = [];
  if (ownKeywordsResult.status === "fulfilled") {
    const rows = parseMcpRows(ownKeywordsResult.value);
    for (const row of rows.slice(0, 50)) {
      const r = row as Record<string, unknown>;
      if (typeof r.keyword === "string") {
        ownKeywords.push({
          keyword: r.keyword,
          position: typeof r.position === "number" ? r.position : 0,
          volume: typeof r.volume === "number" ? r.volume : null,
        });
      }
    }
  }

  // Simple gap: keywords in SERP but not in own rankings
  const ownKeywordSet = new Set(ownKeywords.map((k) => k.keyword.toLowerCase()));
  const keywordGapOpportunities = keyword
    .split(/\s+/)
    .filter((w) => w.length > 3 && !ownKeywordSet.has(w.toLowerCase()))
    .slice(0, 10);

  return {
    topCompetitors: competitors,
    ownDomain: { topKeywords: ownKeywords, totalKeywords: ownKeywords.length },
    keywordGapOpportunities,
  };
}
