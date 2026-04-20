export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { z } from "zod";
import OpenAI from "openai";

const schema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    })
  ),
  articleId: z.string().optional(),
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
];

const SYSTEM_PROMPT = `You are an SEO research assistant for 10Pearls, an AI-powered digital engineering company. Your job is to help content writers plan and research articles and landing pages.

When a writer gives you a topic, follow this conversational flow — ask ONE question at a time:
1. Ask whether this is a new piece or a revamp of an existing page
2. Ask whether it is a blog post or a landing page
3. Ask what keyword or topic to target (if they haven't said)
4. Confirm you have what you need, then trigger the pipeline

You have access to tools. Use them by including an action block in your response:

<action>{"type":"start_research","keyword":"...","contentType":"blog|landing-page"}</action>
<action>{"type":"start_article","keyword":"...","contentType":"blog|landing-page"}</action>
<action>{"type":"set_revamp_url","url":"..."}</action>

Rules:
- Be conversational and concise. One question at a time.
- Do not ask all questions at once.
- When you have enough info, trigger the action immediately without further questions.
- After triggering start_research, tell the writer what will happen next.
- Never make up URLs or data.`;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400 });
  }

  const { messages } = parsed.data;

  let stream: Awaited<ReturnType<typeof openai.chat.completions.create>> | null = null;
  let lastError: unknown;

  for (const model of MODELS) {
    try {
      stream = await openai.chat.completions.create({
        model,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
        stream: true,
        max_tokens: 600,
      });
      break;
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 429 || status === 404 || status === 402) { lastError = err; continue; }
      throw err;
    }
  }

  if (!stream) {
    return new Response(JSON.stringify({ error: String(lastError) }), { status: 503 });
  }

  const readable = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      for await (const chunk of stream!) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) controller.enqueue(enc.encode(delta));
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" },
  });
}
