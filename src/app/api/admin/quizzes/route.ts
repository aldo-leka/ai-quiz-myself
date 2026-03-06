import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import {
  hubCandidates,
  questionDifficultyEnum,
  questions,
  quizDifficultyEnum,
  quizGameModeEnum,
  quizzes,
  quizSourceTypeEnum,
} from "@/db/schema";
import { user } from "@/db/schema/auth";
import { getAdminSessionOrNull } from "@/lib/admin-auth";

const createQuestionSchema = z.object({
  questionText: z.string().min(1),
  options: z
    .array(
      z.object({
        text: z.string().min(1),
        explanation: z.string().min(1),
      }),
    )
    .length(4),
  correctOptionIndex: z.number().int().min(0).max(3),
  difficulty: z.enum(questionDifficultyEnum.enumValues),
  subject: z.string().optional().nullable(),
});

const createQuizSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  theme: z.string().min(1),
  language: z.string().min(1).default("en"),
  difficulty: z.enum(quizDifficultyEnum.enumValues),
  gameMode: z.enum(quizGameModeEnum.enumValues),
  sourceType: z.enum(quizSourceTypeEnum.enumValues).default("manual"),
  isHub: z.boolean().default(false),
  isPublic: z.boolean().default(true),
  questions: z.array(createQuestionSchema).min(1),
});

function parsePositiveInt(input: string | null, fallback: number) {
  if (!input) return fallback;
  const parsed = Number(input);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export async function GET(request: Request) {
  const adminSession = await getAdminSessionOrNull();
  if (!adminSession) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const page = parsePositiveInt(searchParams.get("page"), 1);
  const limit = Math.min(parsePositiveInt(searchParams.get("limit"), 20), 100);
  const search = searchParams.get("search")?.trim();
  const gameMode = searchParams.get("gameMode")?.trim();
  const sourceType = searchParams.get("sourceType")?.trim();
  const isHub = searchParams.get("isHub")?.trim();
  const language = searchParams.get("language")?.trim();

  const filters = [];

  if (search) {
    const pattern = `%${search}%`;
    filters.push(
      or(
        ilike(quizzes.title, pattern),
        ilike(quizzes.theme, pattern),
        ilike(quizzes.description, pattern),
      )!,
    );
  }

  if (gameMode && quizGameModeEnum.enumValues.includes(gameMode as (typeof quizGameModeEnum.enumValues)[number])) {
    filters.push(eq(quizzes.gameMode, gameMode as (typeof quizGameModeEnum.enumValues)[number]));
  }

  if (
    sourceType &&
    quizSourceTypeEnum.enumValues.includes(sourceType as (typeof quizSourceTypeEnum.enumValues)[number])
  ) {
    filters.push(eq(quizzes.sourceType, sourceType as (typeof quizSourceTypeEnum.enumValues)[number]));
  }

  if (isHub === "true") filters.push(eq(quizzes.isHub, true));
  if (isHub === "false") filters.push(eq(quizzes.isHub, false));

  if (language) filters.push(eq(quizzes.language, language));

  const whereClause = filters.length > 0 ? and(...filters) : sql`true`;
  const offset = (page - 1) * limit;

  const [countRows, rows] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
      })
      .from(quizzes)
      .where(whereClause),
    db
      .select({
        id: quizzes.id,
        title: quizzes.title,
        theme: quizzes.theme,
        language: quizzes.language,
        difficulty: quizzes.difficulty,
        gameMode: quizzes.gameMode,
        sourceType: quizzes.sourceType,
        isHub: quizzes.isHub,
        isPublic: quizzes.isPublic,
        questionCount: quizzes.questionCount,
        playCount: quizzes.playCount,
        creatorId: quizzes.creatorId,
        creatorName: user.name,
        creatorEmail: user.email,
        createdAt: quizzes.createdAt,
      })
      .from(quizzes)
      .leftJoin(user, eq(quizzes.creatorId, user.id))
      .where(whereClause)
      .orderBy(desc(quizzes.createdAt))
      .limit(limit)
      .offset(offset),
  ]);

  const total = Number(countRows[0]?.total ?? 0);
  const missingCreatorQuizIds = rows
    .filter((quiz) => quiz.creatorName === null)
    .map((quiz) => quiz.id);

  const fallbackCreators = missingCreatorQuizIds.length
    ? await db
        .select({
          publishedQuizId: hubCandidates.publishedQuizId,
          creatorId: hubCandidates.submittedByUserId,
          creatorName: user.name,
          creatorEmail: user.email,
        })
        .from(hubCandidates)
        .leftJoin(user, eq(hubCandidates.submittedByUserId, user.id))
        .where(inArray(hubCandidates.publishedQuizId, missingCreatorQuizIds))
    : [];

  const fallbackCreatorMap = new Map(
    fallbackCreators.map((row) => [
      row.publishedQuizId,
      {
        creatorId: row.creatorId,
        creatorName: row.creatorName,
        creatorEmail: row.creatorEmail,
      },
    ]),
  );

  return NextResponse.json({
    quizzes: rows.map((quiz) => {
      const fallbackCreator = fallbackCreatorMap.get(quiz.id) ?? null;

      return {
        ...quiz,
        creatorId: quiz.creatorId ?? fallbackCreator?.creatorId ?? null,
        creatorName: quiz.creatorName ?? fallbackCreator?.creatorName ?? null,
        creatorEmail: quiz.creatorEmail ?? fallbackCreator?.creatorEmail ?? null,
      };
    }),
    page,
    limit,
    total,
    hasMore: page * limit < total,
  });
}

export async function POST(request: Request) {
  const adminSession = await getAdminSessionOrNull();
  if (!adminSession) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = createQuizSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const payload = parsed.data;

  const [createdQuiz] = await db
    .insert(quizzes)
    .values({
      creatorId: adminSession.user.id,
      title: payload.title,
      description: payload.description ?? null,
      theme: payload.theme,
      language: payload.language,
      difficulty: payload.difficulty,
      gameMode: payload.gameMode,
      questionCount: payload.questions.length,
      sourceType: payload.sourceType,
      isHub: payload.isHub,
      isPublic: payload.isPublic,
    })
    .returning({ id: quizzes.id });

  await db.insert(questions).values(
    payload.questions.map((question, index) => ({
      quizId: createdQuiz.id,
      position: index + 1,
      questionText: question.questionText,
      options: question.options,
      correctOptionIndex: question.correctOptionIndex,
      difficulty: question.difficulty,
      subject: question.subject ?? null,
    })),
  );

  return NextResponse.json({ success: true, quizId: createdQuiz.id }, { status: 201 });
}
