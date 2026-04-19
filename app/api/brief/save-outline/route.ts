import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const outlineItemSchema = z.object({
  id: z.string(),
  level: z.union([z.literal(2), z.literal(3)]),
  text: z.string(),
  locked: z.boolean(),
  guidance: z.string().optional(),
  seoType: z.enum(["seo", "geo", "aeo", "paa", "gpt"]).optional(),
});

const schema = z.object({
  briefId: z.string(),
  outline: z.array(outlineItemSchema),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { briefId, outline } = parsed.data;

  await db.articleBrief.update({
    where: { id: briefId },
    data: { editableOutline: outline as object[] },
  });

  return NextResponse.json({ ok: true });
}
