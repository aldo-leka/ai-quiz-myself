import { desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { apiKeys, autoRechargeSettings, credits, creditTransactions, platformSettings } from "@/db/schema";
import { user } from "@/db/schema/auth";
import {
  AUTO_RECHARGE_MONTHLY_CAP_MAX_CENTS,
  AUTO_RECHARGE_MONTHLY_CAP_MIN_CENTS,
  AUTO_RECHARGE_TARGET_MAX_CENTS,
  AUTO_RECHARGE_TARGET_MIN_CENTS,
  AUTO_RECHARGE_THRESHOLD_MAX_CENTS,
  AUTO_RECHARGE_THRESHOLD_MIN_CENTS,
  BASE_GENERATION_COST_CENTS,
  LEGACY_AI_GENERATION_COST_SETTING_KEY,
  LEGACY_PDF_GENERATION_COST_SETTING_KEY,
  QUIZ_GENERATION_COST_SETTING_KEY,
  resolveGenerationCostCentsFromSettings,
} from "@/lib/billing";
import { getUserSessionOrNull } from "@/lib/user-auth";

export const runtime = "nodejs";

const autoRechargeSchema = z.object({
  enabled: z.boolean(),
  thresholdCents: z
    .number()
    .int()
    .min(AUTO_RECHARGE_THRESHOLD_MIN_CENTS)
    .max(AUTO_RECHARGE_THRESHOLD_MAX_CENTS),
  targetCents: z
    .number()
    .int()
    .min(AUTO_RECHARGE_TARGET_MIN_CENTS)
    .max(AUTO_RECHARGE_TARGET_MAX_CENTS),
  monthlyCapCents: z
    .number()
    .int()
    .min(AUTO_RECHARGE_MONTHLY_CAP_MIN_CENTS)
    .max(AUTO_RECHARGE_MONTHLY_CAP_MAX_CENTS)
    .nullable(),
});

export async function GET() {
  const session = await getUserSessionOrNull();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [creditRow, transactionRows, settingRows, keyRows, autoRechargeRow, userRow] = await Promise.all([
    db
      .select({ balanceCents: credits.balanceCents })
      .from(credits)
      .where(eq(credits.userId, session.user.id))
      .limit(1),
    db
      .select({
        id: creditTransactions.id,
        amountCents: creditTransactions.amountCents,
        currency: creditTransactions.currency,
        type: creditTransactions.type,
        status: creditTransactions.status,
        description: creditTransactions.description,
        createdAt: creditTransactions.createdAt,
      })
      .from(creditTransactions)
      .where(eq(creditTransactions.userId, session.user.id))
      .orderBy(desc(creditTransactions.createdAt))
      .limit(50),
    db
      .select({
        key: platformSettings.key,
        value: platformSettings.value,
      })
      .from(platformSettings)
      .where(
        inArray(platformSettings.key, [
          QUIZ_GENERATION_COST_SETTING_KEY,
          LEGACY_AI_GENERATION_COST_SETTING_KEY,
          LEGACY_PDF_GENERATION_COST_SETTING_KEY,
        ]),
      ),
    db
      .select({ id: apiKeys.id })
      .from(apiKeys)
      .where(eq(apiKeys.userId, session.user.id))
      .limit(1),
    db
      .select({
        enabled: autoRechargeSettings.enabled,
        thresholdCents: autoRechargeSettings.thresholdCents,
        targetCents: autoRechargeSettings.targetCents,
        monthlyCapCents: autoRechargeSettings.monthlyCapCents,
      })
      .from(autoRechargeSettings)
      .where(eq(autoRechargeSettings.userId, session.user.id))
      .limit(1),
    db
      .select({
        stripeCustomerId: user.stripeCustomerId,
        stripePaymentMethodId: user.stripePaymentMethodId,
      })
      .from(user)
      .where(eq(user.id, session.user.id))
      .limit(1),
  ]);

  const generationCostCents = resolveGenerationCostCentsFromSettings(settingRows);

  return NextResponse.json({
    balanceCents: Number(creditRow[0]?.balanceCents ?? 0),
    hasApiKey: keyRows.length > 0,
    hasPaymentMethod: Boolean(
      userRow[0]?.stripeCustomerId?.startsWith("cus_") &&
      userRow[0]?.stripePaymentMethodId?.startsWith("pm_"),
    ),
    standardGenerationCostCents: generationCostCents,
    pdfGenerationCostCents: generationCostCents,
    baseGenerationCostCents: BASE_GENERATION_COST_CENTS,
    autoRecharge: {
      enabled: autoRechargeRow[0]?.enabled ?? false,
      thresholdCents: Number(autoRechargeRow[0]?.thresholdCents ?? 500),
      targetCents: Number(autoRechargeRow[0]?.targetCents ?? 1000),
      monthlyCapCents:
        autoRechargeRow[0]?.monthlyCapCents !== null &&
        autoRechargeRow[0]?.monthlyCapCents !== undefined
          ? Number(autoRechargeRow[0].monthlyCapCents)
          : null,
    },
    transactions: transactionRows,
  });
}

export async function PATCH(request: Request) {
  const session = await getUserSessionOrNull();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = autoRechargeSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const payload = parsed.data;
  if (payload.targetCents <= payload.thresholdCents) {
    return NextResponse.json(
      { error: "Target balance must be greater than threshold." },
      { status: 400 },
    );
  }

  if (payload.monthlyCapCents !== null && payload.monthlyCapCents < payload.targetCents) {
    return NextResponse.json(
      { error: "Monthly cap must be greater than or equal to target balance." },
      { status: 400 },
    );
  }

  if (payload.enabled) {
    const [userRow] = await db
      .select({
        stripeCustomerId: user.stripeCustomerId,
        stripePaymentMethodId: user.stripePaymentMethodId,
      })
      .from(user)
      .where(eq(user.id, session.user.id))
      .limit(1);

    const hasPaymentMethod = Boolean(
      userRow?.stripeCustomerId?.startsWith("cus_") &&
      userRow?.stripePaymentMethodId?.startsWith("pm_"),
    );

    if (!hasPaymentMethod) {
      return NextResponse.json(
        { error: "No payment method on file. Complete a top-up first." },
        { status: 412 },
      );
    }
  }

  await db
    .insert(autoRechargeSettings)
    .values({
      userId: session.user.id,
      enabled: payload.enabled,
      thresholdCents: payload.thresholdCents,
      targetCents: payload.targetCents,
      monthlyCapCents: payload.monthlyCapCents,
    })
    .onConflictDoUpdate({
      target: autoRechargeSettings.userId,
      set: {
        enabled: payload.enabled,
        thresholdCents: payload.thresholdCents,
        targetCents: payload.targetCents,
        monthlyCapCents: payload.monthlyCapCents,
      },
    });

  return NextResponse.json({
    success: true,
    autoRecharge: payload,
  });
}
