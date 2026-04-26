import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: { "HTTP-Referer": "https://seo-tool.internal" },
});

const MODELS = [
  "anthropic/claude-sonnet-4-5",
  "meta-llama/llama-3.3-70b-instruct:free",
  "google/gemma-3-27b-it:free",
];

export interface EvidenceItem {
  type: "stat" | "quote" | "finding";
  text: string;
  context: string;
  source: string;
  sourceUrl: string;
  year: string | null;
}

async function llm(prompt: string): Promise<string> {
  for (const model of MODELS) {
    try {
      const res = await openai.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 2000,
      });
      return res.choices[0]?.message?.content ?? "";
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 429 || status === 404 || status === 402) continue;
      throw err;
    }
  }
  return "";
}

async function serpSearch(query: string): Promise<Array<{ url: string; title: string }>> {
  const key = process.env.SERPAPI_KEY;
  if (!key) return [];
  const params = new URLSearchParams({ q: query, api_key: key, num: "5", engine: "google" });
  try {
    const res = await fetch(`https://serpapi.com/search?${params}`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const data = await res.json() as { organic_results?: Array<{ link: string; title: string }> };
    return (data.organic_results ?? []).map((r) => ({ url: r.link, title: r.title }));
  } catch {
    return [];
  }
}

async function jinaFetch(url: string): Promise<string> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { Accept: "text/plain" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return "";
    const text = await res.text();
    return text.slice(0, 2000);
  } catch {
    return "";
  }
}

function domainOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

export async function collectEvidence(params: {
  topic: string;
  year: number;
  preferredSources: string[];
  excludedSources: string[];
}): Promise<EvidenceItem[]> {
  const { topic, year, preferredSources, excludedSources } = params;

  const queries = [
    `${topic} statistics ${year}`,
    `${topic} research report ${year}`,
    `${topic} survey data`,
    `${topic} market size`,
  ];

  // Run searches in parallel
  const searchResults = await Promise.all(queries.map(serpSearch));
  const allUrls = searchResults.flat().map((r) => r.url);

  // Deduplicate and take top 12
  const uniqueUrls = Array.from(new Set(allUrls)).slice(0, 12);

  // Filter excluded sources
  const filteredUrls = uniqueUrls.filter((url) => {
    const domain = domainOf(url);
    return !excludedSources.some((ex) => domain.includes(ex));
  });

  // Scrape in parallel (max 6 at once)
  const scraped: Array<{ url: string; content: string }> = [];
  for (let i = 0; i < filteredUrls.length; i += 6) {
    const batch = filteredUrls.slice(i, i + 6);
    const results = await Promise.all(batch.map(async (url) => ({ url, content: await jinaFetch(url) })));
    scraped.push(...results.filter((r) => r.content.length > 100));
  }

  if (scraped.length === 0) return [];

  const combinedContent = scraped
    .map((s) => `SOURCE: ${s.url}\n${s.content}`)
    .join("\n\n---\n\n");

  const prompt = `You are a research analyst extracting evidence from source material.

Extract statistics, key findings, and quotable facts from this content.
Only include items with specific numbers, percentages, or named research sources.
Do not include vague claims without data backing.

Content:
"""
${combinedContent.slice(0, 12000)}
"""

Return JSON array only (no markdown):
[{
  "type": "stat|quote|finding",
  "text": "the exact statistic or quote",
  "context": "one sentence of context",
  "source": "organization or publication name",
  "sourceUrl": "url where this was found",
  "year": "2024 or null if unknown"
}]`;

  const raw = await llm(prompt);
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return [];

  let items: EvidenceItem[] = [];
  try {
    items = JSON.parse(match[0]) as EvidenceItem[];
  } catch {
    return [];
  }

  // Filter excluded sources from results
  items = items.filter((item) => {
    const domain = domainOf(item.sourceUrl);
    return !excludedSources.some((ex) => domain.includes(ex));
  });

  // Sort: preferred sources first, then stats > findings > quotes
  const typeScore = { stat: 3, finding: 2, quote: 1 };
  items.sort((a, b) => {
    const aPref = preferredSources.some((p) => domainOf(a.sourceUrl).includes(p)) ? 10 : 0;
    const bPref = preferredSources.some((p) => domainOf(b.sourceUrl).includes(p)) ? 10 : 0;
    return (bPref + (typeScore[b.type] ?? 0)) - (aPref + (typeScore[a.type] ?? 0));
  });

  // Deduplicate similar texts (naive: same first 40 chars)
  const seen = new Set<string>();
  items = items.filter((item) => {
    const key = item.text.slice(0, 40).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return items.slice(0, 15);
}
