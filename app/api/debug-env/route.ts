export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const env = {
    hasDbUrl: !!process.env.DATABASE_URL,
    dbUrlPrefix: process.env.DATABASE_URL?.slice(0, 30) + "...",
    hasNextAuthSecret: !!process.env.NEXTAUTH_SECRET,
    nextAuthUrl: process.env.NEXTAUTH_URL,
  };

  try {
    await db.$runCommandRaw({ ping: 1 });
    return NextResponse.json({ ...env, db: "connected" });
  } catch (e) {
    return NextResponse.json({ ...env, db: "failed", error: String(e) });
  }
}
