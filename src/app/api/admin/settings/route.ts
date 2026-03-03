import { asc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { platformSettings } from "@/db/schema";
import { getAdminSessionOrNull } from "@/lib/admin-auth";

const updateSettingSchema = z.object({
  key: z.string().min(1),
  value: z.string().min(1),
  description: z.string().nullable().optional(),
});

const patchSettingsSchema = z.object({
  updates: z.array(updateSettingSchema).min(1),
});

export async function GET() {
  const adminSession = await getAdminSessionOrNull();
  if (!adminSession) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const settings = await db
    .select({
      key: platformSettings.key,
      value: platformSettings.value,
      description: platformSettings.description,
      updatedAt: platformSettings.updatedAt,
    })
    .from(platformSettings)
    .orderBy(asc(platformSettings.key));

  return NextResponse.json({ settings });
}

export async function PATCH(request: Request) {
  const adminSession = await getAdminSessionOrNull();
  if (!adminSession) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = patchSettingsSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { updates } = parsed.data;

  for (const update of updates) {
    const setBase = {
      value: update.value,
      updatedAt: new Date(),
    };
    const setWithDescription =
      update.description !== undefined
        ? { ...setBase, description: update.description }
        : setBase;

    await db
      .insert(platformSettings)
      .values({
        key: update.key,
        value: update.value,
        description: update.description ?? null,
      })
      .onConflictDoUpdate({
        target: platformSettings.key,
        set: update.description !== undefined
          ? {
              ...setWithDescription,
            }
          : {
              ...setBase,
            },
      });
  }

  const settings = await db
    .select({
      key: platformSettings.key,
      value: platformSettings.value,
      description: platformSettings.description,
      updatedAt: platformSettings.updatedAt,
    })
    .from(platformSettings)
    .orderBy(asc(platformSettings.key));

  return NextResponse.json({ success: true, settings });
}
