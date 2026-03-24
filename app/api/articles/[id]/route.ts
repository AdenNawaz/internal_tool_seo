import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { z } from "zod";

const patchSchema = z.object({
  title: z.string().optional(),
  content: z.unknown().optional(),
  targetKeyword: z.string().nullable().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const article = await db.article.findUnique({ where: { id: params.id } });
  if (!article) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(article);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.content !== undefined) data.content = parsed.data.content;
  if (parsed.data.targetKeyword !== undefined) data.targetKeyword = parsed.data.targetKeyword;

  const article = await db.article.update({
    where: { id: params.id },
    data,
    select: { updatedAt: true },
  });

  return NextResponse.json({ updatedAt: article.updatedAt });
}
