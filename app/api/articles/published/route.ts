import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const articles = await db.article.findMany({
    where: { status: "published" },
    select: { id: true, title: true, targetKeyword: true, slug: true, publishedUrl: true },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(articles);
}
