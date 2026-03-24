import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cachedAhrefs } from "@/lib/ahrefs-cached";

const bodySchema = z.object({
  keyword: z.string().min(1),
  country: z.string().optional(),
});

function parseMcpText(result: unknown): unknown {
  if (
    result &&
    typeof result === "object" &&
    "content" in result &&
    Array.isArray((result as { content: unknown[] }).content)
  ) {
    const first = (result as { content: { type: string; text: string }[] })
      .content[0];
    if (first?.type === "text") {
      try {
        return JSON.parse(first.text);
      } catch {
        return first.text;
      }
    }
  }
  return result;
}

function extractOverview(raw: unknown) {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  // Ahrefs returns the data nested under a key that varies — handle both
  const data =
    (r.keywords as Record<string, unknown>[])?.[0] ??
    (r as Record<string, unknown>);
  return {
    volume: (data.volume as number) ?? null,
    difficulty: (data.difficulty as number) ?? null,
    cpc: (data.cpc as number) ?? null,
    traffic_potential: (data.traffic_potential as number) ?? null,
    serp_features: (data.serp_features as string[]) ?? [],
  };
}

function extractRelatedTerms(raw: unknown) {
  if (!raw || typeof raw !== "object") return [];
  const r = raw as Record<string, unknown>;
  const terms =
    (r.keywords as Record<string, unknown>[]) ??
    (r.terms as Record<string, unknown>[]) ??
    [];
  return terms.slice(0, 10).map((t) => ({
    keyword: t.keyword as string,
    volume: (t.volume as number) ?? null,
    difficulty: (t.difficulty as number) ?? null,
    traffic_potential: (t.traffic_potential as number) ?? null,
  }));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const { keyword, country = "us" } = parsed.data;

  try {
    const [overviewRaw, relatedRaw] = await Promise.all([
      cachedAhrefs("keywords-explorer-overview", { keyword, country }),
      cachedAhrefs("keywords-explorer-matching-terms", {
        keywords: keyword,
        country,
        limit: 10,
        order_by: "volume:desc",
        select: "keyword,volume,difficulty,traffic_potential",
      }),
    ]);

    const overview = extractOverview(parseMcpText(overviewRaw));
    const relatedTerms = extractRelatedTerms(parseMcpText(relatedRaw));

    return NextResponse.json({ keyword, overview, relatedTerms });
  } catch {
    return NextResponse.json(
      { error: "Ahrefs lookup failed" },
      { status: 502 }
    );
  }
}
