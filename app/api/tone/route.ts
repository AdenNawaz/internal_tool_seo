import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profiles = await (db as any).toneProfile.findMany({
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(profiles);
  } catch {
    return NextResponse.json([]);
  }
}
