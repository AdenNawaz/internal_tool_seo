export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function PATCH(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  await db.trendingAlert.update({
    where: { id: params.id },
    data: { dismissed: true },
  });
  return NextResponse.json({ ok: true });
}
