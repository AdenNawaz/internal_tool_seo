import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: { "HTTP-Referer": "https://seo-tool.internal" },
});

const MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "google/gemma-3-27b-it:free",
  "nousresearch/hermes-3-llama-3.1-405b:free",
];

export interface GptQuery {
  text: string;
  source: "reddit" | "paa" | "ai";
}

function extractQuestions(text: string): string[] {
  return text
    .split(/[\n.!]/)
    .map((s) => s.trim())
    .filter((s) => s.endsWith("?") || /^(what|how|why|when|which|can|does|is|are|should|will|do)\b/i.test(s))
    .map((s) => s.replace(/^[-•*]\s*/, "").trim())
    .filter((s) => s.length > 15 && s.length < 200);
}

async function fetchRedditQuestions(topic: string): Promise<string[]> {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) return [];

  try {
    const params = new URLSearchParams({
      engine: "google",
      q: `site:reddit.com "${topic}"`,
      num: "5",
      api_key: apiKey,
    });
    const res = await fetch(`https://serpapi.com/search?${params}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json();

    const questions: string[] = [];
    for (const result of (data.organic_results ?? []).slice(0, 5)) {
      const combined = `${result.title ?? ""} ${result.snippet ?? ""}`;
      questions.push(...extractQuestions(combined));
    }
    return Array.from(new Set(questions)).slice(0, 8);
  } catch {
    return [];
  }
}

async function fetchAiCommonQueries(topic: string): Promise<string[]> {
  let lastError: unknown;
  for (const model of MODELS) {
    try {
      const res = await openai.chat.completions.create({
        model,
        messages: [
          {
            role: "system",
            content: "You are an expert on AI search behavior. Return only valid JSON.",
          },
          {
            role: "user",
            content: `What are the 10 most common questions people ask AI assistants (ChatGPT, Perplexity, etc.) about "${topic}"? Return as a JSON array of strings. Only the array, no other text.`,
          },
        ],
        max_tokens: 500,
      });

      const raw = res.choices[0]?.message?.content ?? "";
      const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
      const match = cleaned.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]) as unknown[];
        return parsed.filter((q) => typeof q === "string").slice(0, 10) as string[];
      }
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 429 || status === 404) { lastError = err; continue; }
      throw err;
    }
  }
  console.error("gpt-queries AI source failed:", lastError);
  return [];
}

function normalise(q: string) {
  return q.toLowerCase().replace(/[?!.]$/, "").trim();
}

export async function findGptQueries(
  topic: string,
  existingPaa: string[] = []
): Promise<{
  redditQuestions: string[];
  paaQuestions: string[];
  aiCommonQueries: string[];
  combined: GptQuery[];
}> {
  const [redditQuestions, aiCommonQueries] = await Promise.all([
    fetchRedditQuestions(topic),
    fetchAiCommonQueries(topic),
  ]);

  // Deduplicate across sources, priority: paa > ai > reddit
  const seen = new Set<string>();
  const combined: GptQuery[] = [];

  function addIfNew(text: string, source: GptQuery["source"]) {
    const key = normalise(text);
    if (!key || seen.has(key)) return;
    seen.add(key);
    combined.push({ text, source });
  }

  for (const q of existingPaa) addIfNew(q, "paa");
  for (const q of aiCommonQueries) addIfNew(q, "ai");
  for (const q of redditQuestions) addIfNew(q, "reddit");

  return {
    redditQuestions,
    paaQuestions: existingPaa,
    aiCommonQueries,
    combined: combined.slice(0, 15),
  };
}
