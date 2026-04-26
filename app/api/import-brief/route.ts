export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
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
        max_tokens: 2000,
      });
      return res.choices[0]?.message?.content ?? "";
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 429 || status === 404 || status === 402) continue;
      throw err;
    }
  }
  throw new Error("All models failed");
}

async function fetchUrl(url: string): Promise<string> {
  const jinaUrl = `https://r.jina.ai/${url}`;
  const res = await fetch(jinaUrl, { headers: { Accept: "text/plain" }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Jina fetch failed: ${res.status}`);
  return await res.text();
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";

  let text = "";
  let title = "Imported Brief";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const urlVal = form.get("url") as string | null;
    const pastedText = form.get("text") as string | null;
    const file = form.get("file") as File | null;

    if (urlVal?.trim()) {
      title = urlVal.trim();
      text = await fetchUrl(urlVal.trim());
    } else if (file) {
      // Use pdf-parse if PDF, otherwise read as text
      const buf = Buffer.from(await file.arrayBuffer());
      if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const pdfParse = require("pdf-parse");
          const parsed = await pdfParse(buf);
          text = parsed.text;
        } catch {
          return NextResponse.json({ error: "PDF parsing failed — try pasting the text instead." }, { status: 400 });
        }
      } else {
        text = buf.toString("utf-8");
      }
      title = file.name.replace(/\.[^.]+$/, "");
    } else if (pastedText?.trim()) {
      text = pastedText.trim();
    }
  } else {
    const body = await req.json() as { text?: string; url?: string };
    if (body.url?.trim()) {
      title = body.url.trim();
      text = await fetchUrl(body.url.trim());
    } else if (body.text?.trim()) {
      text = body.text.trim();
    }
  }

  if (!text.trim()) {
    return NextResponse.json({ error: "No content provided." }, { status: 400 });
  }

  const trimmed = text.slice(0, 8000);

  const prompt = `Extract the outline structure from this brief or document.
Return a JSON array of heading objects. Infer hierarchy from the formatting.

Rules:
- level 2 = major sections (H2)
- level 3 = sub-sections (H3)
- type: "seo" for topic headings, "aeo" for question headings, "general" for intro/conclusion

Content:
"""
${trimmed}
"""

Return JSON array only:
[{"id":"h1","level":2,"text":"Introduction","type":"general"},...]`;

  const raw = await llm(prompt);
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return NextResponse.json({ error: "Could not parse outline from content." }, { status: 422 });

  const outline = JSON.parse(match[0]) as Array<{ id: string; level: number; text: string; type: string }>;

  return NextResponse.json({ outline, title });
}
