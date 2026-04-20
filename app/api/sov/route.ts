export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const snapshots = await db.sovSnapshot.findMany({
    orderBy: { checkedAt: "desc" },
    take: 12,
  });
  return NextResponse.json(snapshots.reverse());
}
