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
  "google/gemma-3-12b-it:free",
];

export interface GeoQuestion {
  question: string;
  rationale: string;
}

export interface AeoQuestion {
  question: string;
  format: "definition" | "list" | "steps" | "comparison" | "number";
}

interface GeoAeoResult {
  geoQuestions: GeoQuestion[];
  aeoQuestions: AeoQuestion[];
}

export async function generateGeoAeoQuestions(params: {
  keyword: string;
  contentType: "blog" | "landing-page";
  paaQuestions: string[];
  briefSummary: string;
}): Promise<GeoAeoResult> {
  const { keyword, contentType, paaQuestions, briefSummary } = params;

  const userPrompt = `KEYWORD: ${keyword}
CONTENT TYPE: ${contentType}
EXISTING PAA QUESTIONS: ${paaQuestions.slice(0, 5).join(" | ")}
CONTENT SUMMARY: ${briefSummary || "N/A"}

Generate two sets of questions:

1. GEO questions (up to 10): Questions this content should answer to appear in AI-generated responses (ChatGPT, Perplexity, Google AI Overviews). Focus on definitional, comparative, and how-to questions that AI tools commonly answer.

2. AEO questions (up to 8): Questions to target for featured snippets and voice search. Format values: definition, list, steps, comparison, number.

Return JSON:
{
  "geoQuestions": [{ "question": "...", "rationale": "..." }],
  "aeoQuestions": [{ "question": "...", "format": "definition|list|steps|comparison|number" }]
}`;

  let lastError: unknown;
  for (const model of MODELS) {
    try {
      const res = await openai.chat.completions.create({
        model,
        messages: [
          {
            role: "system",
            content: "You are an expert in AI search optimization (GEO) and answer engine optimization (AEO). Return only valid JSON.",
          },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 800,
      });

      const raw = res.choices[0]?.message?.content ?? "";
      const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]) as GeoAeoResult;
        return {
          geoQuestions: Array.isArray(parsed.geoQuestions) ? parsed.geoQuestions.slice(0, 10) : [],
          aeoQuestions: Array.isArray(parsed.aeoQuestions) ? parsed.aeoQuestions.slice(0, 8) : [],
        };
      }
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 429 || status === 404) { lastError = err; continue; }
      throw err;
    }
  }

  console.error("geo-aeo generation failed:", lastError);
  return { geoQuestions: [], aeoQuestions: [] };
}
