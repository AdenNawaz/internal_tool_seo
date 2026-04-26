export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
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
];

async function llm(prompt: string): Promise<string> {
  for (const model of MODELS) {
    try {
      const res = await openai.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 3000,
      });
      return res.choices[0]?.message?.content ?? "";
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 429 || status === 404 || status === 402) continue;
      throw err;
    }
  }
  return "";
}

interface PinnedKeyword { keyword: string; volume: number; difficulty: number }
interface PinnedHeader { text: string; level: number; source: string }
interface PinnedQuestion { question: string; source: string }
interface PinnedOpportunity { type: string; priority: string; title: string; description: string }
interface PinnedEvidence { type: string; text: string; context: string; source: string; sourceUrl: string; year: string | null }

export async function POST(req: NextRequest) {
  const { articleId } = await req.json() as { articleId: string };
  if (!articleId) return NextResponse.json({ error: "articleId required" }, { status: 400 });

  const article = await db.article.findUnique({ where: { id: articleId } });
  if (!article) return NextResponse.json({ error: "Article not found" }, { status: 404 });

  const pins = await db.pinnedItem.findMany({ where: { articleId } });

  const keywords: PinnedKeyword[] = [];
  const headers: PinnedHeader[] = [];
  const questions: PinnedQuestion[] = [];
  const opportunities: PinnedOpportunity[] = [];
  const evidence: PinnedEvidence[] = [];

  for (const pin of pins) {
    try {
      const meta = pin.metadata as Record<string, unknown> | null;
      if (pin.type === "keyword") {
        keywords.push({ keyword: pin.content, volume: Number(meta?.volume ?? 0), difficulty: Number(meta?.difficulty ?? 0) });
      } else if (pin.type === "header") {
        headers.push({ text: pin.content, level: Number(meta?.level ?? 2), source: String(meta?.source ?? "") });
      } else if (pin.type === "question") {
        questions.push({ question: pin.content, source: String(meta?.source ?? "") });
      } else if (pin.type === "opportunity") {
        opportunities.push({ type: String(meta?.type ?? ""), priority: String(meta?.priority ?? "medium"), title: pin.content, description: String(meta?.description ?? "") });
      } else if (pin.type === "evidence") {
        evidence.push({ type: String(meta?.type ?? "stat"), text: pin.content, context: String(meta?.context ?? ""), source: String(meta?.source ?? ""), sourceUrl: String(meta?.sourceUrl ?? ""), year: meta?.year ? String(meta.year) : null });
      }
    } catch { /* skip malformed pin */ }
  }

  const topic = article.targetKeyword ?? article.title ?? "content";
  const contentType = article.contentType ?? "blog post";
  const intentType = article.intentType ?? "research";
  const uniqueAngle = article.uniqueAngle ?? "";
  const wordCount = article.wordCountTarget ?? 1500;

  const prompt = `You are an expert SEO content strategist. Create a detailed article outline based on this research data.

ARTICLE TOPIC: ${topic}
CONTENT TYPE: ${contentType}
INTENT: ${intentType}
TARGET WORD COUNT: ${wordCount}
${uniqueAngle ? `UNIQUE ANGLE: ${uniqueAngle}` : ""}

PINNED KEYWORDS (primary + secondary to cover):
${keywords.map((k) => `- ${k.keyword} (vol: ${k.volume}, KD: ${k.difficulty})`).join("\n") || "None pinned"}

COMPETITOR SECTION HEADERS (topics competitors cover — include relevant ones):
${headers.map((h) => `- [H${h.level}] ${h.text} (from ${h.source})`).join("\n") || "None pinned"}

AUDIENCE QUESTIONS TO ANSWER:
${questions.map((q) => `- ${q.question}`).join("\n") || "None pinned"}

CONTENT OPPORTUNITIES:
${opportunities.map((o) => `- [${o.priority.toUpperCase()}] ${o.title}: ${o.description}`).join("\n") || "None pinned"}

EVIDENCE AND STATISTICS TO WEAVE IN:
${evidence.map((e) => `- [${e.type.toUpperCase()}] ${e.text} (${e.source}${e.year ? `, ${e.year}` : ""})`).join("\n") || "None pinned"}

Build a comprehensive outline that:
1. Covers the primary keyword naturally
2. Incorporates audience questions as H2/H3 sections where relevant
3. Weaves in the evidence/stats in appropriate sections
4. Addresses the content opportunities
5. Matches the target word count and content type

Return ONLY a JSON object with this exact structure (no markdown, no extra text):
{
  "title": "Article title",
  "metaDescription": "SEO meta description ~155 chars",
  "sections": [
    {
      "heading": "Section heading",
      "level": 2,
      "description": "What this section covers in 1-2 sentences",
      "wordTarget": 200,
      "keyPoints": ["key point 1", "key point 2"],
      "evidenceToUse": ["stat or quote to include if relevant, or empty array"]
    }
  ]
}`;

  let outline: unknown = null;
  try {
    const raw = await llm(prompt);
    const match = raw.match(/\{[\s\S]*\}/);
    outline = JSON.parse(match ? match[0] : raw);
  } catch {
    return NextResponse.json({ error: "Failed to generate outline" }, { status: 500 });
  }

  // Find or create ArticleBrief for this article
  const existingBrief = await db.articleBrief.findFirst({ where: { articleId }, orderBy: { createdAt: "desc" } });

  let brief;
  if (existingBrief) {
    brief = await db.articleBrief.update({
      where: { id: existingBrief.id },
      data: { outline: outline as object, editableOutline: outline as object, status: "ready" },
    });
  } else {
    brief = await db.articleBrief.create({
      data: {
        articleId,
        keyword: topic,
        competitors: [],
        competitorAvgWords: 0,
        outline: outline as object,
        editableOutline: outline as object,
        status: "ready",
      },
    });
  }

  return NextResponse.json({ briefId: brief.id });
}
