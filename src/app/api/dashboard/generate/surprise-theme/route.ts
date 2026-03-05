import { generateObject } from "ai";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { user } from "@/db/schema/auth";
import { getUserSessionOrNull } from "@/lib/user-auth";
import {
  getLanguageModel,
  resolveUserApiKey,
  type ProviderName,
} from "@/lib/user-api-keys";

export const runtime = "nodejs";

const requestSchema = z.object({
  gameMode: z.enum(["single", "wwtbam", "couch_coop"]),
  language: z.string().trim().min(2).max(16).default("en"),
});

function normalizePreferredProvider(value: string | null | undefined): ProviderName | null {
  if (value === "openai" || value === "anthropic" || value === "google") {
    return value;
  }
  return null;
}

export async function POST(request: Request) {
  const session = await getUserSessionOrNull();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const [userRow] = await db
    .select({ preferredProvider: user.preferredProvider })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1);

  const preferredProvider = normalizePreferredProvider(userRow?.preferredProvider);
  const credentials = await resolveUserApiKey(session.user.id, undefined, preferredProvider);
  const platformApiKey = process.env.OPENAI_API_KEY;

  if (!credentials && !platformApiKey) {
    return NextResponse.json(
      { error: "No API key found. Add one in Dashboard > API Keys, or configure platform billing." },
      { status: 412 },
    );
  }

  const model = credentials
    ? getLanguageModel(credentials.provider, credentials.apiKey)
    : getLanguageModel("openai", platformApiKey!);
  const { object } = await generateObject({
    model,
    schema: z.object({
      theme: z.string().min(3).max(80),
    }),
    prompt: [
      "Suggest one family-friendly quiz theme.",
      `Language/locale: ${parsed.data.language}`,
      `Game mode: ${parsed.data.gameMode}`,
      "Constraints:",
      "- Keep it specific and engaging.",
      "- Keep under 80 characters.",
      "- Return only the theme string field in the schema.",
    ].join("\n"),
  });

  return NextResponse.json({
    theme: object.theme.trim(),
  });
}
