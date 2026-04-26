export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const { bot, url } = await req.json() as { bot: string; url: string };
  if (!bot || !url) return NextResponse.json({ error: "bot and url required" }, { status: 400 });

  const log = await db.crawlerLog.create({ data: { bot, url } });
  return NextResponse.json(log);
}

export async function GET() {
  const logs = await db.crawlerLog.findMany({ orderBy: { visitedAt: "desc" }, take: 100 });
  return NextResponse.json(logs);
}
