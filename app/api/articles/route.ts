export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionEmail } from "@/lib/auth-guard";
import { z } from "zod";

const createSchema = z.object({
  clusterId: z.string().optional(),
  clusterName: z.string().optional(),
  targetKeyword: z.string().optional(),
  title: z.string().optional(),
}).optional();

export async function GET(req: NextRequest) {
  const mine = req.nextUrl.searchParams.get("mine") === "true";
  const email = mine ? await getSessionEmail() : null;

  const articles = await db.article.findMany({
    where: mine && email ? { authorEmail: email } : undefined,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      targetKeyword: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(articles);
}

export async function POST(req: NextRequest) {
  let body: z.infer<typeof createSchema> = {};
  try {
    const raw = await req.json();
    const parsed = createSchema.safeParse(raw);
    if (parsed.success) body = parsed.data ?? {};
  } catch { /* empty body is fine */ }

  const authorEmail = await getSessionEmail();

  const article = await db.article.create({
    data: {
      ...(body?.title ? { title: body.title } : {}),
      ...(body?.targetKeyword ? { targetKeyword: body.targetKeyword } : {}),
      ...(body?.clusterId ? { clusterId: body.clusterId } : {}),
      ...(body?.clusterName ? { clusterName: body.clusterName } : {}),
      ...(authorEmail ? { authorEmail } : {}),
    },
  });

  return NextResponse.json({ id: article.id }, { status: 201 });
}
