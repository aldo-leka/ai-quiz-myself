import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { questions, quizzes } from "@/db/schema";
import {
  buildOptionsSpeechText,
  buildQuestionSpeechText,
  buildQuizTtsObjectKey,
  getQuizTtsContentType,
  getQuizTtsFormat,
  getQuizTtsModel,
  getQuizTtsVoice,
  synthesizeQuizSpeech,
  type QuizTtsSegment,
  type SupportedQuizGameMode,
} from "@/lib/quiz-tts";
import { downloadR2ObjectBuffer, isR2Configured, uploadR2ObjectBuffer } from "@/lib/r2";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ quizId: string; questionId: string }>;
};

const requestSchema = z.object({
  segment: z.enum(["question", "options"]),
  position: z.number().int().min(1).max(500),
  questionText: z.string().trim().min(1).max(4000),
  options: z.array(z.string().trim().min(1).max(500)).max(4).optional(),
});

const searchSchema = z.object({
  segment: z.enum(["question", "options"]),
  position: z.coerce.number().int().min(1).max(500),
  option: z.union([z.string().trim().min(1).max(500), z.array(z.string().trim().min(1).max(500))]).optional(),
});

function toAudioResponse(buffer: Buffer, contentType: string) {
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

function buildSpeechText(payload: z.infer<typeof requestSchema>): string {
  if (payload.segment === "question") {
    return buildQuestionSpeechText({
      position: payload.position,
      questionText: payload.questionText,
    });
  }

  return buildOptionsSpeechText({
    options: payload.options ?? [],
  });
}

async function loadQuestionContext(quizId: string, questionId: string) {
  const [row] = await db
    .select({
      gameMode: quizzes.gameMode,
      questionText: questions.questionText,
    })
    .from(questions)
    .innerJoin(quizzes, eq(questions.quizId, quizzes.id))
    .where(and(eq(quizzes.id, quizId), eq(questions.id, questionId)))
    .limit(1);

  return row;
}

async function respondWithNarration(params: {
  gameMode: SupportedQuizGameMode;
  segment: QuizTtsSegment;
  speechText: string;
}) {
  const model = getQuizTtsModel();
  const voice = getQuizTtsVoice(params.gameMode);
  const format = getQuizTtsFormat();
  const contentType = getQuizTtsContentType(format);
  const objectKey = buildQuizTtsObjectKey({
    segment: params.segment,
    gameMode: params.gameMode,
    model,
    voice,
    format,
    speechText: params.speechText,
  });

  if (isR2Configured()) {
    try {
      const cached = await downloadR2ObjectBuffer(objectKey);
      return toAudioResponse(cached, contentType);
    } catch {
      // Cache miss, synthesize below.
    }
  }

  try {
    const audio = await synthesizeQuizSpeech({
      gameMode: params.gameMode,
      speechText: params.speechText,
    });

    if (isR2Configured()) {
      try {
        await uploadR2ObjectBuffer({
          objectKey,
          body: audio,
          contentType,
          cacheControl: "public, max-age=31536000, immutable",
        });
      } catch {
        // Serve synthesized audio even if cache upload fails.
      }
    }

    return toAudioResponse(audio, contentType);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to generate narration audio",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request, { params }: RouteContext) {
  const { quizId, questionId } = await params;

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return NextResponse.json({ error: "Text-to-speech is not configured." }, { status: 412 });
  }

  const url = new URL(request.url);
  const parsed = searchSchema.safeParse({
    segment: url.searchParams.get("segment"),
    position: url.searchParams.get("position"),
    option: url.searchParams.getAll("option"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid text-to-speech query", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const row = await loadQuestionContext(quizId, questionId);
  if (!row) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  const options = Array.isArray(parsed.data.option)
    ? parsed.data.option
    : parsed.data.option
      ? [parsed.data.option]
      : [];

  if (parsed.data.segment === "options" && options.length === 0) {
    return NextResponse.json({ error: "Options narration requires at least one option." }, { status: 400 });
  }

  const payload = {
    segment: parsed.data.segment,
    position: parsed.data.position,
    questionText: row.questionText,
    options,
  } satisfies z.infer<typeof requestSchema>;

  return respondWithNarration({
    gameMode: row.gameMode as SupportedQuizGameMode,
    segment: payload.segment as QuizTtsSegment,
    speechText: buildSpeechText(payload),
  });
}

export async function POST(request: Request, { params }: RouteContext) {
  const { quizId, questionId } = await params;

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return NextResponse.json({ error: "Text-to-speech is not configured." }, { status: 412 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid text-to-speech payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  if (parsed.data.segment === "options" && (!parsed.data.options || parsed.data.options.length === 0)) {
    return NextResponse.json({ error: "Options narration requires at least one option." }, { status: 400 });
  }

  const row = await loadQuestionContext(quizId, questionId);

  if (!row) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  return respondWithNarration({
    gameMode: row.gameMode as SupportedQuizGameMode,
    segment: parsed.data.segment as QuizTtsSegment,
    speechText: buildSpeechText(parsed.data),
  });
}
