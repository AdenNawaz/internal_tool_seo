export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const profile = await db.authorProfile.findFirst({ orderBy: { createdAt: "asc" } });
  return NextResponse.json(profile ?? null);
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    name: string;
    title?: string;
    bio?: string;
    credentials?: string;
    linkedinUrl?: string;
    avatarUrl?: string;
  };

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const existing = await db.authorProfile.findFirst({ orderBy: { createdAt: "asc" } });

  let profile;
  if (existing) {
    profile = await db.authorProfile.update({
      where: { id: existing.id },
      data: {
        name: body.name.trim(),
        title: body.title?.trim() ?? null,
        bio: body.bio?.trim() ?? null,
        credentials: body.credentials?.trim() ?? null,
        linkedinUrl: body.linkedinUrl?.trim() ?? null,
        avatarUrl: body.avatarUrl?.trim() ?? null,
      },
    });
  } else {
    profile = await db.authorProfile.create({
      data: {
        name: body.name.trim(),
        title: body.title?.trim() ?? undefined,
        bio: body.bio?.trim() ?? undefined,
        credentials: body.credentials?.trim() ?? undefined,
        linkedinUrl: body.linkedinUrl?.trim() ?? undefined,
        avatarUrl: body.avatarUrl?.trim() ?? undefined,
      },
    });
  }

  return NextResponse.json(profile);
}
