// compromise runs client-side only — import guarded by caller
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NlpDoc = any;

const STOP_WORDS = new Set([
  "the", "and", "for", "that", "this", "with", "from", "are", "was",
  "were", "have", "has", "will", "would", "could", "should", "they",
  "them", "their", "then", "than", "when", "what", "which", "who",
  "how", "where", "here", "just", "also", "more", "most", "some",
  "very", "into", "over", "under", "about", "after", "before",
  "during", "between", "each", "every", "both", "many", "much",
  "even", "still", "only", "once",
]);

export function extractTopics(plainText: string): string[] {
  // Dynamic import of compromise — only called in browser context
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nlp: (text: string) => NlpDoc = require("compromise");
  const doc = nlp(plainText);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const phrases: string[] = doc.nouns().out("array").map((p: any) =>
    String(p).toLowerCase().trim()
  );

  const freq = new Map<string, number>();
  for (const phrase of phrases) {
    if (phrase.length < 3) continue;
    const words = phrase.split(/\s+/);
    if (words.every((w) => STOP_WORDS.has(w))) continue;
    freq.set(phrase, (freq.get(phrase) ?? 0) + 1);
  }

  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([phrase]) => phrase);
}

export interface PublishedArticle {
  id: string;
  title: string;
  targetKeyword: string | null;
  slug: string | null;
  publishedUrl: string | null;
}

export interface LinkSuggestion {
  suggestedAnchorText: string;
  matchedArticle: { id: string; title: string; url: string };
  confidence: "high" | "medium";
  reason: string;
}

export function findLinkOpportunities(
  topics: string[],
  publishedArticles: PublishedArticle[],
  currentArticleId: string
): LinkSuggestion[] {
  const suggestions: LinkSuggestion[] = [];
  const usedArticleIds = new Set<string>();

  for (const topic of topics) {
    for (const article of publishedArticles) {
      if (article.id === currentArticleId) continue;
      if (usedArticleIds.has(article.id)) continue;
      if (!article.publishedUrl && !article.slug) continue;

      const url = article.publishedUrl ?? `/${article.slug}`;
      const kw = article.targetKeyword?.toLowerCase() ?? "";
      const titleLc = article.title.toLowerCase();
      const topicLc = topic.toLowerCase();

      if (kw && kw.includes(topicLc)) {
        suggestions.push({
          suggestedAnchorText: topic,
          matchedArticle: { id: article.id, title: article.title, url },
          confidence: "high",
          reason: `Matches target keyword: ${article.targetKeyword}`,
        });
        usedArticleIds.add(article.id);
      } else if (titleLc.includes(topicLc)) {
        suggestions.push({
          suggestedAnchorText: topic,
          matchedArticle: { id: article.id, title: article.title, url },
          confidence: "medium",
          reason: `Appears in article title`,
        });
        usedArticleIds.add(article.id);
      }
    }
  }

  return suggestions
    .sort((a, b) => (a.confidence === "high" ? -1 : b.confidence === "high" ? 1 : 0))
    .slice(0, 8);
}
