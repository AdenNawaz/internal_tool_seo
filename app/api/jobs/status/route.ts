export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAllQueueStats, getRecentFailures } from "@/lib/queue/job-monitor";

export async function GET() {
  try {
    const [stats, failures] = await Promise.all([
      getAllQueueStats(),
      getRecentFailures(20),
    ]);
    return NextResponse.json({ stats, failures });
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}
