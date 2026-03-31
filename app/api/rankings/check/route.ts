import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { cachedAhrefs } from "@/lib/ahrefs-cached";
import { parseMcpRows } from "@/lib/ahrefs-utils";

const schema = z.object({
  articleId: z.string(),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const article = await db.article.findUnique({ where: { id: parsed.data.articleId } });
  if (!article) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  const keyword = article.targetKeyword;
  if (!keyword) {
    return NextResponse.json({ error: "Article has no target keyword" }, { status: 400 });
  }

  const ownDomain = process.env.OWN_DOMAIN ?? "";

  const result = await cachedAhrefs(
    "site-explorer-organic-keywords",
    {
      target: ownDomain,
      select: "keyword,volume,position,url",
      limit: 100,
      order_by: "volume:desc",
      country: "us",
      where: { keyword: { eq: keyword } },
    },
    86400 // 1-day TTL for rankings
  ).catch(() => null);

  const rows = result ? parseMcpRows(result) : [];
  const match = rows.find(
    (r) => typeof r.keyword === "string" && r.keyword.toLowerCase() === keyword.toLowerCase()
  );

  const position = match ? Number(match.position) : null;
  const volume = match ? (match.volume != null ? Number(match.volume) : null) : null;
  const url = match ? String(match.url ?? "") : null;

  const ranking = await db.ranking.create({
    data: {
      articleId: article.id,
      keyword,
      position,
      url: url ?? undefined,
      volume: volume ?? undefined,
      refreshOpportunity: position != null && position > 10,
    },
  });

  return NextResponse.json(ranking);
}
