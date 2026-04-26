export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const prompts = await db.trackedPrompt.findMany({ orderBy: { createdAt: "desc" } });
  const snapshots = await db.visibilitySnapshot.findMany({ orderBy: { checkedAt: "desc" }, take: 200 });

  // Group snapshots by prompt
  const byPrompt = new Map<string, typeof snapshots>();
  for (const s of snapshots) {
    const arr = byPrompt.get(s.prompt) ?? [];
    arr.push(s);
    byPrompt.set(s.prompt, arr);
  }

  const enriched = prompts.map((p) => {
    const snaps = byPrompt.get(p.prompt) ?? [];
    const platforms = Array.from(new Set(snaps.map((s) => s.platform)));
    const visibleCount = snaps.filter((s) => s.companyVisible).length;
    const citedCount = snaps.filter((s) => s.companyCited).length;
    return { ...p, snapshotCount: snaps.length, platforms, visibleCount, citedCount, lastChecked: snaps[0]?.checkedAt ?? null };
  });

  return NextResponse.json(enriched);
}

export async function POST(req: NextRequest) {
  const { prompt, category } = await req.json() as { prompt: string; category?: string };
  if (!prompt?.trim()) return NextResponse.json({ error: "prompt required" }, { status: 400 });

  const existing = await db.trackedPrompt.findFirst({ where: { prompt: prompt.trim() } });
  if (existing) return NextResponse.json(existing);

  const created = await db.trackedPrompt.create({ data: { prompt: prompt.trim(), category } });
  return NextResponse.json(created);
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json() as { id: string };
  await db.trackedPrompt.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
