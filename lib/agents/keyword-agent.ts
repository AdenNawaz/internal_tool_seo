import { cachedAhrefs } from "../ahrefs-cached";
import { parseMcpRows } from "../ahrefs-utils";
import { KeywordData } from "./types";
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

async function llm(prompt: string): Promise<string> {
  let lastError: unknown;
  for (const model of MODELS) {
    try {
      const res = await openai.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 800,
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

export async function runKeywordAgent(
  topic: string,
  country: string = "us"
): Promise<{ primary: string; keywords: KeywordData[] }> {
  // 1. Get Ahrefs keyword ideas
  let rows: Record<string, unknown>[] = [];
  try {
    const result = await cachedAhrefs("keywords-explorer-matching-terms", {
      keywords: [topic],
      country,
      limit: 30,
      select: "keyword,volume,keyword_difficulty,parent_topic",
    });
    rows = parseMcpRows(result);
  } catch { /* ignore — may not have Ahrefs */ }

  // 2. Ask LLM to pick the best primary + top secondary keywords
  const kwList = rows.length > 0
    ? rows.slice(0, 30).map(r =>
        `- ${r.keyword} (vol: ${r.volume ?? "n/a"}, KD: ${r.keyword_difficulty ?? "n/a"})`
      ).join("\n")
    : `(No Ahrefs data — suggest keywords based on: ${topic})`;

  const prompt = `You are an SEO keyword strategist. Given this topic: "${topic}", select:
1. The single best primary keyword (high volume, lower difficulty, clear intent)
2. Up to 8 secondary keywords (supporting terms, question variants, long-tails)

Available keyword data:
${kwList}

Respond with JSON only:
{
  "primary": "keyword here",
  "secondary": [
    { "keyword": "...", "volume": 1000, "kd": 25, "intent": "informational|commercial|transactional|navigational" }
  ]
}`;

  const raw = await llm(prompt);
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Keyword agent: could not parse LLM response");

  const parsed = JSON.parse(match[0]) as {
    primary: string;
    secondary: Array<{ keyword: string; volume: number; kd: number; intent: string }>;
  };

  // Merge Ahrefs volumes into LLM picks where available
  const ahrefsMap = new Map(rows.map(r => [String(r.keyword).toLowerCase(), r]));

  const keywords: KeywordData[] = parsed.secondary.map(s => {
    const aData = ahrefsMap.get(s.keyword.toLowerCase());
    return {
      keyword: s.keyword,
      volume: aData ? Number(aData.volume ?? s.volume) : s.volume,
      kd: aData ? Number(aData.keyword_difficulty ?? s.kd) : s.kd,
      intent: s.intent,
    };
  });

  return { primary: parsed.primary, keywords };
}

export async function handleKeywordIntervention(
  intervention: string,
  currentKeywords: KeywordData[],
  topic: string
): Promise<{ primary: string; keywords: KeywordData[] }> {
  const prompt = `An SEO writer is reviewing these keyword suggestions for topic: "${topic}"

Current primary keyword: ${currentKeywords[0]?.keyword ?? "none"}
Current secondary keywords:
${currentKeywords.map(k => `- ${k.keyword} (vol: ${k.volume}, KD: ${k.kd})`).join("\n")}

Writer's feedback: "${intervention}"

Apply the feedback and return an updated keyword set as JSON:
{
  "primary": "keyword here",
  "secondary": [
    { "keyword": "...", "volume": 1000, "kd": 25, "intent": "informational" }
  ]
}`;

  const raw = await llm(prompt);
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Could not parse keyword revision");

  const parsed = JSON.parse(match[0]) as {
    primary: string;
    secondary: Array<{ keyword: string; volume: number; kd: number; intent: string }>;
  };

  return {
    primary: parsed.primary,
    keywords: parsed.secondary,
  };
}
