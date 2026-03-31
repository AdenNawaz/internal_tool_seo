import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: { articleId: string } }
) {
  const rankings = await db.ranking.findMany({
    where: { articleId: params.articleId },
    orderBy: { checkedAt: "desc" },
    take: 30,
  });

  return NextResponse.json(rankings);
}
