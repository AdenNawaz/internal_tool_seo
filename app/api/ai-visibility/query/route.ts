export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { queryAIPlatforms } from "@/lib/ai-visibility";

const schema = z.object({
  query: z.string().min(1),
  companyDomain: z.string().default(""),
  competitorDomains: z.array(z.string()).default([]),
  saveSnapshot: z.boolean().default(true),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { query, companyDomain, competitorDomains, saveSnapshot } = parsed.data;
  const domain = companyDomain || process.env.OWN_DOMAIN || "";

  const result = await queryAIPlatforms({ query, companyDomain: domain, competitorDomains });

  if (saveSnapshot) {
    await Promise.all(
      result.platforms.map((p) =>
        db.visibilitySnapshot.create({
          data: {
            prompt: query,
            platform: p.platform,
            companyVisible: p.companyAppears,
            companyCited: p.companyCited,
            competitors: p.competitorsCited as never,
          },
        })
      )
    );
  }

  return NextResponse.json(result);
}
