import OpenAI from "openai";
import type { OutlineItem } from "./outline-types";

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: { "HTTP-Referer": "https://seo-tool.internal" },
});

// Paid Claude first (quality), free models as fallback
const MODELS = [
  "anthropic/claude-opus-4-5",
  "anthropic/claude-sonnet-4-5",
  "meta-llama/llama-3.3-70b-instruct:free",
  "google/gemma-3-27b-it:free",
  "nousresearch/hermes-3-llama-3.1-405b:free",
];

interface GenerateParams {
  outline: OutlineItem[];
  targetKeyword: string;
  contentType: "blog" | "landing-page";
  toneProfile: string;
  companyProfile: string;
  brief: {
    searchIntent: string;
    wordCountRange: { min: number; max: number };
    contentGaps: string[];
    paaQuestions: string[];
  };
}

export async function* streamContent(params: GenerateParams): AsyncGenerator<string> {
  const { outline, targetKeyword, contentType, toneProfile, companyProfile, brief } = params;

  const outlineText = outline
    .map((item) => `${"#".repeat(item.level)} ${item.text}`)
    .join("\n");

  const systemPrompt = `You are a senior content writer for 10Pearls, an AI-powered global digital engineering company. Write in a conversational, expert tone — confident but not corporate. Use short paragraphs. Avoid passive voice. Write as if explaining to a smart client, not to a search engine.

TONE PROFILE (match this style):
${toneProfile}

CRITICAL WRITING RULES:
- Vary sentence length. Mix short punchy sentences with longer ones.
- Use specific examples and numbers where possible.
- Avoid these AI-giveaway phrases: 'In today's world', 'It is important to note', 'In conclusion', 'Furthermore', 'Moreover', 'Delve into', 'It is worth mentioning', 'As we can see'.
- Never start consecutive sentences with the same word.
- Use contractions (we're, it's, you'll) — they sound human.
- Do not pad content. If a section needs 3 sentences, write 3.
- Write FAQ answers conversationally — as if a person asked you directly.`;

  const userPrompt = `CONTENT TYPE: ${contentType}
TARGET KEYWORD: ${targetKeyword}
SEARCH INTENT: ${brief.searchIntent}
TARGET WORD COUNT: ${brief.wordCountRange.min}–${brief.wordCountRange.max} words

COMPANY PROFILE:
${companyProfile}

CONTENT GAPS TO ADDRESS:
${brief.contentGaps.join("\n") || "None specified"}

OUTLINE TO FOLLOW (write content for each heading in order):
${outlineText}

PAA QUESTIONS TO ANSWER (work these into the FAQ section or as natural subheadings):
${brief.paaQuestions.join("\n") || "None"}

Write the full article following the outline exactly. Do not add or remove headings. Do not add a conclusion section unless it is in the outline.
Return the content as markdown with ## for H2 and ### for H3.`;

  let stream: Awaited<ReturnType<typeof openai.chat.completions.create>> | null = null;
  let lastError: unknown;

  for (const model of MODELS) {
    try {
      stream = await openai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stream: true,
        max_tokens: 4096,
      });
      break;
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 429 || status === 404 || status === 402) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }

  if (!stream) throw lastError ?? new Error("All models unavailable — try again in a moment");

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}
