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

  const [row] = await db
    .select({
      gameMode: quizzes.gameMode,
    })
    .from(questions)
    .innerJoin(quizzes, eq(questions.quizId, quizzes.id))
    .where(and(eq(quizzes.id, quizId), eq(questions.id, questionId)))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  const gameMode = row.gameMode as SupportedQuizGameMode;
  const segment = parsed.data.segment as QuizTtsSegment;
  const speechText = buildSpeechText(parsed.data);
  const model = getQuizTtsModel();
  const voice = getQuizTtsVoice(gameMode);
  const format = getQuizTtsFormat();
  const contentType = getQuizTtsContentType(format);
  const objectKey = buildQuizTtsObjectKey({
    segment,
    gameMode,
    model,
    voice,
    format,
    speechText,
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
      gameMode,
      speechText,
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
