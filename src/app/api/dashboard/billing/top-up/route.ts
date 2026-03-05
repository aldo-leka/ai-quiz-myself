import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { creditTransactions } from "@/db/schema";
import { user } from "@/db/schema/auth";
import { TOP_UP_MAX_CENTS, TOP_UP_MIN_CENTS } from "@/lib/billing";
import {
  createTopUpCheckoutSession,
  ensureStripeCustomer,
  getStripeDefaultCurrency,
} from "@/lib/stripe";
import { getUserSessionOrNull } from "@/lib/user-auth";

export const runtime = "nodejs";

const requestSchema = z.object({
  amountCents: z.number().int().min(TOP_UP_MIN_CENTS).max(TOP_UP_MAX_CENTS),
  currency: z.enum(["usd", "eur"]).optional(),
  returnPath: z
    .string()
    .trim()
    .regex(/^\/dashboard(?:\/[a-zA-Z0-9\-/]*)?$/)
    .optional(),
});

export async function POST(request: Request) {
  let pendingTransactionId: string | null = null;

  try {
    const session = await getUserSessionOrNull();
    if (!session?.user?.id || !session.user.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const payload = parsed.data;
    const orgDefaultCurrency = getStripeDefaultCurrency();
    const checkoutCurrency = payload.currency ?? orgDefaultCurrency;
    const returnPath = payload.returnPath ?? "/dashboard/billing";
    const baseUrl = process.env.NEXT_PUBLIC_BETTER_AUTH_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
    const successUrl = `${baseUrl}${returnPath}?topup=success`;
    const cancelUrl = `${baseUrl}${returnPath}?topup=cancel`;

    const [userRow] = await db
      .select({
        stripeCustomerId: user.stripeCustomerId,
      })
      .from(user)
      .where(eq(user.id, session.user.id))
      .limit(1);

    const existingStripeCustomerId =
      userRow?.stripeCustomerId && userRow.stripeCustomerId.startsWith("cus_")
        ? userRow.stripeCustomerId
        : null;

    const stripeCustomerId = await ensureStripeCustomer({
      userId: session.user.id,
      userEmail: session.user.email,
      existingCustomerId: existingStripeCustomerId,
    });

    if (stripeCustomerId !== existingStripeCustomerId) {
      await db
        .update(user)
        .set({
          stripeCustomerId,
        })
        .where(eq(user.id, session.user.id));
    }

    const [pendingTransaction] = await db
      .insert(creditTransactions)
      .values({
        userId: session.user.id,
        amountCents: payload.amountCents,
        currency: checkoutCurrency,
        type: "purchase",
        status: "pending",
        description: "Manual wallet top-up (pending)",
        metadata: {
          source: "manual_topup",
        },
      })
      .returning({ id: creditTransactions.id });
    pendingTransactionId = pendingTransaction.id;

    const checkout = await createTopUpCheckoutSession({
      userId: session.user.id,
      userEmail: session.user.email,
      amountCents: payload.amountCents,
      currency: checkoutCurrency,
      successUrl,
      cancelUrl,
      customerId: stripeCustomerId,
      metadata: {
        user_id: session.user.id,
        transaction_id: pendingTransaction.id,
        source: "manual_topup",
        credit_amount_cents: String(payload.amountCents),
      },
    });

    await db
      .update(creditTransactions)
      .set({
        stripeCheckoutId: checkout.id,
      })
      .where(eq(creditTransactions.id, pendingTransactionId));

    return NextResponse.json({
      checkoutId: checkout.id,
      checkoutUrl: checkout.url,
    });
  } catch (error) {
    if (pendingTransactionId) {
      await db
        .update(creditTransactions)
        .set({
          status: "failed",
          description: "Manual wallet top-up (failed to create Stripe checkout)",
        })
        .where(eq(creditTransactions.id, pendingTransactionId));
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create checkout session",
      },
      { status: 500 },
    );
  }
}
