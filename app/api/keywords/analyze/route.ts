import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cachedAhrefs } from "@/lib/ahrefs-cached";
import { fetchOwnDomainRankings, parseMcpText, matchRisk } from "@/lib/ahrefs-utils";

const bodySchema = z.object({
  words: z.array(z.string().min(1)).min(1).max(40),
});

export interface WordResult {
  word: string;
  volume: number | null;
  difficulty: number | null;
  cpc: number | null;
  risk: "none" | "low" | "medium" | "high";
  color: "green" | "amber" | "red";
  rankingUrl: string | null;
  rankingPosition: number | null;
}

function extractOverview(raw: unknown): {
  volume: number | null;
  difficulty: number | null;
  cpc: number | null;
} {
  if (!raw || typeof raw !== "object") return { volume: null, difficulty: null, cpc: null };
  const r = raw as Record<string, unknown>;
  const data = (r.keywords as Record<string, unknown>[])?.[0] ?? r;
  return {
    volume: data.volume != null ? Number(data.volume) : null,
    difficulty: data.difficulty != null ? Number(data.difficulty) : null,
    cpc: data.cpc != null ? Number(data.cpc) : null,
  };
}

function toColor(
  risk: "none" | "low" | "medium" | "high",
  volume: number | null
): "green" | "amber" | "red" {
  if (risk === "high") return "red";
  if (risk === "medium" || risk === "low") return "amber";
  if (volume !== null && volume < 100) return "amber";
  return "green";
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { words } = parsed.data;

  try {
    // Own-domain rankings — cached 24hr, shared with cannibalization route
    const ownRankings = await fetchOwnDomainRankings();

    // All keyword overviews in parallel — each individually cached
    const overviews = await Promise.all(
      words.map((word) =>
        cachedAhrefs("keywords-explorer-overview", { keyword: word, country: "us" })
          .then((raw) => ({ word, data: parseMcpText(raw) }))
          .catch(() => ({ word, data: null }))
      )
    );

    const results: WordResult[] = overviews.map(({ word, data }) => {
      const { volume, difficulty, cpc } = extractOverview(data);
      const { risk, match } = matchRisk(word, ownRankings);
      return {
        word,
        volume,
        difficulty,
        cpc,
        risk,
        color: toColor(risk, volume),
        rankingUrl: match?.url ?? null,
        rankingPosition: match?.position ?? null,
      };
    });

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ error: "Analysis failed" }, { status: 502 });
  }
}
