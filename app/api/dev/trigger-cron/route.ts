export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";

// Only available in development — triggers the cron manually
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  const url = new URL("/api/cron/rankings", req.url);
  url.searchParams.set("secret", process.env.CRON_SECRET ?? "");

  const res = await fetch(url.toString());
  const data = await res.json();
  return NextResponse.json(data);
}
