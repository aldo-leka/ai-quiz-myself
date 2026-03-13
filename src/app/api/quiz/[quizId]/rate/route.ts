import { and, eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { quizVotes, quizzes } from "@/db/schema";
import {
  ANON_COOKIE_MAX_AGE_SECONDS,
  ANON_COOKIE_NAME,
  getOrCreateAnonId,
} from "@/lib/anon-user";
import { auth } from "@/lib/auth";
import { enforceRateLimit, getClientIp } from "@/lib/rate-limit";

const payloadSchema = z.object({
  vote: z.enum(["like", "dislike"]),
});

const QUIZ_RATE_LIMIT = {
  limit: 30,
  windowMs: 60_000,
  errorMessage: "Too many rating requests. Please wait a moment and try again.",
} as const;

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

  const userId = session?.user?.id ?? null;
  const rateLimitResponse = await enforceRateLimit({
    scope: "quiz_vote",
    identifier: userId ? `user:${userId}` : `ip:${getClientIp(request)}`,
    ...QUIZ_RATE_LIMIT,
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  let anonId: string | null = null;
  let shouldSetAnonCookie = false;

  if (!userId) {
    const anonIdentity = await getOrCreateAnonId();
    anonId = anonIdentity.anonId;
    shouldSetAnonCookie = anonIdentity.shouldSetCookie;
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
