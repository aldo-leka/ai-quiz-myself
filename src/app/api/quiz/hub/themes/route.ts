import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { quizzes } from "@/db/schema";
import { db } from "@/db";

export async function GET() {
  const rows = await db
    .selectDistinct({ theme: quizzes.theme })
    .from(quizzes)
    .where(eq(quizzes.isHub, true))
    .orderBy(asc(quizzes.theme));

  const themes = rows
    .map((row) => row.theme.trim())
    .filter((theme) => theme.length > 0);

  return NextResponse.json({ themes });
}

