import type { KeywordCluster } from "./cluster-builder";

export interface CoverageArticle {
  id: string;
  title: string;
  status: string;
  clusterName?: string | null;
  targetKeyword: string | null;
}

export interface ClusterCoverage {
  clusterName: string;
  totalVolume: number;
  primaryKeyword: string;
  pillarStatus: "published" | "draft" | "review" | "not started";
  pillarArticle: { id: string; title: string; status: string } | null;
  supportingTotal: number;
  supportingCovered: number;
  supportingArticles: Array<{ id: string; title: string; status: string }>;
  coveragePct: number;
  priority: "high" | "medium" | "low";
}

function kwMatch(article: CoverageArticle, keyword: string): boolean {
  const kw = keyword.toLowerCase();
  const tk = article.targetKeyword?.toLowerCase() ?? "";
  return tk === kw || tk.includes(kw);
}

export function computeCoverage(params: {
  clusters: KeywordCluster[];
  articles: CoverageArticle[];
}): ClusterCoverage[] {
  return params.clusters.map((cluster) => {
    const allKws = [cluster.primaryKeyword, ...(cluster.keywords ?? [])];
    const clusterArticles = params.articles.filter(
      (a) =>
        a.clusterName?.toLowerCase() === cluster.clusterName.toLowerCase() ||
        allKws.some((kw) => kwMatch(a, kw))
    );

    const pillarArticle =
      clusterArticles.find((a) => kwMatch(a, cluster.primaryKeyword)) ?? null;

    const pillarStatus: ClusterCoverage["pillarStatus"] = pillarArticle
      ? pillarArticle.status === "published"
        ? "published"
        : ["review", "ready"].includes(pillarArticle.status)
        ? "review"
        : "draft"
      : "not started";

    const supportingKws = cluster.keywords ?? [];
    const supportingTotal = supportingKws.length;
    const supportingArticles = clusterArticles.filter(
      (a) =>
        a.id !== pillarArticle?.id &&
        supportingKws.some((kw) => kwMatch(a, kw))
    );
    const supportingCovered = supportingArticles.length;

    const coveragePct =
      supportingTotal === 0
        ? pillarArticle ? 100 : 0
        : Math.min(100, Math.round((supportingCovered / supportingTotal) * 100));

    const priority: ClusterCoverage["priority"] =
      coveragePct < 25 && (cluster.estimatedVolume ?? 0) > 1000
        ? "high"
        : coveragePct < 75
        ? "medium"
        : "low";

    return {
      clusterName: cluster.clusterName,
      totalVolume: cluster.estimatedVolume ?? 0,
      primaryKeyword: cluster.primaryKeyword,
      pillarStatus,
      pillarArticle: pillarArticle
        ? { id: pillarArticle.id, title: pillarArticle.title, status: pillarArticle.status }
        : null,
      supportingTotal,
      supportingCovered,
      supportingArticles: supportingArticles.map((a) => ({
        id: a.id,
        title: a.title,
        status: a.status,
      })),
      coveragePct,
      priority,
    };
  });
}
