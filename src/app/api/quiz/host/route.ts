import { and, desc, eq } from "drizzle-orm";
import { streamText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { auth } from "@/lib/auth";
import { decryptApiKey } from "@/lib/api-key-crypto";
import type { HostActionType } from "@/lib/quiz-types";

export const runtime = "nodejs";

const requestSchema = z.object({
  actionType: z.enum([
    "WELCOME",
    "BEGIN_QUESTION",
    "FINAL_ANSWER_CONFIRM",
    "LIFELINE_ASK_HOST",
    "LIFELINE_5050",
  ]),
  action: z.string(),
  currentSetting: z
    .object({
      moneyValue: z.number().optional(),
      remainingTime: z.number().nullable().optional(),
      difficulty: z.string().optional(),
      question: z.string().optional(),
      options: z.array(z.string()).optional(),
      correctAnswer: z.string().optional(),
    })
    .default({}),
  additionalData: z.record(z.string(), z.unknown()).optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      }),
    )
    .default([]),
  provider: z.enum(["openai", "anthropic", "google"]).optional(),
  apiKey: z.string().optional(),
});

type ProviderName = "openai" | "anthropic" | "google";

async function resolveApiCredentials(
  requestedProvider?: ProviderName,
  providedApiKey?: string,
): Promise<{ provider: ProviderName; apiKey: string } | null> {
  if (requestedProvider && providedApiKey) {
    return {
      provider: requestedProvider,
      apiKey: decryptApiKey(providedApiKey),
    };
  }

  let session: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
  try {
    session = await auth.api.getSession({
      headers: new Headers(await headers()),
    });
  } catch {
    // If auth session resolution fails, treat as anonymous and use fallback host messaging.
    return null;
  }

  const userId = session?.user?.id;
  if (!userId) return null;

  const [savedKey] = await db
    .select()
    .from(apiKeys)
    .where(
      requestedProvider
        ? and(eq(apiKeys.userId, userId), eq(apiKeys.provider, requestedProvider))
        : eq(apiKeys.userId, userId),
    )
    .orderBy(desc(apiKeys.createdAt))
    .limit(1);

  if (!savedKey) return null;

  return {
    provider: savedKey.provider,
    apiKey: decryptApiKey(savedKey.encryptedKey),
  };
}

function buildSystemPrompt(
  actionType: HostActionType,
  currentSetting: {
    moneyValue?: number;
    remainingTime?: number | null;
    difficulty?: string;
    question?: string;
    options?: string[];
    correctAnswer?: string;
  },
  additionalData?: Record<string, unknown>,
) {
  const baseRules = `You are the charismatic host of a prime-time quiz show called QuizPlus: Millionaire.
Be dramatic, warm, and educational.
Hard limit: 4 sentences maximum.
Do not use markdown.
You MUST use these cue tokens naturally in your response: |||slow|||, |||medium|||, |||fast|||.
Use |||option:A||| |||option:B||| |||option:C||| |||option:D||| while presenting options.
Use |||reveal||| only when the answer should be revealed.`;

  if (actionType === "WELCOME") {
    const contestantName =
      typeof additionalData?.contestantName === "string" ? additionalData.contestantName : "contestant";

    return `${baseRules}
Action: Welcome the contestant ${contestantName}.
Build excitement for the million-dollar climb.`;
  }

  if (actionType === "BEGIN_QUESTION") {
    const options = currentSetting.options ?? [];
    return `${baseRules}
Action: Present the next question.
Money value: ${currentSetting.moneyValue ?? 0}
Difficulty: ${currentSetting.difficulty ?? "mixed"}
Question: ${currentSetting.question ?? ""}
Options:
A) ${options[0] ?? ""}
B) ${options[1] ?? ""}
C) ${options[2] ?? ""}
D) ${options[3] ?? ""}
Instruction: Ask the question first, then present each option with the matching option cue marker.`;
  }

  if (actionType === "FINAL_ANSWER_CONFIRM") {
    const selectedAnswer =
      typeof additionalData?.selectedAnswer === "string" ? additionalData.selectedAnswer : "";
    const correctExplanation =
      typeof additionalData?.correctAnswerExplanation === "string"
        ? additionalData.correctAnswerExplanation
        : "";
    const selectedExplanation =
      typeof additionalData?.selectedAnswerExplanation === "string"
        ? additionalData.selectedAnswerExplanation
        : "";

    return `${baseRules}
Action: React to a locked final answer.
Question: ${currentSetting.question ?? ""}
Selected answer: ${selectedAnswer}
Correct answer: ${currentSetting.correctAnswer ?? ""}
Correct explanation: ${correctExplanation}
Selected-answer explanation: ${selectedExplanation}
Instruction: Build suspense, then reveal result with |||reveal|||. If wrong, explain briefly why selected answer fails and why the correct answer works.`;
  }

  if (actionType === "LIFELINE_5050") {
    const remainingOptions = Array.isArray(additionalData?.remainingOptions)
      ? additionalData.remainingOptions.join(", ")
      : "";

    return `${baseRules}
Action: Confirm that 50:50 lifeline was used.
Remaining options: ${remainingOptions}
Instruction: Keep it concise and suspenseful.`;
  }

  const options = Array.isArray(additionalData?.remainingOptions)
    ? additionalData.remainingOptions.join(", ")
    : (currentSetting.options ?? []).join(", ");

  return `${baseRules}
Action: The player asks the host for help.
Question: ${currentSetting.question ?? ""}
Available options: ${options}
Instruction: Give your best guess and reasoning, but do not claim certainty.`;
}

function getModel(provider: ProviderName, apiKey: string) {
  if (provider === "openai") {
    const openai = createOpenAI({ apiKey });
    return openai(process.env.HOST_OPENAI_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-5-mini");
  }

  if (provider === "anthropic") {
    const anthropic = createAnthropic({ apiKey });
    return anthropic(
      process.env.HOST_ANTHROPIC_MODEL ?? process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5",
    );
  }

  const google = createGoogleGenerativeAI({ apiKey });
  return google(process.env.HOST_GOOGLE_MODEL ?? process.env.GOOGLE_MODEL ?? "gemini-3.1-flash-lite");
}

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid host payload",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const payload = parsed.data;

  const credentials = await resolveApiCredentials(payload.provider, payload.apiKey);

  if (!credentials) {
    return NextResponse.json(
      {
        error: "No AI provider key configured",
      },
      { status: 412 },
    );
  }

  const model = getModel(credentials.provider, credentials.apiKey);
  const system = buildSystemPrompt(payload.actionType, payload.currentSetting, payload.additionalData);

  const result = streamText({
    model,
    system,
    messages: [
      ...payload.history.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      {
        role: "user" as const,
        content: payload.action,
      },
    ],
  });

  return result.toTextStreamResponse({
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
