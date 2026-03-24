import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fetchOwnDomainRankings, type RankingEntry } from "@/lib/ahrefs-utils";
import { db } from "@/lib/db";

const bodySchema = z.object({
  keyword: z.string().min(1),
  articleId: z.string().min(1),
});

function scoreRisk(matches: RankingEntry[]): "none" | "low" | "medium" | "high" {
  if (matches.length === 0) return "none";
  const top = Math.min(...matches.map((m) => m.position));
  if (top <= 10) return "high";
  if (top <= 20) return "medium";
  return "low";
}

function buildSummary(
  risk: "none" | "low" | "medium" | "high",
  ownRankings: RankingEntry[],
  draftCount: number
): string {
  if (risk === "none" && draftCount === 0) return "No existing content found for this keyword.";
  if (risk === "none" && draftCount > 0)
    return `${draftCount} internal ${draftCount === 1 ? "draft is" : "drafts are"} targeting a similar keyword.`;
  const top = ownRankings[0];
  if (risk === "high") return `You have a page ranking #${top.position} for this exact keyword at ${top.url}.`;
  if (risk === "medium") return `You have a page ranking #${top.position} for a related keyword at ${top.url}.`;
  return `An existing page ranks #${top.position} for a related keyword — it may be buried but could compete.`;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const { keyword, articleId } = parsed.data;

  try {
    const rankings = await fetchOwnDomainRankings();

    // Collect all matches
    const kw = keyword.toLowerCase().trim();
    const matches: RankingEntry[] = rankings.filter((r) => {
      const rKw = r.keyword.toLowerCase();
      return (
        rKw === kw ||
        (rKw.includes(kw) && kw.length > 3) ||
        (kw.includes(rKw) && rKw.length > 3)
      );
    }).sort((a, b) => a.position - b.position);

    const internalDrafts = await db.article.findMany({
      where: {
        targetKeyword: { contains: kw, mode: "insensitive" },
        id: { not: articleId },
      },
      select: { id: true, title: true, targetKeyword: true, status: true },
    });

    const risk = scoreRisk(matches);
    const safe = risk === "none" && internalDrafts.length === 0;

    return NextResponse.json({
      safe,
      risk,
      ownRankings: matches,
      internalDrafts,
      summary: buildSummary(risk, matches, internalDrafts.length),
    });
  } catch {
    return NextResponse.json({ error: "Cannibalization check failed" }, { status: 502 });
  }
}
