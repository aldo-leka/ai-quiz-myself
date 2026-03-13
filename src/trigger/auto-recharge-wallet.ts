import { and, desc, eq, gte, sql } from "drizzle-orm";
import { logger, schedules } from "@trigger.dev/sdk/v3";
import { db } from "@/db";
import { autoRechargeSettings, creditTransactions, credits } from "@/db/schema";
import { user } from "@/db/schema/auth";
import { createOffSessionAutoRechargePaymentIntent, getStripeDefaultCurrency } from "@/lib/stripe";

const ENABLED_USERS_BATCH = 200;
const DUPLICATE_PENDING_LOOKBACK_HOURS = 6;
const FAILED_RETRY_COOLDOWN_HOURS = 6;

function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 500);
  }

  return "Unknown error";
}

function classifyHardAutoRechargeFailure(error: unknown): {
  disableAutoRecharge: boolean;
  clearCustomerId: boolean;
  clearPaymentMethodId: boolean;
} | null {
  const message = getErrorMessage(error).toLowerCase();
  const errorCode =
    typeof error === "object" && error && "code" in error ? String(error.code) : null;

  const missingCustomer =
    message.includes("no such customer") ||
    message.includes("customer") && message.includes("resource_missing");
  const missingPaymentMethod =
    message.includes("no such paymentmethod") ||
    message.includes("no such payment method") ||
    (message.includes("paymentmethod") && message.includes("resource_missing"));

  if (errorCode !== "resource_missing" && !missingCustomer && !missingPaymentMethod) {
    return null;
  }

  return {
    disableAutoRecharge: true,
    clearCustomerId: missingCustomer,
    clearPaymentMethodId: missingCustomer || missingPaymentMethod || errorCode === "resource_missing",
  };
}

export const autoRechargeWalletTask = schedules.task({
  id: "auto-recharge-wallet",
  cron: "* * * * *",
  maxDuration: 900,
  run: async () => {
    const now = new Date();
    const monthStart = startOfUtcMonth(now);
    const pendingWindowStart = new Date(
      now.getTime() - DUPLICATE_PENDING_LOOKBACK_HOURS * 60 * 60 * 1000,
    );
    const recentFailureWindowStart = new Date(
      now.getTime() - FAILED_RETRY_COOLDOWN_HOURS * 60 * 60 * 1000,
    );

    const configuredUsers = await db
      .select({
        userId: autoRechargeSettings.userId,
        thresholdCents: autoRechargeSettings.thresholdCents,
        targetCents: autoRechargeSettings.targetCents,
        monthlyCapCents: autoRechargeSettings.monthlyCapCents,
        stripeCustomerId: user.stripeCustomerId,
        stripePaymentMethodId: user.stripePaymentMethodId,
        balanceCents: credits.balanceCents,
      })
      .from(autoRechargeSettings)
      .innerJoin(user, eq(autoRechargeSettings.userId, user.id))
      .leftJoin(credits, eq(credits.userId, autoRechargeSettings.userId))
      .where(eq(autoRechargeSettings.enabled, true))
      .limit(ENABLED_USERS_BATCH);

    if (configuredUsers.length === 0) {
      logger.log("No enabled auto recharge users found");
      return {
        ok: true,
        checked: 0,
        attempted: 0,
        created: 0,
        skipped: 0,
      };
    }

    let attempted = 0;
    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (const account of configuredUsers) {
      const balanceCents = Number(account.balanceCents ?? 0);
      const thresholdCents = Number(account.thresholdCents);
      const targetCents = Number(account.targetCents);
      const monthlyCapCents =
        account.monthlyCapCents === null || account.monthlyCapCents === undefined
          ? null
          : Number(account.monthlyCapCents);

      if (
        !account.stripeCustomerId ||
        !account.stripePaymentMethodId ||
        !account.stripeCustomerId.startsWith("cus_") ||
        !account.stripePaymentMethodId.startsWith("pm_")
      ) {
        skipped += 1;
        continue;
      }

      if (balanceCents > thresholdCents) {
        skipped += 1;
        continue;
      }

      let rechargeAmountCents = targetCents - balanceCents;
      if (rechargeAmountCents <= 0) {
        skipped += 1;
        continue;
      }

      const [existingPending] = await db
        .select({ id: creditTransactions.id })
        .from(creditTransactions)
        .where(
          and(
            eq(creditTransactions.userId, account.userId),
            eq(creditTransactions.type, "auto_reload"),
            eq(creditTransactions.status, "pending"),
            gte(creditTransactions.createdAt, pendingWindowStart),
          ),
        )
        .orderBy(desc(creditTransactions.createdAt))
        .limit(1);

      if (existingPending) {
        skipped += 1;
        continue;
      }

      const [recentFailure] = await db
        .select({ id: creditTransactions.id })
        .from(creditTransactions)
        .where(
          and(
            eq(creditTransactions.userId, account.userId),
            eq(creditTransactions.type, "auto_reload"),
            eq(creditTransactions.status, "failed"),
            gte(creditTransactions.createdAt, recentFailureWindowStart),
          ),
        )
        .orderBy(desc(creditTransactions.createdAt))
        .limit(1);

      if (recentFailure) {
        skipped += 1;
        continue;
      }

      if (monthlyCapCents !== null) {
        const [spentRow] = await db
          .select({
            spentCents:
              sql<number>`coalesce(sum(${creditTransactions.amountCents}), 0)::int`,
          })
          .from(creditTransactions)
          .where(
            and(
              eq(creditTransactions.userId, account.userId),
              eq(creditTransactions.type, "auto_reload"),
              gte(creditTransactions.createdAt, monthStart),
              sql`${creditTransactions.status} in ('pending', 'completed')`,
            ),
          );

        const spentCents = Number(spentRow?.spentCents ?? 0);
        const remainingCapCents = monthlyCapCents - spentCents;
        if (remainingCapCents <= 0) {
          skipped += 1;
          continue;
        }
        if (rechargeAmountCents > remainingCapCents) {
          rechargeAmountCents = remainingCapCents;
        }
        if (rechargeAmountCents <= 0) {
          skipped += 1;
          continue;
        }
      }

      attempted += 1;

      const [pendingTransaction] = await db
        .insert(creditTransactions)
        .values({
          userId: account.userId,
          amountCents: rechargeAmountCents,
          currency: getStripeDefaultCurrency(),
          type: "auto_reload",
          status: "pending",
          description: "Auto wallet reload (pending)",
          metadata: {
            source: "auto_reload",
            trigger: "scheduled",
            thresholdCents,
            targetCents,
            balanceAtChargeCents: balanceCents,
          },
        })
        .returning({ id: creditTransactions.id });

      try {
        const intent = await createOffSessionAutoRechargePaymentIntent({
          customerId: account.stripeCustomerId,
          paymentMethodId: account.stripePaymentMethodId,
          amountCents: rechargeAmountCents,
          currency: getStripeDefaultCurrency(),
          metadata: {
            user_id: account.userId,
            transaction_id: pendingTransaction.id,
            source: "auto_reload",
            credit_amount_cents: String(rechargeAmountCents),
          },
        });

        await db
          .update(creditTransactions)
          .set({
            stripeOrderId: intent.id,
            metadata: {
              source: "auto_reload",
              trigger: "scheduled",
              stripePaymentIntentId: intent.id,
              thresholdCents,
              targetCents,
              balanceAtChargeCents: balanceCents,
            },
          })
          .where(eq(creditTransactions.id, pendingTransaction.id));

        created += 1;
      } catch (error) {
        failed += 1;
        const errorMessage = getErrorMessage(error);
        const hardFailure = classifyHardAutoRechargeFailure(error);

        await db
          .update(creditTransactions)
          .set({
            status: "failed",
            description: hardFailure
              ? "Auto wallet reload failed and was disabled"
              : "Auto wallet reload failed",
            metadata: {
              source: "auto_reload",
              trigger: "scheduled",
              thresholdCents,
              targetCents,
              balanceAtChargeCents: balanceCents,
              error: errorMessage,
              autoDisabled: Boolean(hardFailure),
              stalePaymentReference: Boolean(hardFailure),
            },
          })
          .where(eq(creditTransactions.id, pendingTransaction.id));

        if (hardFailure) {
          await db
            .update(autoRechargeSettings)
            .set({
              enabled: false,
            })
            .where(eq(autoRechargeSettings.userId, account.userId));

          const userPatch: Partial<typeof user.$inferInsert> = {};
          if (hardFailure.clearCustomerId) {
            userPatch.stripeCustomerId = null;
          }
          if (hardFailure.clearPaymentMethodId) {
            userPatch.stripePaymentMethodId = null;
          }

          if (Object.keys(userPatch).length > 0) {
            await db.update(user).set(userPatch).where(eq(user.id, account.userId));
          }

          logger.warn("Disabled auto recharge after unrecoverable Stripe error", {
            userId: account.userId,
            error: errorMessage,
            clearCustomerId: hardFailure.clearCustomerId,
            clearPaymentMethodId: hardFailure.clearPaymentMethodId,
          });
        }
      }
    }

    logger.log("Auto recharge run completed", {
      checked: configuredUsers.length,
      attempted,
      created,
      skipped,
      failed,
    });

    return {
      ok: true,
      checked: configuredUsers.length,
      attempted,
      created,
      skipped,
      failed,
    };
  },
});
