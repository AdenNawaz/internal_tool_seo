import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { streamContent } from "@/lib/content-generator";
import { markdownToBlocks } from "@/lib/markdown-to-blocknote";
import type { OutlineItem } from "@/lib/outline-types";

const schema = z.object({
  articleId: z.string(),
  briefId: z.string(),
});

function sse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return new Response(sse("error", { message: "Invalid request" }), {
      status: 400,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  const { articleId, briefId } = parsed.data;

  const [article, brief] = await Promise.all([
    db.article.findUnique({ where: { id: articleId } }),
    db.articleBrief.findUnique({ where: { id: briefId } }),
  ]);

  if (!article || !brief) {
    return new Response(sse("error", { message: "Article or brief not found" }), {
      status: 404,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  const outline = (brief.editableOutline as unknown as OutlineItem[]) ?? [];
  const paaQuestions = (brief.paaQuestions as unknown as string[]) ?? [];

  let toneProfile =
    "Conversational, expert, confident. Short paragraphs. Direct language. No corporate jargon.";
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profile = await (db as any).toneProfile.findFirst({ where: { type: "blog" } });
    if (profile) {
      toneProfile = `${profile.profile}\n\nExample sentences:\n${(profile.examples as string[]).slice(0, 5).join("\n")}`;
    }
  } catch { /* tone profile table may not exist yet */ }

  const companyProfile =
    process.env.COMPANY_PROFILE ?? "10Pearls is an AI-powered global digital engineering company.";

  const avgWords = brief.competitorAvgWords ?? 1200;

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      let fullMarkdown = "";

      try {
        controller.enqueue(enc.encode(sse("status", { message: "Writing article…" })));

        for await (const chunk of streamContent({
          outline,
          targetKeyword: brief.keyword,
          contentType: "blog",
          toneProfile,
          companyProfile,
          brief: {
            searchIntent: "informational",
            wordCountRange: {
              min: Math.round(avgWords * 0.9),
              max: Math.round(avgWords * 1.2),
            },
            contentGaps: [],
            paaQuestions,
          },
        })) {
          fullMarkdown += chunk;
          controller.enqueue(enc.encode(sse("chunk", { text: chunk })));
        }

        const blocks = markdownToBlocks(fullMarkdown);

        await db.article.update({
          where: { id: articleId },
          data: { content: blocks as object[] },
        });

        controller.enqueue(enc.encode(sse("complete", { blocks })));
      } catch (err) {
        controller.enqueue(enc.encode(sse("error", { message: String(err) })));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
