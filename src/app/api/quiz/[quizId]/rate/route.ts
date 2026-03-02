import { and, eq, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { quizVotes, quizzes } from "@/db/schema";
import { auth } from "@/lib/auth";

const payloadSchema = z.object({
  vote: z.enum(["like", "dislike"]),
});

const ANON_COOKIE_NAME = "quizplus_anon_id";
const ANON_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 * 2;

type RouteContext = {
  params: Promise<{ quizId: string }>;
};

function computeLikeRatio(likes: number, dislikes: number) {
  const total = likes + dislikes;
  if (total === 0) return null;
  return likes / total;
}

function isUniqueConstraintViolation(error: unknown) {
  if (!error || typeof error !== "object") return false;
  if ("code" in error && error.code === "23505") return true;
  if ("message" in error && typeof error.message === "string") {
    return error.message.toLowerCase().includes("duplicate");
  }
  return false;
}

export async function POST(request: Request, { params }: RouteContext) {
  const { quizId } = await params;

  const parsedPayload = payloadSchema.safeParse(await request.json());
  if (!parsedPayload.success) {
    return NextResponse.json(
      {
        error: "Invalid payload",
        issues: parsedPayload.error.issues,
      },
      { status: 400 },
    );
  }

  const vote = parsedPayload.data.vote;

  let session: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
  try {
    session = await auth.api.getSession({
      headers: new Headers(await headers()),
    });
  } catch {
    session = null;
  }

  const cookieStore = await cookies();
  const userId = session?.user?.id ?? null;

  let anonId: string | null = null;
  let shouldSetAnonCookie = false;

  if (!userId) {
    const existingAnonId = cookieStore.get(ANON_COOKIE_NAME)?.value;
    const parsedAnonId = z.string().uuid().safeParse(existingAnonId);

    if (parsedAnonId.success) {
      anonId = parsedAnonId.data;
    } else {
      anonId = crypto.randomUUID();
      shouldSetAnonCookie = true;
    }
  }

  const whereActor = userId
    ? and(eq(quizVotes.quizId, quizId), eq(quizVotes.userId, userId))
    : and(eq(quizVotes.quizId, quizId), eq(quizVotes.anonId, anonId!));

  const [quiz] = await db
    .select({
      id: quizzes.id,
      likes: quizzes.likes,
      dislikes: quizzes.dislikes,
    })
    .from(quizzes)
    .where(eq(quizzes.id, quizId))
    .limit(1);

  if (!quiz) {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  }

  async function getExistingVote() {
    const [existingVote] = await db
      .select({
        id: quizVotes.id,
        vote: quizVotes.vote,
      })
      .from(quizVotes)
      .where(whereActor)
      .limit(1);
    return existingVote;
  }

  let existingVote = await getExistingVote();

  if (!existingVote) {
    try {
      await db.insert(quizVotes).values({
        quizId,
        userId,
        anonId,
        vote,
      });
      await db
        .update(quizzes)
        .set(
          vote === "like"
            ? {
                likes: sql`${quizzes.likes} + 1`,
              }
            : {
                dislikes: sql`${quizzes.dislikes} + 1`,
              },
        )
        .where(eq(quizzes.id, quizId));
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) {
        throw error;
      }
    }

    existingVote = await getExistingVote();
  }

  if (existingVote && existingVote.vote !== vote) {
    await db
      .update(quizVotes)
      .set({
        vote,
        updatedAt: new Date(),
      })
      .where(eq(quizVotes.id, existingVote.id));

    await db
      .update(quizzes)
      .set(
        vote === "like"
          ? {
              likes: sql`${quizzes.likes} + 1`,
              dislikes: sql`GREATEST(${quizzes.dislikes} - 1, 0)`,
            }
          : {
              likes: sql`GREATEST(${quizzes.likes} - 1, 0)`,
              dislikes: sql`${quizzes.dislikes} + 1`,
            },
      )
      .where(eq(quizzes.id, quizId));
  }

  const [updatedQuiz] = await db
    .select({
      likes: quizzes.likes,
      dislikes: quizzes.dislikes,
    })
    .from(quizzes)
    .where(eq(quizzes.id, quizId))
    .limit(1);

  const likes = updatedQuiz?.likes ?? quiz.likes;
  const dislikes = updatedQuiz?.dislikes ?? quiz.dislikes;

  const response = NextResponse.json({
    likes,
    dislikes,
    vote,
    likeRatio: computeLikeRatio(likes, dislikes),
  });

  if (shouldSetAnonCookie && anonId) {
    response.cookies.set({
      name: ANON_COOKIE_NAME,
      value: anonId,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: ANON_COOKIE_MAX_AGE_SECONDS,
      path: "/",
    });
  }

  return response;
}
