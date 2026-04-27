export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cachedAhrefs } from "@/lib/ahrefs-cached";
import { parseMcpRows, parseMcpText, fetchOwnDomainRankings } from "@/lib/ahrefs-utils";

const schema = z.object({
  competitorDomain: z.string().min(1),
  country: z.string().optional().default("us"),
  limit: z.number().int().min(1).max(100).optional().default(30),
});

export interface GapKeyword {
  keyword: string;
  volume: number | null;
  competitorPosition: number | null;
  difficulty: number | null;
  trafficPotential: number | null;
  nearMatch: boolean;
}

function cleanDomain(input: string): string {
  return input
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .trim()
    .toLowerCase();
}

function checkNearMatch(keyword: string, ownSet: Set<string>): boolean {
  const words = keyword.toLowerCase().split(/\s+/);
  for (const own of Array.from(ownSet)) {
    const ownWords = own.split(/\s+/);
    const shared = words.filter((w) => w.length > 3 && ownWords.includes(w));
    if (words.length > 0 && shared.length / words.length > 0.6) return true;
  }
  return false;
}

async function enrichKeywords(
  gaps: GapKeyword[],
  country: string
): Promise<GapKeyword[]> {
  const toEnrich = gaps.slice(0, 10);
  const results = await Promise.allSettled(
    toEnrich.map(async (gap, i) => {
      await new Promise((r) => setTimeout(r, i * 400));
      try {
        const raw = await cachedAhrefs(
          "keywords-explorer-overview",
          { keyword: gap.keyword, country },
          86400 * 7
        );
        const data = parseMcpText(raw) as Record<string, unknown> | null;
        const kd =
          data?.difficulty != null
            ? Number(data.difficulty)
            : data?.kd != null
            ? Number(data.kd)
            : null;
        return { ...gap, difficulty: kd };
      } catch {
        return gap;
      }
    })
  );

  return gaps.map((gap, i) => {
    if (i >= 10) return gap;
    const r = results[i];
    return r.status === "fulfilled" ? r.value : gap;
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { limit, country } = parsed.data;
  const competitorDomain = cleanDomain(parsed.data.competitorDomain);
  const ownDomain = cleanDomain(process.env.OWN_DOMAIN ?? "");

  console.log("[GAP] Calling Ahrefs for competitor:", competitorDomain);
  console.log("[GAP] Own domain:", ownDomain);

  const [competitorResult, ownRankings] = await Promise.allSettled([
    cachedAhrefs(
      "site-explorer-organic-keywords",
      {
        target: competitorDomain,
        select: "keyword,volume,position,traffic",
        limit: 500,
        order_by: "volume:desc",
        country,
      },
      86400
    ),
    fetchOwnDomainRankings(),
  ]);

  // Log raw responses for diagnosis
  if (competitorResult.status === "fulfilled") {
    console.log(
      "[GAP] Raw competitor response:",
      JSON.stringify(competitorResult.value).slice(0, 500)
    );
  } else {
    console.error("[GAP] Competitor Ahrefs call failed:", competitorResult.reason);
  }

  if (ownRankings.status === "rejected") {
    console.error("[GAP] Own domain fetch failed:", ownRankings.reason);
  }

  // Parse competitor keywords
  let competitorRows: Record<string, unknown>[] = [];
  let competitorError: string | null = null;

  if (competitorResult.status === "fulfilled") {
    competitorRows = parseMcpRows(competitorResult.value);
    console.log("[GAP] Parsed competitor rows:", competitorRows.length);
    if (competitorRows.length === 0) {
      // Log raw to help diagnose
      const raw = competitorResult.value;
      console.error(
        "[GAP] Zero rows parsed. Raw shape:",
        typeof raw === "object" && raw !== null ? Object.keys(raw) : typeof raw
      );
      competitorError = `No keyword data returned for ${competitorDomain}`;
    }
  } else {
    competitorError = String(competitorResult.reason);
  }

  // Parse own keywords
  const ownRows =
    ownRankings.status === "fulfilled" ? ownRankings.value : [];
  const ownError =
    ownRankings.status === "rejected"
      ? String(ownRankings.reason)
      : ownRows.length === 0 && ownDomain
      ? `No rankings found for ${ownDomain} — check OWN_DOMAIN`
      : null;

  if (ownError) console.warn("[GAP] Own domain issue:", ownError);

  // Filter competitor rows: only top 10 positions
  const competitorKws = competitorRows
    .filter((row) => {
      const pos = row.position != null ? Number(row.position) : 999;
      return typeof row.keyword === "string" && pos <= 10;
    })
    .map((row) => ({
      keyword: String(row.keyword),
      competitorPosition: row.position != null ? Number(row.position) : null,
      volume: row.volume != null ? Number(row.volume) : null,
      trafficPotential: row.traffic != null ? Number(row.traffic) : null,
    }));

  console.log("[GAP] Competitor keywords in top 10:", competitorKws.length);

  // Build own keyword set (lowercased)
  const ownKwSet = new Set(
    ownRows
      .map((r) => r.keyword?.toLowerCase().trim())
      .filter(Boolean) as string[]
  );

  console.log("[GAP] Own domain keywords loaded:", ownKwSet.size);

  // Compute gaps
  const rawGaps: GapKeyword[] = competitorKws
    .filter((k) => !ownKwSet.has(k.keyword.toLowerCase().trim()))
    .map((k) => ({
      keyword: k.keyword,
      competitorPosition: k.competitorPosition,
      volume: k.volume,
      difficulty: null,
      trafficPotential: k.trafficPotential,
      nearMatch: checkNearMatch(k.keyword, ownKwSet),
    }))
    .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))
    .slice(0, limit);

  console.log("[GAP] Raw gaps found:", rawGaps.length);

  // Enrich top 10 with KD
  const enriched = rawGaps.length > 0 ? await enrichKeywords(rawGaps, country) : rawGaps;

  // Build diagnostic context for the UI
  const diagnostics = {
    competitorKeywordsTotal: competitorRows.length,
    competitorKeywordsTop10: competitorKws.length,
    ownKeywordsTotal: ownKwSet.size,
    competitorError,
    ownError,
  };

  return NextResponse.json({
    gaps: enriched,
    competitorDomain,
    diagnostics,
  });
}
