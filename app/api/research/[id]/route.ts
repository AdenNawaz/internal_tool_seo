export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const report = await db.researchReport.findUnique({ where: { id: params.id } });
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(report);
}
