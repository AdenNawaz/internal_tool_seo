export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const pins = await db.pinnedItem.findMany({
    where: { articleId: params.id },
    orderBy: { pinnedAt: "desc" },
  });
  return NextResponse.json(pins);
}
