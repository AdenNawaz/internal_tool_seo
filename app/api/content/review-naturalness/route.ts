export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";
import { extractPlainText } from "@/lib/text-analysis";

const schema = z.object({
  articleId: z.string(),
  content: z.unknown(),
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
];

export interface NaturalnessFlag {
  originalText: string;
  issue: string;
  suggestion: string;
  severity: "high" | "medium" | "low";
}

export interface NaturalnessResult {
  overallScore: number;
  flags: NaturalnessFlag[];
  topIssues: string[];
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { content } = parsed.data;

  // Extract plain text from BlockNote JSON
  const plainText = Array.isArray(content)
    ? extractPlainText(content as unknown[])
    : typeof content === "string"
    ? content
    : "";

  if (plainText.trim().length < 50) {
    return NextResponse.json({ error: "Content too short to review" }, { status: 400 });
  }

  // Truncate to ~6000 chars to stay within token limits
  const truncated = plainText.slice(0, 6000);

  const systemPrompt = `You are an expert editor specializing in making AI-generated content sound genuinely human-written. You are not trying to fool detection tools — you are trying to make the writing better.`;

  const userPrompt = `Review this content and identify sentences or paragraphs that sound robotic, formulaic, or AI-generated.

Common AI writing patterns to flag:
- Starting paragraphs with "In today's..." or "It is important..." or "It is worth noting"
- Lists of exactly 3 items where a human would write prose
- Overly balanced "on one hand... on the other hand" structures
- Adjective stacking ("comprehensive, robust, scalable solution")
- Topic sentences that restate the heading word-for-word
- Transitions that are too tidy ("Furthermore", "Moreover", "In addition")
- Conclusions that summarize what was just said
- Sentences that are all roughly the same length with no rhythm variation
- Passive voice overuse
- Generic openings that could apply to any article

CONTENT:
${truncated}

Return JSON only (no markdown, no explanation):
{
  "overallScore": 72,
  "flags": [
    {
      "originalText": "exact sentence or phrase from the content",
      "issue": "what sounds AI-written about it",
      "suggestion": "a more natural alternative",
      "severity": "high"
    }
  ],
  "topIssues": ["most common pattern 1", "pattern 2", "pattern 3"]
}

Score guide: 90-100 = reads naturally, 70-89 = minor issues, 50-69 = needs work, below 50 = heavy editing needed.
Flag 5-15 issues. Be specific about the exact text.`;

  let lastError: unknown;
  for (const model of MODELS) {
    try {
      const res = await openai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 2000,
      });

      const raw = res.choices[0]?.message?.content ?? "";
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) {
        return NextResponse.json({ error: "Could not parse review" }, { status: 500 });
      }

      const result = JSON.parse(match[0]) as NaturalnessResult;
      return NextResponse.json(result);
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 429 || status === 404 || status === 402) { lastError = err; continue; }
      throw err;
    }
  }

  return NextResponse.json({ error: String(lastError) }, { status: 503 });
}
