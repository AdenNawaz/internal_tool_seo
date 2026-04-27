export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: { "HTTP-Referer": "https://seo-tool.internal" },
});

const MODELS = ["anthropic/claude-sonnet-4-5", "meta-llama/llama-3.3-70b-instruct:free"];

export async function POST(req: NextRequest) {
  const { keyword, title, excerpt } = await req.json() as {
    keyword?: string;
    title?: string;
    excerpt?: string;
  };

  const prompt = `Write a meta description for this article in 130–155 characters.
${keyword ? `Include the keyword: "${keyword}".` : ""}
Conversational tone. No marketing fluff. No starting with "Discover" or "Learn".
Article title: ${title ?? "Untitled"}
${excerpt ? `First paragraph: ${excerpt.slice(0, 200)}` : ""}
Return ONLY the meta description, no quotes, no extra text.`;

  for (const model of MODELS) {
    try {
      const res = await openai.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 200,
      });
      const text = (res.choices[0]?.message?.content ?? "").trim().replace(/^["']|["']$/g, "");
      return NextResponse.json({ meta: text });
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 429 || status === 404 || status === 402) continue;
      throw err;
    }
  }
  return NextResponse.json({ error: "Generation failed" }, { status: 500 });
}
