import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { streamClusters } from "@/lib/cluster-builder";
import type { OwnDomainData } from "@/lib/competitor-analysis";

function sse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!process.env.OPENAI_API_KEY) {
    return new Response(sse("error", { message: "OPENAI_API_KEY not configured" }), {
      status: 500,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  const report = await db.researchReport.findUnique({ where: { id: params.id } });
  if (!report) {
    return new Response(sse("error", { message: "Report not found" }), {
      status: 404,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  const ownData = report.ownData as OwnDomainData | null;
  const summary = report.summary as { keywordGapOpportunities?: string[] } | null;

  const ownKeywords = ownData?.topKeywords.map((k) => k.keyword) ?? [];
  const gapKeywords = summary?.keywordGapOpportunities ?? [];

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: unknown) =>
        controller.enqueue(enc.encode(sse(event, data)));

      let fullJson = "";
      try {
        send("status", { message: "Building clusters with AI…" });

        for await (const chunk of streamClusters(report.keyword, gapKeywords, ownKeywords)) {
          fullJson += chunk;
          send("chunk", { text: chunk });
        }

        // OpenAI json_object wraps in an object, extract the array
        let clusters: unknown[];
        try {
          const parsed = JSON.parse(fullJson);
          clusters = Array.isArray(parsed) ? parsed : (parsed.clusters ?? []);
        } catch {
          clusters = [];
        }

        await db.researchReport.update({
          where: { id: params.id },
          data: { clusters: clusters as unknown as object[] },
        });

        send("done", { clusters });
      } catch (err) {
        send("error", { message: String(err) });
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
