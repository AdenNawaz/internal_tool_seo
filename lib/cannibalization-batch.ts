import { fetchOwnDomainRankings, matchRisk } from "./ahrefs-utils";

export interface BatchCanniResult {
  keyword: string;
  risk: "none" | "low" | "medium" | "high";
  url?: string;
  position?: number;
}

export async function batchCannibalizationCheck(
  keywords: string[]
): Promise<BatchCanniResult[]> {
  const rankings = await fetchOwnDomainRankings().catch(() => []);

  return keywords.map((kw) => {
    const { risk, match } = matchRisk(kw, rankings);
    return {
      keyword: kw,
      risk,
      url: match?.url,
      position: match?.position,
    };
  });
}
