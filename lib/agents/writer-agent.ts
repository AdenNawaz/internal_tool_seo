import { OutlineItem } from "./types";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: { "HTTP-Referer": "https://seo-tool.internal" },
});

const WRITER_MODELS = [
  "anthropic/claude-opus-4-5",
  "anthropic/claude-sonnet-4-5",
  "meta-llama/llama-3.3-70b-instruct:free",
  "google/gemma-3-27b-it:free",
  "nousresearch/hermes-3-llama-3.1-405b:free",
];

export async function* streamArticle(
  topic: string,
  primaryKeyword: string,
  secondaryKeywords: string[],
  outline: OutlineItem[],
  contentType: "blog" | "landing-page",
  toneProfile?: string
): AsyncGenerator<string> {
  const outlineText = outline.map(item => `${"#".repeat(item.level)} ${item.text}`).join("\n");
  const kwList = [primaryKeyword, ...secondaryKeywords].join(", ");

  const toneSection = toneProfile
    ? `\n\nTone profile to match:\n${toneProfile}`
    : "";

  const systemPrompt = `You are an expert SEO content writer for 10Pearls, an AI-powered digital engineering company. Write high-quality, engaging content that ranks well in search engines.${toneSection}

Writing guidelines:
- Use the primary keyword naturally in the first paragraph and 2-3 times throughout
- Incorporate secondary keywords where relevant without keyword stuffing
- Write in a clear, authoritative voice appropriate for ${contentType === "blog" ? "a blog post" : "a landing page"}
- Include specific examples, data points, and actionable insights
- For AEO headings: give concise, direct answers in 2-3 sentences
- For GEO headings: mention entities, locations, and contextual signals
- For SEO headings: target the keyword naturally in the content
- Aim for 200-300 words per H2 section`;

  const userPrompt = `Write a complete ${contentType} about: "${topic}"
Primary keyword: ${primaryKeyword}
Secondary keywords to weave in: ${kwList}

Follow this exact outline:
${outlineText}

Write the full article now. Use markdown with proper heading levels.`;

  let lastError: unknown;
  for (const model of WRITER_MODELS) {
    try {
      const stream = await openai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stream: true,
        max_tokens: 4000,
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) yield delta;
      }
      return;
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 429 || status === 404 || status === 402) { lastError = err; continue; }
      throw err;
    }
  }
  throw lastError ?? new Error("All writer models failed");
}
