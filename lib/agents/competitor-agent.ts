import { CompetitorData } from "./types";
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
  "nousresearch/hermes-3-llama-3.1-405b:free",
  "google/gemma-3-12b-it:free",
];

async function llm(prompt: string, maxTokens = 1200): Promise<string> {
  let lastError: unknown;
  for (const model of MODELS) {
    try {
      const res = await openai.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: maxTokens,
      });
      return res.choices[0]?.message?.content ?? "";
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 429 || status === 404 || status === 402) { lastError = err; continue; }
      throw err;
    }
  }
  throw lastError;
}

async function fetchSerp(keyword: string, country: string): Promise<string[]> {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) return [];
  try {
    const params = new URLSearchParams({
      q: keyword,
      api_key: apiKey,
      engine: "google",
      num: "10",
      gl: country,
    });
    const res = await fetch(`https://serpapi.com/search?${params}`);
    if (!res.ok) return [];
    const data = await res.json() as { organic_results?: Array<{ link?: string }> };
    const ownDomain = process.env.OWN_DOMAIN ?? "";
    return (data.organic_results ?? [])
      .map(r => r.link ?? "")
      .filter(u => u && !u.includes(ownDomain))
      .slice(0, 5);
  } catch {
    return [];
  }
}

async function scrapeUrl(url: string): Promise<string> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { Accept: "text/plain" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return "";
    const text = await res.text();
    return text.slice(0, 4000);
  } catch {
    return "";
  }
}

export async function runCompetitorAgent(
  keyword: string,
  country: string = "us"
): Promise<CompetitorData[]> {
  const urls = await fetchSerp(keyword, country);
  if (urls.length === 0) {
    // Return placeholder if no SERP data
    return [{
      url: "https://example.com",
      title: "No competitor data available",
      keyPoints: ["SERP API key not configured — competitor analysis skipped"],
    }];
  }

  const scraped = await Promise.all(
    urls.slice(0, 4).map(async (url) => {
      const content = await scrapeUrl(url);
      return { url, content };
    })
  );

  const results: CompetitorData[] = [];

  for (const { url, content } of scraped) {
    if (!content) continue;
    const prompt = `Analyze this competitor page for the keyword "${keyword}":

URL: ${url}
Content (truncated):
${content}

Extract and return JSON only:
{
  "title": "page title",
  "wordCount": 1500,
  "keyPoints": ["key point 1", "key point 2", "key point 3", "key point 4", "key point 5"]
}`;

    try {
      const raw = await llm(prompt, 600);
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        const d = JSON.parse(match[0]) as { title: string; wordCount: number; keyPoints: string[] };
        results.push({ url, title: d.title, wordCount: d.wordCount, keyPoints: d.keyPoints });
      }
    } catch {
      results.push({ url, title: url, keyPoints: [] });
    }
  }

  return results;
}
