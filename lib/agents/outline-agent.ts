import { OutlineItem, CompetitorData, KeywordData } from "./types";
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

async function llm(prompt: string, maxTokens = 1500): Promise<string> {
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

export async function generateOutline(
  topic: string,
  primaryKeyword: string,
  secondaryKeywords: KeywordData[],
  competitors: CompetitorData[],
  contentType: "blog" | "landing-page"
): Promise<OutlineItem[]> {
  const kwList = secondaryKeywords.map(k => `- ${k.keyword} (intent: ${k.intent})`).join("\n");
  const compSummary = competitors
    .slice(0, 3)
    .map(c => `${c.url}:\n${(c.keyPoints ?? []).slice(0, 4).map(p => `  • ${p}`).join("\n")}`)
    .join("\n\n");

  const prompt = `Create a detailed content outline for a ${contentType} about: "${topic}"
Primary keyword: ${primaryKeyword}

Secondary keywords to cover:
${kwList}

Competitor key points to consider:
${compSummary}

Label each heading with its SEO type:
- "seo" = traditional search query heading
- "geo" = geographic/local/entity-based (for Google Search generative experience)
- "aeo" = answer engine optimization (direct question format for AI/voice answers)
- "general" = intro, conclusion, or structural sections

Return JSON array only:
[
  { "id": "h1", "level": 2, "text": "Introduction heading", "type": "general" },
  { "id": "h2", "level": 2, "text": "What is X?", "type": "aeo" },
  { "id": "h2a", "level": 3, "text": "Sub-point", "type": "seo" },
  ...
]

Include 8-12 H2s and 4-8 H3s. Make headings specific and compelling.`;

  const raw = await llm(prompt, 1800);
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("Outline agent: could not parse response");

  const items = JSON.parse(match[0]) as Array<{
    id: string;
    level: number;
    text: string;
    type: string;
  }>;

  return items.map((item, i) => ({
    id: item.id || `h${i}`,
    level: (item.level === 3 ? 3 : 2) as 2 | 3,
    text: item.text,
    type: (["seo", "geo", "aeo", "general"].includes(item.type) ? item.type : "seo") as OutlineItem["type"],
  }));
}

export async function applyOutlineIntervention(
  intervention: string,
  currentOutline: OutlineItem[],
  topic: string
): Promise<OutlineItem[]> {
  const outlineText = currentOutline.map(
    (item, i) => `${i + 1}. [H${item.level}][${item.type}] ${item.text}`
  ).join("\n");

  const prompt = `An SEO writer is editing this outline for: "${topic}"

Current outline:
${outlineText}

Writer's request: "${intervention}"

Apply the requested changes and return the full updated outline as JSON array:
[
  { "id": "h1", "level": 2, "text": "...", "type": "seo|geo|aeo|general" },
  ...
]`;

  const raw = await llm(prompt, 1500);
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return currentOutline;

  const items = JSON.parse(match[0]) as Array<{
    id: string;
    level: number;
    text: string;
    type: string;
  }>;

  return items.map((item, i) => ({
    id: item.id || `h${i}`,
    level: (item.level === 3 ? 3 : 2) as 2 | 3,
    text: item.text,
    type: (["seo", "geo", "aeo", "general"].includes(item.type) ? item.type : "seo") as OutlineItem["type"],
  }));
}
