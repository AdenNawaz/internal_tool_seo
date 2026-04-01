import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchShareOfVoice } from "@/lib/sov";

export async function POST() {
  // 1. Tracked keywords from published articles
  const articles = await db.article.findMany({
    where: { status: { in: ["published", "ready"] }, targetKeyword: { not: null } },
    select: { targetKeyword: true },
  });
  const trackedKeywords = Array.from(new Set(articles.map((a) => a.targetKeyword!).filter(Boolean)));

  // 2. Competitor domains from most recent ResearchReport
  const latestReport = await db.researchReport.findFirst({
    where: { status: { in: ["complete", "clustered"] } },
    orderBy: { createdAt: "desc" },
    select: { competitors: true },
  });

  if (!latestReport) {
    return NextResponse.json(
      { error: "Run a research report first to identify competitors." },
      { status: 422 }
    );
  }

  let competitorDomains: string[] = [];
  try {
    const raw = latestReport.competitors as { domain?: string }[] | null;
    if (Array.isArray(raw)) {
      competitorDomains = raw.map((c) => c.domain).filter((d): d is string => !!d);
    }
  } catch { /* no-op */ }

  const result = await fetchShareOfVoice({
    trackedKeywords,
    competitorDomains,
    country: "us",
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  const snapshot = await db.sovSnapshot.create({
    data: {
      companySOV: result.companySOV,
      competitors: result.competitors,
      keywordCount: result.keywordCount,
    },
  });

  return NextResponse.json(snapshot);
}
