import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { scrapePage } from "@/lib/scraper";
import OpenAI from "openai";

const schema = z.object({
  urls: z.array(z.string().url()).min(1).max(5),
  type: z.enum(["blog", "landing-page"]),
});

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

interface ToneResult {
  summary: string;
  characteristics: string[];
  avoid: string[];
  examples: string[];
  cta_style: string;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { urls, type } = parsed.data;

  // Scrape URLs sequentially via Jina (free)
  const pages: string[] = [];
  for (const url of urls) {
    const page = await scrapePage(url, url);
    if (page) pages.push(`URL: ${url}\n\n${page.markdown.slice(0, 3000)}`);
  }

  if (pages.length === 0) {
    return NextResponse.json({ error: "Could not scrape any of the provided URLs" }, { status: 422 });
  }

  const userPrompt = `Analyze the writing style of these pages and create a detailed tone profile a writer could use to match this style exactly.

PAGES:
${pages.join("\n\n---\n\n")}

Return a tone profile covering the overall tone, sentence structure, vocabulary, what to avoid, how technical topics are handled, paragraph length, and CTA style.

Return as JSON exactly matching this shape:
{
  "summary": "One paragraph description of the overall tone",
  "characteristics": ["characteristic 1", "characteristic 2", "characteristic 3"],
  "avoid": ["thing to avoid 1", "thing to avoid 2"],
  "examples": ["example sentence 1", "example sentence 2", "example sentence 3", "example sentence 4", "example sentence 5"],
  "cta_style": "How CTAs are typically phrased"
}`;

  let result: ToneResult | null = null;
  for (const model of MODELS) {
    try {
      const response = await openai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: "You are a writing style analyst. Return only valid JSON." },
          { role: "user", content: userPrompt },
        ],
      });

      const raw = response.choices[0]?.message?.content ?? "";
      const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]) as ToneResult;
        break;
      }
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 429 || status === 404) continue;
      throw err;
    }
  }

  if (!result) {
    return NextResponse.json({ error: "Failed to generate tone profile" }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toneDb = (db as any).toneProfile;
  const existing = await toneDb.findFirst({ where: { type } });
  const saved = existing
    ? await toneDb.update({
        where: { id: existing.id },
        data: { sourceUrls: urls, profile: result.summary, examples: result.examples },
      })
    : await toneDb.create({
        data: { type, sourceUrls: urls, profile: result.summary, examples: result.examples },
      });

  return NextResponse.json({ ok: true, profile: saved, result });
}
