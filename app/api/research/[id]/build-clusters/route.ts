export const dynamic = "force-dynamic";
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
  if (!process.env.OPENROUTER_API_KEY) {
    return new Response(sse("error", { message: "OPENROUTER_API_KEY not configured" }), {
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

        // Extract JSON array — Llama may wrap it in markdown code fences or an object key
        let clusters: unknown[];
        try {
          // Strip markdown code fences if present
          const cleaned = fullJson
            .replace(/```json\s*/gi, "")
            .replace(/```\s*/gi, "")
            .trim();
          const parsed = JSON.parse(cleaned);
          if (Array.isArray(parsed)) {
            clusters = parsed;
          } else if (parsed && typeof parsed === "object") {
            // Try common wrapper keys
            const val = parsed.clusters ?? parsed.data ?? parsed.result ?? Object.values(parsed)[0];
            clusters = Array.isArray(val) ? val : [];
          } else {
            clusters = [];
          }
        } catch {
          // Last resort: find a JSON array anywhere in the response
          const match = fullJson.match(/\[[\s\S]*\]/);
          if (match) {
            try { clusters = JSON.parse(match[0]); } catch { clusters = []; }
          } else {
            clusters = [];
          }
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
