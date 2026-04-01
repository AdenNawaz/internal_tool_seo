import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPageAuditData } from "@/lib/site-audit";

const schema = z.object({
  url: z.string().url().startsWith("https://"),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid URL — must be an https:// URL" }, { status: 400 });
  }

  const ownDomain = process.env.OWN_DOMAIN ?? "";
  if (ownDomain && !parsed.data.url.includes(ownDomain)) {
    return NextResponse.json(
      { error: `URL must be on ${ownDomain}` },
      { status: 400 }
    );
  }

  const result = await getPageAuditData(parsed.data.url);
  return NextResponse.json(result);
}
