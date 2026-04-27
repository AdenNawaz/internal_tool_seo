export type CoverageStatus = "completed" | "in_progress" | "overuse" | "topic_gap";

export interface KeywordCoverage {
  keyword: string;
  target: number;
  actual: number;
  status: CoverageStatus;
  ratio: string;
}

function countOccurrences(text: string, keyword: string): number {
  if (!keyword.trim()) return 0;
  const lower = text.toLowerCase();
  const kw = keyword.toLowerCase().trim();

  // Exact phrase match
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const exact = (lower.match(new RegExp(`\\b${escaped}\\b`, "g")) ?? []).length;

  // For compound keywords, also count the first word alone
  let partial = 0;
  const parts = kw.split(/\s+/);
  if (parts.length > 1) {
    const firstPart = parts[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    partial = (lower.match(new RegExp(`\\b${firstPart}\\b`, "g")) ?? []).length - exact;
  }

  return exact + Math.floor(partial * 0.3); // partial matches weighted at 30%
}

export function computeTopicCoverage(params: {
  plainText: string;
  keywords: Array<{ keyword: string; target: number }>;
}): KeywordCoverage[] {
  const { plainText, keywords } = params;

  return keywords.map(({ keyword, target }) => {
    const actual = countOccurrences(plainText, keyword);
    let status: CoverageStatus;
    if (actual === 0) {
      status = "topic_gap";
    } else if (actual >= target && actual <= target * 2) {
      status = "completed";
    } else if (actual > target * 2) {
      status = "overuse";
    } else {
      status = "in_progress";
    }
    return { keyword, target, actual, status, ratio: `${actual}/${target}` };
  });
}

export function buildCoverageKeywords(params: {
  targetKeyword: string | null;
  secondaryKeywords: string[];
  wordCount: number;
}): Array<{ keyword: string; target: number }> {
  const { targetKeyword, secondaryKeywords, wordCount } = params;
  const result: Array<{ keyword: string; target: number }> = [];

  if (targetKeyword?.trim()) {
    result.push({
      keyword: targetKeyword.trim(),
      target: Math.max(1, Math.ceil(wordCount / 500)),
    });
  }

  for (const kw of secondaryKeywords) {
    if (kw?.trim()) {
      result.push({
        keyword: kw.trim(),
        target: Math.max(1, Math.ceil(wordCount / 800)),
      });
    }
  }

  return result;
}
