export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { analyzeCompetitors } from "@/lib/competitor-analysis";
import { fetchSerpResults } from "@/lib/serp";

const schema = z.object({
  keyword: z.string().min(1),
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

  const { keyword } = parsed.data;
  const ownDomain = process.env.OWN_DOMAIN ?? "";

  const report = await db.researchReport.create({
    data: { keyword, status: "running" },
  });

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: unknown) =>
        controller.enqueue(enc.encode(sse(event, data)));

      try {
        send("status", { message: "Fetching SERP results…", reportId: report.id });

        const serpResults = await fetchSerpResults(keyword).catch(() => []);
        send("status", { message: `Found ${serpResults.length} SERP results` });

        send("status", { message: "Analysing competitor landscape…" });
        const analysis = await analyzeCompetitors(keyword, ownDomain);

        await db.researchReport.update({
          where: { id: report.id },
          data: {
            competitors: analysis.topCompetitors as unknown as object[],
            ownData: analysis.ownDomain as unknown as object,
            summary: {
              serpResults: serpResults.slice(0, 10),
              keywordGapOpportunities: analysis.keywordGapOpportunities,
            } as unknown as object,
          },
        });

        send("status", { message: "Fetching competitor authority…" });

        // Fetch authority for competitor domains
        const domains = analysis.topCompetitors.map((c) => c.domain).slice(0, 8);
        if (domains.length > 0) {
          try {
            const authorityRes = await fetch(
              new URL("/api/competitors/authority", req.url).toString(),
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ domains }),
              }
            );
            if (authorityRes.ok) {
              const authorityData = await authorityRes.json();
              await db.researchReport.update({
                where: { id: report.id },
                data: { competitorAuthority: authorityData as unknown as object[] },
              });
            }
          } catch {
            // non-fatal
          }
        }

        await db.researchReport.update({
          where: { id: report.id },
          data: { status: "complete" },
        });

        send("done", { reportId: report.id });
      } catch (err) {
        await db.researchReport
          .update({ where: { id: report.id }, data: { status: "error" } })
          .catch(() => {});
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
