export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cachedAhrefs } from "@/lib/ahrefs-cached";
import { parseMcpRows } from "@/lib/ahrefs-utils";

export async function GET(req: NextRequest) {
  // Vercel sends Authorization: Bearer <CRON_SECRET>; also accept x-cron-secret for manual calls
  const authHeader = req.headers.get("authorization");
  const bearerSecret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const headerSecret = req.headers.get("x-cron-secret");
  const secret = bearerSecret ?? headerSecret;
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const articles = await db.article.findMany({
    where: {
      status: { in: ["published", "ready"] },
      targetKeyword: { not: null },
    },
    select: { id: true, targetKeyword: true },
  });

  if (articles.length === 0) {
    return NextResponse.json({ checked: 0 });
  }

  const ownDomain = process.env.OWN_DOMAIN ?? "";
  let checked = 0;

  for (const article of articles) {
    const keyword = article.targetKeyword!;
    try {
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
        86400
      ).catch(() => null);

      const rows = result ? parseMcpRows(result) : [];
      const match = rows.find(
        (r) => typeof r.keyword === "string" && r.keyword.toLowerCase() === keyword.toLowerCase()
      );

      const position = match ? Number(match.position) : null;
      const volume = match ? (match.volume != null ? Number(match.volume) : null) : null;
      const url = match ? String(match.url ?? "") : null;

      await db.ranking.create({
        data: {
          articleId: article.id,
          keyword,
          position,
          url: url ?? undefined,
          volume: volume ?? undefined,
          refreshOpportunity: position != null && position > 10,
        },
      });

      checked++;
    } catch {
      // continue on individual failure
    }
  }

  return NextResponse.json({ checked, total: articles.length });
}
