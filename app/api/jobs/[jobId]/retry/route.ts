export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { retryJob } from "@/lib/queue/job-monitor";

export async function POST(
  _req: Request,
  { params }: { params: { jobId: string } }
) {
  const { searchParams } = new URL(_req.url);
  const queueName = searchParams.get("queue");
  if (!queueName) {
    return NextResponse.json({ error: "queue param required" }, { status: 400 });
  }

  try {
    await retryJob(queueName, params.jobId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
