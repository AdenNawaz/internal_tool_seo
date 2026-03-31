import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cachedAhrefs } from "@/lib/ahrefs-cached";
import { parseMcpRows, fetchOwnDomainRankings } from "@/lib/ahrefs-utils";

const schema = z.object({
  competitorDomain: z.string().min(1),
  limit: z.number().int().min(1).max(100).optional().default(30),
});

export interface GapKeyword {
  keyword: string;
  volume: number | null;
  position: number | null;
  difficulty: number | null;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { competitorDomain, limit } = parsed.data;

  const [competitorResult, ownRankings] = await Promise.allSettled([
    cachedAhrefs("site-explorer-organic-keywords", {
      target: competitorDomain,
      select: "keyword,volume,position,difficulty",
      limit: 200,
      order_by: "volume:desc",
      country: "us",
    }),
    fetchOwnDomainRankings(),
  ]);

  const competitorKeywords: GapKeyword[] = [];
  if (competitorResult.status === "fulfilled") {
    const rows = parseMcpRows(competitorResult.value);
    for (const row of rows) {
      const r = row as Record<string, unknown>;
      if (typeof r.keyword === "string") {
        competitorKeywords.push({
          keyword: r.keyword,
          volume: r.volume != null ? Number(r.volume) : null,
          position: r.position != null ? Number(r.position) : null,
          difficulty: r.difficulty != null ? Number(r.difficulty) : null,
        });
      }
    }
  }

  const ownSet = new Set(
    (ownRankings.status === "fulfilled" ? ownRankings.value : []).map((r) =>
      r.keyword.toLowerCase()
    )
  );

  const gaps = competitorKeywords
    .filter((k) => !ownSet.has(k.keyword.toLowerCase()))
    .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))
    .slice(0, limit);

  return NextResponse.json({ gaps, competitorDomain });
}
