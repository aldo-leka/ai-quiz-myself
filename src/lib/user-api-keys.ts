import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { and, desc, eq } from "drizzle-orm";
import type { LanguageModel } from "ai";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { decryptApiKey } from "@/lib/api-key-crypto";

export type ProviderName = "openai" | "anthropic" | "google";

export type UserApiKeyRecord = {
  id: string;
  provider: ProviderName;
  apiKey: string;
};

export function getLanguageModelName(provider: ProviderName): string {
  if (provider === "openai") {
    return process.env.OPENAI_MODEL ?? "gpt-5-nano";
  }

  if (provider === "anthropic") {
    return process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
  }

  return process.env.GOOGLE_MODEL ?? "gemini-3-flash-preview";
}

export async function resolveUserApiKey(
  userId: string,
  apiKeyId?: string,
  preferredProvider?: ProviderName | null,
): Promise<UserApiKeyRecord | null> {
  const selected = apiKeyId
    ? (
      await db
        .select({
          id: apiKeys.id,
          provider: apiKeys.provider,
          encryptedKey: apiKeys.encryptedKey,
        })
        .from(apiKeys)
        .where(and(eq(apiKeys.id, apiKeyId), eq(apiKeys.userId, userId)))
        .limit(1)
    )[0]
    : preferredProvider
      ? (
        await db
          .select({
            id: apiKeys.id,
            provider: apiKeys.provider,
            encryptedKey: apiKeys.encryptedKey,
          })
          .from(apiKeys)
          .where(and(eq(apiKeys.userId, userId), eq(apiKeys.provider, preferredProvider)))
          .orderBy(desc(apiKeys.createdAt))
          .limit(1)
      )[0]
    : (
      await db
        .select({
          id: apiKeys.id,
          provider: apiKeys.provider,
          encryptedKey: apiKeys.encryptedKey,
        })
        .from(apiKeys)
        .where(eq(apiKeys.userId, userId))
        .orderBy(desc(apiKeys.createdAt))
        .limit(1)
    )[0];

  if (!selected) return null;

  return {
    id: selected.id,
    provider: selected.provider as ProviderName,
    apiKey: decryptApiKey(selected.encryptedKey),
  };
}

export function getLanguageModel(provider: ProviderName, apiKey: string): LanguageModel {
  if (provider === "openai") {
    const openai = createOpenAI({ apiKey });
    return openai(getLanguageModelName(provider));
  }

  if (provider === "anthropic") {
    const anthropic = createAnthropic({ apiKey });
    return anthropic(getLanguageModelName(provider));
  }

  const google = createGoogleGenerativeAI({ apiKey });
  return google(getLanguageModelName(provider));
}
