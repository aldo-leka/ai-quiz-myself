import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { and, desc, eq } from "drizzle-orm";
import { generateText } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { apiKeyProviderEnum, apiKeys } from "@/db/schema";
import { decryptApiKey, encryptApiKey } from "@/lib/api-key-crypto";
import { getUserSessionOrNull } from "@/lib/user-auth";

export const runtime = "nodejs";

const createApiKeySchema = z.object({
  provider: z.enum(apiKeyProviderEnum.enumValues),
  apiKey: z.string().trim().min(10),
  label: z.string().trim().max(80).optional(),
});

function maskApiKey(rawApiKey: string) {
  const suffix = rawApiKey.slice(-4);
  return `••••••••${suffix}`;
}

async function listKeysForUser(userId: string) {
  const rows = await db
    .select({
      id: apiKeys.id,
      provider: apiKeys.provider,
      label: apiKeys.label,
      createdAt: apiKeys.createdAt,
      encryptedKey: apiKeys.encryptedKey,
    })
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId))
    .orderBy(desc(apiKeys.createdAt));

  return rows.map((row) => ({
    id: row.id,
    provider: row.provider,
    label: row.label,
    createdAt: row.createdAt,
    maskedKey: maskApiKey(decryptApiKey(row.encryptedKey)),
  }));
}

async function validateApiKey(provider: (typeof apiKeyProviderEnum.enumValues)[number], apiKey: string) {
  if (provider === "openai") {
    const openai = createOpenAI({ apiKey });
    await generateText({
      model: openai(process.env.OPENAI_MODEL ?? "gpt-5-mini"),
      prompt: "Reply with: ok",
      maxOutputTokens: 4,
    });
    return;
  }

  if (provider === "anthropic") {
    const anthropic = createAnthropic({ apiKey });
    await generateText({
      model: anthropic(process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6"),
      prompt: "Reply with: ok",
      maxOutputTokens: 4,
    });
    return;
  }

  const google = createGoogleGenerativeAI({ apiKey });
  await generateText({
    model: google(process.env.GOOGLE_MODEL ?? "gemini-3-flash-preview"),
    prompt: "Reply with: ok",
    maxOutputTokens: 4,
  });
}

export async function GET() {
  const session = await getUserSessionOrNull();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const keys = await listKeysForUser(session.user.id);
  return NextResponse.json({ keys });
}

export async function POST(request: Request) {
  const session = await getUserSessionOrNull();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = createApiKeySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  const payload = parsed.data;

  try {
    await validateApiKey(payload.provider, payload.apiKey);
  } catch {
    return NextResponse.json({ error: "API key validation failed for selected provider." }, { status: 400 });
  }

  const encrypted = encryptApiKey(payload.apiKey);

  const [existing] = await db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, session.user.id), eq(apiKeys.provider, payload.provider)))
    .limit(1);

  if (existing) {
    await db
      .update(apiKeys)
      .set({
        encryptedKey: encrypted,
        label: payload.label ?? null,
        createdAt: new Date(),
      })
      .where(eq(apiKeys.id, existing.id));
  } else {
    await db.insert(apiKeys).values({
      userId: session.user.id,
      provider: payload.provider,
      encryptedKey: encrypted,
      label: payload.label ?? null,
    });
  }

  const keys = await listKeysForUser(session.user.id);
  return NextResponse.json({ success: true, keys });
}
