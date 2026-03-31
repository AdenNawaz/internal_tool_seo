import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cachedAhrefs } from "@/lib/ahrefs-cached";
import { parseMcpRows } from "@/lib/ahrefs-utils";

const schema = z.object({
  domains: z.array(z.string().min(1)).min(1).max(10),
});

export interface AuthorityEntry {
  domain: string;
  dr: number | null;
  backlinks: number | null;
  referringDomains: number | null;
  drTrend: "rising" | "falling" | "stable" | null;
  drHistory: { date: string; dr: number }[];
}

function computeTrend(history: { date: string; dr: number }[]): "rising" | "falling" | "stable" | null {
  if (history.length < 2) return null;
  const earliest = history[0].dr;
  const latest = history[history.length - 1].dr;
  if (latest - earliest > 3) return "rising";
  if (earliest - latest > 3) return "falling";
  return "stable";
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { domains } = parsed.data;

  const today = new Date();
  const sixMonthsAgo = new Date(today);
  sixMonthsAgo.setDate(sixMonthsAgo.getDate() - 180);
  const dateFrom = sixMonthsAgo.toISOString().split("T")[0];
  const dateTo = today.toISOString().split("T")[0];

  const results = await Promise.allSettled(
    domains.map(async (domain): Promise<AuthorityEntry> => {
      const [statsResult, historyResult] = await Promise.allSettled([
        cachedAhrefs("site-explorer-backlinks-stats", {
          target: domain,
          select: "domain_rating,backlinks,referring_domains",
        }),
        cachedAhrefs("site-explorer-domain-rating-history", {
          target: domain,
          date_from: dateFrom,
          date_to: dateTo,
        }),
      ]);

      let dr: number | null = null;
      let backlinks: number | null = null;
      let referringDomains: number | null = null;

      if (statsResult.status === "fulfilled") {
        const rows = parseMcpRows(statsResult.value);
        const row = rows[0] as Record<string, unknown> | undefined;
        if (row) {
          dr = row.domain_rating != null ? Number(row.domain_rating) : null;
          backlinks = row.backlinks != null ? Number(row.backlinks) : null;
          referringDomains = row.referring_domains != null ? Number(row.referring_domains) : null;
        } else {
          // try direct object parse
          const stats = statsResult.value as Record<string, unknown> | null;
          if (stats && typeof stats === "object") {
            const content = (stats as { content?: { type: string; text: string }[] }).content;
            if (Array.isArray(content) && content[0]?.type === "text") {
              try {
                const parsed = JSON.parse(content[0].text) as Record<string, unknown>;
                dr = parsed.domain_rating != null ? Number(parsed.domain_rating) : null;
                backlinks = parsed.backlinks != null ? Number(parsed.backlinks) : null;
                referringDomains = parsed.referring_domains != null ? Number(parsed.referring_domains) : null;
              } catch { /* ignore */ }
            }
          }
        }
      }

      let drHistory: { date: string; dr: number }[] = [];
      let drTrend: "rising" | "falling" | "stable" | null = null;

      if (historyResult.status === "fulfilled") {
        const rows = parseMcpRows(historyResult.value);
        drHistory = rows
          .filter((r) => r.date != null && r.domain_rating != null)
          .map((r) => ({
            date: String(r.date),
            dr: Number(r.domain_rating),
          }))
          .sort((a, b) => a.date.localeCompare(b.date));
        drTrend = computeTrend(drHistory);
      }

      return { domain, dr, backlinks, referringDomains, drTrend, drHistory };
    })
  );

  const authority: AuthorityEntry[] = results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : {
          domain: domains[i],
          dr: null,
          backlinks: null,
          referringDomains: null,
          drTrend: null,
          drHistory: [],
        }
  );

  return NextResponse.json(authority);
}
