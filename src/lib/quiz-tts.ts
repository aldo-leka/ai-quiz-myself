import { createHash } from "node:crypto";
import { requireEnv } from "@/lib/env";

const MAX_TTS_INPUT_CHARS = 3800;
const DEFAULT_TTS_MODEL = "gpt-4o-mini-tts";
const DEFAULT_TTS_VOICE = "alloy";
const DEFAULT_WWTBAM_TTS_VOICE = "onyx";
const QUIZ_TTS_CACHE_VERSION = "v1";

export type SupportedQuizGameMode = "single" | "wwtbam" | "couch_coop";
export type QuizTtsSegment = "question" | "options";

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function buildQuestionSpeechText(params: {
  position: number;
  questionText: string;
}): string {
  return normalizeWhitespace(`Question ${params.position}. ${params.questionText}`).slice(
    0,
    MAX_TTS_INPUT_CHARS,
  );
}

export function buildOptionsSpeechText(params: {
  options: string[];
}): string {
  const labels = ["A", "B", "C", "D", "E", "F"];
  return normalizeWhitespace(
    params.options
      .map((option, index) => `${labels[index] ?? `Option ${index + 1}`}. ${option}.`)
      .join(" "),
  ).slice(0, MAX_TTS_INPUT_CHARS);
}

export function getQuizTtsModel(): string {
  return process.env.OPENAI_TTS_MODEL?.trim() || DEFAULT_TTS_MODEL;
}

export function getQuizTtsVoice(gameMode: SupportedQuizGameMode): string {
  if (gameMode === "wwtbam") {
    return process.env.OPENAI_TTS_WWTBAM_VOICE?.trim() || DEFAULT_WWTBAM_TTS_VOICE;
  }

  return process.env.OPENAI_TTS_DEFAULT_VOICE?.trim() || DEFAULT_TTS_VOICE;
}

export function getQuizTtsFormat(): "mp3" {
  const format = process.env.OPENAI_TTS_FORMAT?.trim().toLowerCase();
  return format === "mp3" ? "mp3" : "mp3";
}

export function getQuizTtsContentType(format: "mp3"): string {
  if (format === "mp3") {
    return "audio/mpeg";
  }

  return "application/octet-stream";
}

export function buildQuizTtsObjectKey(params: {
  segment: QuizTtsSegment;
  gameMode: SupportedQuizGameMode;
  model: string;
  voice: string;
  format: "mp3";
  speechText: string;
}): string {
  const digest = createHash("sha256")
    .update(
      [
        params.segment,
        params.gameMode,
        params.model,
        params.voice,
        params.format,
        params.speechText,
      ].join("\n"),
    )
    .digest("hex");

  return [
    "quiz-tts",
    QUIZ_TTS_CACHE_VERSION,
    params.gameMode,
    params.voice,
    params.segment,
    `${digest}.${params.format}`,
  ].join("/");
}

export async function synthesizeQuizSpeech(params: {
  gameMode: SupportedQuizGameMode;
  speechText: string;
}): Promise<Buffer> {
  const model = getQuizTtsModel();
  const voice = getQuizTtsVoice(params.gameMode);
  const format = getQuizTtsFormat();

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireEnv("OPENAI_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      voice,
      input: params.speechText,
      response_format: format,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI TTS failed (${response.status}): ${body.slice(0, 240)}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
