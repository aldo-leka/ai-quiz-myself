import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { db } from "@/db";
import { billingWebhookEvents, creditTransactions } from "@/db/schema";
import { user } from "@/db/schema/auth";
import { requireEnv } from "@/lib/env";
import { getStripeClient } from "@/lib/stripe";
import { incrementWalletBalanceCents } from "@/lib/wallet";

export const runtime = "nodejs";

function metadataString(metadata: Record<string, string>, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function metadataInt(metadata: Record<string, string>, key: string): number | null {
  const raw = metadata[key];
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

async function resolveUserIdForIntent(intent: Stripe.PaymentIntent): Promise<string | null> {
  const userIdFromMetadata = metadataString(intent.metadata, "user_id");
  if (userIdFromMetadata) return userIdFromMetadata;

  if (typeof intent.customer !== "string") {
    return null;
  }

  const [userRow] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.stripeCustomerId, intent.customer))
    .limit(1);

  return userRow?.id ?? null;
}

async function handlePaymentIntentSucceeded(intent: Stripe.PaymentIntent) {
  const userId = await resolveUserIdForIntent(intent);
  if (!userId) {
    return NextResponse.json(
      { error: "Could not resolve user for payment_intent.succeeded" },
      { status: 400 },
    );
  }

  const transactionId = metadataString(intent.metadata, "transaction_id");
  const source = metadataString(intent.metadata, "source");
  const type = source === "auto_reload" ? "auto_reload" : "purchase";

  const walletCreditCents =
    metadataInt(intent.metadata, "credit_amount_cents") ??
    intent.amount_received ??
    intent.amount;

  await incrementWalletBalanceCents(userId, walletCreditCents);

  const userUpdates: Partial<typeof user.$inferInsert> = {};
  if (typeof intent.customer === "string" && intent.customer.startsWith("cus_")) {
    userUpdates.stripeCustomerId = intent.customer;
  }
  if (typeof intent.payment_method === "string" && intent.payment_method.startsWith("pm_")) {
    userUpdates.stripePaymentMethodId = intent.payment_method;
  }
  if (Object.keys(userUpdates).length > 0) {
    await db
      .update(user)
      .set(userUpdates)
      .where(eq(user.id, userId));
  }

  if (transactionId) {
    const [updatedTransaction] = await db
      .update(creditTransactions)
      .set({
        status: "completed",
        type,
        amountCents: walletCreditCents,
        currency: intent.currency,
        description:
          type === "auto_reload"
            ? "Auto wallet reload (completed)"
            : "Manual wallet top-up (completed)",
        metadata: {
          source,
          stripePaymentIntentId: intent.id,
          stripeCustomerId: intent.customer,
          stripePaymentMethodId: intent.payment_method,
          walletCreditCents,
          amountReceivedCents: intent.amount_received ?? null,
          amountChargedCents: intent.amount,
        },
      })
      .where(
        and(
          eq(creditTransactions.id, transactionId),
          eq(creditTransactions.userId, userId),
        ),
      )
      .returning({ id: creditTransactions.id });

    if (updatedTransaction) {
      return NextResponse.json({ ok: true, credited: walletCreditCents });
    }
  }

  await db.insert(creditTransactions).values({
    userId,
    amountCents: walletCreditCents,
    currency: intent.currency,
    type,
    status: "completed",
    description:
      type === "auto_reload" ? "Auto wallet reload (completed)" : "Manual wallet top-up (completed)",
    metadata: {
      source,
      stripePaymentIntentId: intent.id,
      stripeCustomerId: intent.customer,
      stripePaymentMethodId: intent.payment_method,
      walletCreditCents,
      amountReceivedCents: intent.amount_received ?? null,
      amountChargedCents: intent.amount,
    },
  });

  return NextResponse.json({ ok: true, credited: walletCreditCents });
}

async function handlePaymentIntentFailed(intent: Stripe.PaymentIntent) {
  const userId = await resolveUserIdForIntent(intent);
  const transactionId = metadataString(intent.metadata, "transaction_id");

  if (userId && transactionId) {
    await db
      .update(creditTransactions)
      .set({
        status: "failed",
        currency: intent.currency,
        description: "Top-up payment failed",
        metadata: {
          stripePaymentIntentId: intent.id,
          stripeCustomerId: intent.customer,
          stripePaymentMethodId: intent.payment_method,
          failureCode: intent.last_payment_error?.code ?? null,
          failureMessage: intent.last_payment_error?.message ?? null,
        },
      })
      .where(
        and(
          eq(creditTransactions.id, transactionId),
          eq(creditTransactions.userId, userId),
        ),
      );
  }

  return NextResponse.json({ ok: true, failed: true });
}

async function handleCheckoutSessionCompleted(checkoutSession: Stripe.Checkout.Session) {
  const userId = metadataString(checkoutSession.metadata ?? {}, "user_id");
  if (!userId) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const userUpdates: Partial<typeof user.$inferInsert> = {};
  if (typeof checkoutSession.customer === "string" && checkoutSession.customer.startsWith("cus_")) {
    userUpdates.stripeCustomerId = checkoutSession.customer;
  }

  if (typeof checkoutSession.payment_intent === "string") {
    const stripe = getStripeClient();
    const paymentIntent = await stripe.paymentIntents.retrieve(checkoutSession.payment_intent);
    if (
      typeof paymentIntent.payment_method === "string" &&
      paymentIntent.payment_method.startsWith("pm_")
    ) {
      userUpdates.stripePaymentMethodId = paymentIntent.payment_method;
    }
  }

  if (Object.keys(userUpdates).length > 0) {
    await db
      .update(user)
      .set(userUpdates)
      .where(eq(user.id, userId));
  }

  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  const stripe = getStripeClient();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 });
  }

  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      payload,
      signature,
      requireEnv("STRIPE_WEBHOOK_SECRET"),
    );
  } catch {
    return NextResponse.json({ error: "Invalid Stripe webhook signature" }, { status: 400 });
  }

  const [storedEvent] = await db
    .insert(billingWebhookEvents)
    .values({
      provider: "stripe",
      eventId: event.id,
      eventType: event.type,
    })
    .onConflictDoNothing({
      target: [billingWebhookEvents.provider, billingWebhookEvents.eventId],
    })
    .returning({ id: billingWebhookEvents.id });

  if (!storedEvent) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  if (event.type === "payment_intent.succeeded") {
    return handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
  }

  if (event.type === "payment_intent.payment_failed") {
    return handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
  }

  if (event.type === "checkout.session.completed") {
    return handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
  }

  return NextResponse.json({ ok: true, ignored: true });
}
