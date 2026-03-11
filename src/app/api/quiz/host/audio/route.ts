import { NextResponse } from "next/server";
import { z } from "zod";
import {
  buildHostSpeechText,
  buildQuizTtsObjectKey,
  getQuizTtsContentType,
  getQuizTtsFormat,
  getQuizTtsModel,
  getQuizTtsVoice,
  synthesizeQuizSpeech,
} from "@/lib/quiz-tts";
import { downloadR2ObjectBuffer, isR2Configured, uploadR2ObjectBuffer } from "@/lib/r2";

export const runtime = "nodejs";

const requestSchema = z.object({
  text: z.string().trim().min(1).max(4000),
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

async function respondWithHostNarration(text: string) {
  const speechText = buildHostSpeechText(text);
  const model = getQuizTtsModel();
  const voice = getQuizTtsVoice("wwtbam");
  const format = getQuizTtsFormat();
  const contentType = getQuizTtsContentType(format);
  const objectKey = buildQuizTtsObjectKey({
    segment: "host",
    gameMode: "wwtbam",
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
      // Cache miss. Generate below.
    }
  }

  try {
    const audio = await synthesizeQuizSpeech({
      gameMode: "wwtbam",
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
        // Serve generated audio even if caching fails.
      }
    }

    return toAudioResponse(audio, contentType);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to generate host narration audio",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return NextResponse.json({ error: "Text-to-speech is not configured." }, { status: 412 });
  }

  const url = new URL(request.url);
  const parsed = requestSchema.safeParse({
    text: url.searchParams.get("text"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid host audio query", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  return respondWithHostNarration(parsed.data.text);
}

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return NextResponse.json({ error: "Text-to-speech is not configured." }, { status: 412 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid host audio payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  return respondWithHostNarration(parsed.data.text);
}
