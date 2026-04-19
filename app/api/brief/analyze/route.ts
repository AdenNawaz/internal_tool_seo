import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { streamBriefOutline } from "@/lib/brief-builder";
import { findGptQueries } from "@/lib/gpt-queries";
import { generateGeoAeoQuestions } from "@/lib/geo-aeo";
import type { ScrapedPage } from "@/lib/scraper";

const schema = z.object({
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

  const brief = await db.articleBrief.findUnique({ where: { id: parsed.data.briefId } });
  if (!brief) {
    return new Response(sse("error", { message: "Brief not found" }), {
      status: 404,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return new Response(sse("error", { message: "OPENROUTER_API_KEY not configured" }), {
      status: 500,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  const competitors = (brief.competitors as unknown as ScrapedPage[]) ?? [];
  const paaQuestions = (brief.paaQuestions as unknown as string[]) ?? [];

  // Start parallel enrichment before streaming (non-blocking)
  const gptQueriesPromise = findGptQueries(brief.keyword, paaQuestions);
  const geoAeoPromise = generateGeoAeoQuestions({
    keyword: brief.keyword,
    contentType: "blog",
    paaQuestions,
    briefSummary: "",
  });

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      let fullJson = "";

      try {
        for await (const chunk of streamBriefOutline(brief.keyword, competitors, paaQuestions)) {
          fullJson += chunk;
          controller.enqueue(enc.encode(sse("chunk", { text: chunk })));
        }

        const cleaned = fullJson.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        const outline = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);

        // Await enrichment
        const [gptResult, geoAeoResult] = await Promise.allSettled([gptQueriesPromise, geoAeoPromise]);
        const gptQueries = gptResult.status === "fulfilled" ? gptResult.value.combined : [];
        const geoQuestions = geoAeoResult.status === "fulfilled" ? geoAeoResult.value.geoQuestions : [];
        const aeoQuestions = geoAeoResult.status === "fulfilled" ? geoAeoResult.value.aeoQuestions : [];

        await db.articleBrief.update({
          where: { id: brief.id },
          data: {
            outline: outline as object,
            gptQueries: gptQueries as object[],
            geoQuestions: geoQuestions as object[],
            aeoQuestions: aeoQuestions as object[],
          },
        });

        controller.enqueue(enc.encode(sse("done", { outline, gptQueries, geoQuestions, aeoQuestions })));
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
