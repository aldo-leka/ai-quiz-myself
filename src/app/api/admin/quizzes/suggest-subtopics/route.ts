import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSessionOrNull } from "@/lib/admin-auth";
import {
  generateUniqueSubtopics,
  getExistingThemesForCategory,
} from "@/lib/quiz-themes";
import { getLanguageModel, resolveUserApiKey } from "@/lib/user-api-keys";

export const runtime = "nodejs";

const requestSchema = z.object({
  broadCategory: z.string().trim().min(2).max(120),
  count: z.number().int().min(1).max(20).default(10),
  apiKeyId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const adminSession = await getAdminSessionOrNull();
  if (!adminSession) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const payload = parsed.data;
  const credentials = await resolveUserApiKey(adminSession.user.id, payload.apiKeyId);
  if (!credentials) {
    return NextResponse.json(
      { error: "No API key found. Add one in Admin > API Keys." },
      { status: 412 },
    );
  }

  try {
    const model = getLanguageModel(credentials.provider, credentials.apiKey);
    const existingThemes = await getExistingThemesForCategory(payload.broadCategory);
    const subtopics = await generateUniqueSubtopics({
      broadCategory: payload.broadCategory,
      existingThemes,
      count: payload.count,
      model,
    });

    return NextResponse.json({
      success: true,
      subtopics,
      existingThemeCount: existingThemes.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate unique subtopics";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
