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

// Word count allocation: intro 10%, conclusion 5%, FAQ 15%, rest split across H2s
function allocateWordCounts(outline: OutlineItem[], totalTarget = 1800): Map<string, number> {
  const h2s = outline.filter(i => i.level === 2);
  const introIdx = h2s.findIndex(i => /intro|overview/i.test(i.text));
  const conclusionIdx = h2s.findIndex(i => /conclusion|summary|final/i.test(i.text));
  const faqIdx = h2s.findIndex(i => /faq|question|frequently/i.test(i.text));

  const introWords = Math.round(totalTarget * 0.1);
  const conclusionWords = Math.round(totalTarget * 0.05);
  const faqWords = faqIdx !== -1 ? Math.round(totalTarget * 0.15) : 0;
  const remaining = totalTarget - introWords - conclusionWords - faqWords;
  const regularH2s = h2s.length - (introIdx !== -1 ? 1 : 0) - (conclusionIdx !== -1 ? 1 : 0) - (faqIdx !== -1 ? 1 : 0);
  const perH2 = regularH2s > 0 ? Math.round(remaining / regularH2s) : remaining;

  const map = new Map<string, number>();
  h2s.forEach((item, idx) => {
    if (idx === introIdx) map.set(item.id, introWords);
    else if (idx === conclusionIdx) map.set(item.id, conclusionWords);
    else if (idx === faqIdx) map.set(item.id, faqWords);
    else map.set(item.id, perH2);
  });
  return map;
}

function sectionPrompt(
  item: OutlineItem,
  wordCount: number,
  primaryKeyword: string,
  isFirstSection: boolean
): string {
  const type = item.type ?? "seo";
  const heading = item.text;
  const level = item.level === 2 ? "##" : "###";

  const base = `${level} ${heading}\n\n`;

  const wordInstruction = `Target: ~${wordCount} words for this section.`;

  switch (type as string) {
    case "aeo": {
      const fmt = (item as { aeoFormat?: string }).aeoFormat ?? "definition";
      const fmtInstruction = {
        definition: "First paragraph must be under 50 words and directly define or answer the heading topic in plain language.",
        list: "Use a numbered or bulleted list immediately after the heading. Each item: one sentence, no padding.",
        steps: "Number the steps. Start each with a verb. Each step: 1-2 sentences max.",
        number: "Lead with the specific number or figure. Example: 'X companies report...' or 'The average is...'",
      }[fmt] ?? "";
      return `${base}Write the "${heading}" section for featured snippet targeting.
Format: ${fmt}. ${fmtInstruction}
After the featured-snippet-optimised opening, write 1-2 normal paragraphs adding context.
${wordInstruction}`;
    }

    case "geo":
      return `${base}Write the "${heading}" section to maximize AI citation likelihood.
- Start with a direct, quotable statement or definition (one sentence, under 25 words)
- Include at least one specific statistic with context
- Use clear entity names (company names, tool names, proper nouns) throughout
- Write in a factual, encyclopedic tone for this section
- End with a concrete example that makes the concept tangible
${wordInstruction}`;

    case "gpt":
      return `${base}Write the "${heading}" section as a self-contained, quotable passage.
- Rephrase the heading as a declarative statement in the first sentence
- Use concrete facts over general statements
- Make this section fully understandable out of context (AI tools extract passages)
- Avoid phrases like "as we discussed" or forward references
${wordInstruction}`;

    case "paa":
      return `${base}Write the "${heading}" section as a direct answer to the question.
- First sentence: direct answer, under 20 words
- Following sentences: expand with context and supporting detail
- Keep the whole answer under 150 words
- Do not start with "Yes" or "No" alone
${wordInstruction}`;

    default: // seo, general
      return `${base}Write the "${heading}" section.${isFirstSection ? ` Include the keyword "${primaryKeyword}" naturally in the first paragraph.` : ""} Use a clear structure with specific examples or data points. ${wordInstruction}`;
  }
}

async function* streamSection(
  sectionPromptText: string,
  systemPrompt: string
): AsyncGenerator<string> {
  let lastError: unknown;
  for (const model of WRITER_MODELS) {
    try {
      const stream = await openai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: sectionPromptText },
        ],
        stream: true,
        max_tokens: 800,
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

export async function* streamArticle(
  topic: string,
  primaryKeyword: string,
  secondaryKeywords: string[],
  outline: OutlineItem[],
  contentType: "blog" | "landing-page",
  toneProfile?: string
): AsyncGenerator<string> {
  const toneSection = toneProfile ? `\n\nTone profile to match:\n${toneProfile}` : "";
  const kwList = secondaryKeywords.join(", ");

  const systemPrompt = `You are an expert SEO content writer for 10Pearls, an AI-powered digital engineering company. Write high-quality, engaging ${contentType === "blog" ? "blog content" : "landing page copy"}.${toneSection}

Rules:
- Write ONLY the requested section content — do not repeat the heading or add preamble
- Incorporate secondary keywords naturally where relevant: ${kwList || "none"}
- Be specific: use examples, data points, and concrete details
- Never use filler phrases like "It is important to note" or "In today's digital landscape"`;

  const wordCounts = allocateWordCounts(outline);
  const h2Items = outline.filter(i => i.level === 2);

  let isFirstSection = true;

  for (const item of outline) {
    if (item.level === 2) {
      // Yield heading
      yield `\n\n## ${item.text}\n\n`;

      // Collect H3 children for context
      const h2Idx = outline.indexOf(item);
      const h3Children = outline.slice(h2Idx + 1).filter((_, i) => {
        const nextH2 = outline.slice(h2Idx + 1).findIndex(o => o.level === 2);
        return nextH2 === -1 || i < nextH2;
      }).filter(o => o.level === 3);

      // Generate section content
      const wc = wordCounts.get(item.id) ?? 200;
      const prompt = sectionPrompt(item, wc, primaryKeyword, isFirstSection);
      const fullPrompt = h3Children.length > 0
        ? `${prompt}\n\nThis section should cover these sub-topics: ${h3Children.map(h => h.text).join(", ")}`
        : prompt;

      for await (const delta of streamSection(fullPrompt, systemPrompt)) {
        yield delta;
      }
      isFirstSection = false;
    } else if (item.level === 3) {
      // H3s get their heading yielded; content is generated by the parent H2
      yield `\n\n### ${item.text}\n\n`;
    }
  }
}
