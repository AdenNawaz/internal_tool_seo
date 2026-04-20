export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cachedAhrefs } from "@/lib/ahrefs-cached";
import { parseMcpRows } from "@/lib/ahrefs-utils";

const schema = z.object({
  suggestions: z.array(
    z.object({ url: z.string(), anchorText: z.string() })
  ).max(3),
});

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const results = await Promise.allSettled(
    parsed.data.suggestions.map(async ({ url }) => {
      const domain = extractDomain(url);
      const raw = await cachedAhrefs("site-explorer-linked-anchors-external", {
        target: domain,
        select: "anchor,dofollow_links,referring_domains",
        limit: 20,
      });
      const rows = parseMcpRows(raw);
      const topExternalAnchors = rows
        .slice(0, 5)
        .map((r) => ({
          anchor: String(r.anchor ?? ""),
          referringDomains: Number(r.referring_domains ?? 0),
        }))
        .filter((a) => a.anchor);
      return { url, topExternalAnchors };
    })
  );

  const enriched = results
    .filter((r) => r.status === "fulfilled")
    .map((r) => (r as PromiseFulfilledResult<{ url: string; topExternalAnchors: { anchor: string; referringDomains: number }[] }>).value);

  return NextResponse.json(enriched);
}
