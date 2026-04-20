export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { fetchSerpResults, fetchPaaQuestions } from "@/lib/serp";
import { scrapeCompetitors } from "@/lib/scraper";

const schema = z.object({
  articleId: z.string(),
  keyword: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { articleId, keyword } = parsed.data;

  // Create a brief record in fetching state
  const brief = await db.articleBrief.create({
    data: {
      articleId,
      keyword,
      competitors: [],
      competitorAvgWords: 0,
      status: "fetching",
    },
  });

  // Run in background — respond with brief id immediately
  (async () => {
    try {
      const [serpResults, paaQuestions] = await Promise.all([
        fetchSerpResults(keyword),
        fetchPaaQuestions(keyword),
      ]);

      const competitors = await scrapeCompetitors(serpResults);
      const competitorAvgWords =
        competitors.length > 0
          ? Math.round(
              competitors.reduce((sum, c) => sum + c.wordCount, 0) / competitors.length
            )
          : 0;

      await db.articleBrief.update({
        where: { id: brief.id },
        data: {
          competitors: competitors as unknown as object[],
          competitorAvgWords,
          paaQuestions: paaQuestions as unknown as object[],
          status: "ready",
        },
      });
    } catch (err) {
      await db.articleBrief.update({
        where: { id: brief.id },
        data: { status: "error" },
      }).catch(() => {});
      console.error("Brief fetch error:", err);
    }
  })();

  return NextResponse.json({ briefId: brief.id, status: "fetching" });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const briefId = searchParams.get("briefId");
  const articleId = searchParams.get("articleId");

  if (briefId) {
    const brief = await db.articleBrief.findUnique({ where: { id: briefId } });
    if (!brief) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(brief);
  }

  if (articleId) {
    const brief = await db.articleBrief.findFirst({
      where: { articleId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(brief ?? null);
  }

  return NextResponse.json({ error: "Missing briefId or articleId" }, { status: 400 });
}
