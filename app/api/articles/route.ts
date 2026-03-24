import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST() {
  const article = await db.article.create({
    data: {},
  });
  return NextResponse.json({ id: article.id }, { status: 201 });
}
