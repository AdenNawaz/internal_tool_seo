export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { scrapePage } from "@/lib/scraper";
import type { ScrapedPage } from "@/lib/scraper";
import OpenAI from "openai";

const schema = z.object({
  articleId: z.string(),
  existingUrl: z.string().url(),
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

export interface RevampAnalysis {
  strengths: string[];
  missing: string[];
  thin: string[];
  newHeadings: { text: string; type: "seo" | "geo" | "aeo"; reason: string }[];
  remove: string[];
  recommendedOrder: string[];
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { articleId, existingUrl } = parsed.data;

  const [article, brief] = await Promise.all([
    db.article.findUnique({ where: { id: articleId } }),
    db.articleBrief.findFirst({ where: { articleId }, orderBy: { createdAt: "desc" } }),
  ]);

  if (!article) return NextResponse.json({ error: "Article not found" }, { status: 404 });
  if (!brief || brief.status !== "ready") {
    return NextResponse.json({ error: "Generate a brief first" }, { status: 400 });
  }

  const existingPage = await scrapePage(existingUrl, existingUrl);
  if (!existingPage) {
    return NextResponse.json({ error: "Could not scrape the existing page URL" }, { status: 422 });
  }

  const competitors = (brief.competitors as unknown as ScrapedPage[]).slice(0, 3);
  const competitorSummary = competitors
    .map((c, i) => `Competitor ${i + 1}: "${c.title}" — Headings: ${c.headings.join(" | ")}`)
    .join("\n");

  const userPrompt = `EXISTING PAGE URL: ${existingUrl}
EXISTING PAGE CONTENT:
${existingPage.markdown.slice(0, 4000)}

COMPETITOR PAGES (top-ranking for keyword "${article.targetKeyword ?? ""}"):
${competitorSummary}

KEYWORD: ${article.targetKeyword ?? ""}

Analyze the existing page against competitors and return JSON exactly:
{
  "strengths": ["what the existing page covers well"],
  "missing": ["topics missing entirely vs competitors"],
  "thin": ["sections that exist but need expanding"],
  "newHeadings": [
    { "text": "heading text", "type": "seo|geo|aeo", "reason": "why add this" }
  ],
  "remove": ["sections to remove or consolidate"],
  "recommendedOrder": ["heading 1", "heading 2"]
}`;

  let analysis: RevampAnalysis | null = null;
  for (const model of MODELS) {
    try {
      const res = await openai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: "You are an SEO content auditor. Return only valid JSON." },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 1200,
      });

      const raw = res.choices[0]?.message?.content ?? "";
      const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        analysis = JSON.parse(match[0]) as RevampAnalysis;
        break;
      }
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 429 || status === 404) continue;
      throw err;
    }
  }

  if (!analysis) {
    return NextResponse.json({ error: "Failed to generate revamp analysis" }, { status: 500 });
  }

  await db.articleBrief.update({
    where: { id: brief.id },
    data: { revampAnalysis: analysis as object },
  });

  return NextResponse.json({ ok: true, analysis, briefId: brief.id });
}
