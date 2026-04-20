import { NextRequest } from "next/server";
import { z } from "zod";
import OpenAI from "openai";
import { db } from "@/lib/db";

const schema = z.object({
  articleId: z.string(),
  headingText: z.string(),
  headingLevel: z.union([z.literal(2), z.literal(3)]),
  currentContent: z.string(),
  action: z.enum(["regenerate", "shorter", "longer", "conversational", "authoritative", "simpler", "add_example"]),
  context: z.object({
    targetKeyword: z.string().default(""),
    outline: z.array(z.any()).default([]),
    seoType: z.string().default("seo"),
  }),
});

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

const SEO_TYPE_INSTRUCTIONS: Record<string, string> = {
  aeo: "Start with a direct answer under 50 words in the first paragraph. Then expand with supporting detail.",
  geo: "Include a specific statistic or cited fact. Use an authoritative, encyclopedic structure. Name specific entities (companies, tools, proper nouns).",
  gpt: "Write this as a self-contained, quotable passage. Rephrase the heading as a statement in the first sentence. Use concrete facts over general statements.",
  paa: "Answer the question in the heading directly in the first sentence, under 20 words. Keep the whole section under 150 words.",
  seo: "",
};

function buildPrompt(
  headingText: string,
  currentContent: string,
  action: string,
  seoType: string,
  targetKeyword: string
): string {
  const seoInstruction = SEO_TYPE_INSTRUCTIONS[seoType] ?? "";

  const prompts: Record<string, string> = {
    regenerate: `Rewrite the section "${headingText}" completely. Keep the same key information but make it feel fresh and more engaging. Do not include the heading itself — write only the section body.${seoInstruction ? `\n\n${seoInstruction}` : ""}${targetKeyword ? `\n\nInclude the keyword "${targetKeyword}" naturally once.` : ""}`,

    shorter: `Rewrite this section in 40% fewer words. Keep all key points, cut padding and redundancy. Do not include the heading.

Current content:
${currentContent}`,

    longer: `Expand this section with more depth, examples, or data. Add at least 2 more paragraphs with substantive content. Do not include the heading.

Current content:
${currentContent}`,

    conversational: `Rewrite this section in a more conversational tone. Use shorter sentences. Use contractions. Sound like a knowledgeable person explaining this, not a document. Do not include the heading.

Current content:
${currentContent}`,

    authoritative: `Rewrite this section in a more authoritative, expert tone. Back claims with specifics. Use confident, direct language. Do not include the heading.

Current content:
${currentContent}`,

    simpler: `Rewrite this section in simpler language. Target a reader with no technical background. Explain jargon. Use analogies where helpful. Do not include the heading.

Current content:
${currentContent}`,

    add_example: `Add a concrete example, case study angle, or real-world scenario at the end of this section. The example should make the main point tangible. Do not include the heading. Append to:

${currentContent}`,
  };

  return prompts[action] ?? prompts.regenerate;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400 });
  }

  const { articleId, headingText, currentContent, action, context } = parsed.data;

  // Fetch tone profile for this article's content type
  let toneInstruction = "";
  try {
    const article = await db.article.findUnique({ where: { id: articleId }, select: { status: true } });
    if (article) {
      const tone = await db.toneProfile.findFirst({ orderBy: { updatedAt: "desc" } });
      if (tone?.profile) toneInstruction = `Write in this established tone:\n${tone.profile}\n\n`;
    }
  } catch { /* ignore */ }

  const userPrompt = buildPrompt(headingText, currentContent, action, context.seoType, context.targetKeyword);

  const systemPrompt = `You are an expert SEO content writer for 10Pearls. Rewrite sections of existing articles with precision. ${toneInstruction}Output only the section content in markdown — no heading, no preamble, no explanation.`;

  let lastError: unknown;
  for (const model of MODELS) {
    try {
      const stream = await openai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stream: true,
        max_tokens: 1200,
      });

      const readable = new ReadableStream({
        async start(controller) {
          const enc = new TextEncoder();
          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) controller.enqueue(enc.encode(delta));
          }
          controller.close();
        },
      });

      return new Response(readable, {
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" },
      });
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 429 || status === 404 || status === 402) { lastError = err; continue; }
      throw err;
    }
  }

  return new Response(JSON.stringify({ error: String(lastError) }), { status: 503 });
}
