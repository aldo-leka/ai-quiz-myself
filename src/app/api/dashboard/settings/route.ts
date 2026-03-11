import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { apiKeyProviderEnum, apiKeys } from "@/db/schema";
import { user } from "@/db/schema/auth";
import { getUserSessionOrNull } from "@/lib/user-auth";

export const runtime = "nodejs";

const settingsSchema = z.object({
  locale: z.string().trim().min(2).max(16).optional(),
  preferredProvider: z
    .union([z.enum(apiKeyProviderEnum.enumValues), z.literal("none")])
    .optional(),
  readAloudEnabled: z.boolean().optional(),
});

export async function PATCH(request: Request) {
  const session = await getUserSessionOrNull();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = settingsSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  const payload = parsed.data;
  if (
    payload.locale === undefined &&
    payload.preferredProvider === undefined &&
    payload.readAloudEnabled === undefined
  ) {
    return NextResponse.json({ error: "No settings provided" }, { status: 400 });
  }

  let preferredProvider: (typeof apiKeyProviderEnum.enumValues)[number] | null = null;

  if (payload.preferredProvider && payload.preferredProvider !== "none") {
    const [providerKey] = await db
      .select({ id: apiKeys.id })
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.userId, session.user.id),
          eq(apiKeys.provider, payload.preferredProvider),
        ),
      )
      .limit(1);

    if (!providerKey) {
      return NextResponse.json({ error: "Preferred provider must match one of your saved API keys." }, { status: 400 });
    }
    preferredProvider = payload.preferredProvider;
  }

  const updates: Partial<typeof user.$inferInsert> = {};
  if (payload.locale !== undefined) {
    updates.locale = payload.locale;
  }
  if (payload.preferredProvider !== undefined) {
    updates.preferredProvider = payload.preferredProvider === "none" ? null : preferredProvider;
  }
  if (payload.readAloudEnabled !== undefined) {
    updates.readAloudEnabled = payload.readAloudEnabled;
  }

  await db
    .update(user)
    .set(updates)
    .where(eq(user.id, session.user.id));

  return NextResponse.json({
    success: true,
    locale: updates.locale,
    preferredProvider: updates.preferredProvider,
    readAloudEnabled: updates.readAloudEnabled,
  });
}
