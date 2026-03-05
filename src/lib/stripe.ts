import Stripe from "stripe";
import { requireEnv } from "@/lib/env";

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (stripeClient) {
    return stripeClient;
  }

  stripeClient = new Stripe(requireEnv("STRIPE_SECRET_KEY"));
  return stripeClient;
}

export function getStripeDefaultCurrency(): "usd" | "eur" {
  return process.env.STRIPE_DEFAULT_CURRENCY?.trim().toLowerCase() === "usd" ? "usd" : "eur";
}

function isActiveStripeCustomer(
  customer: Stripe.Customer | Stripe.DeletedCustomer,
): customer is Stripe.Customer {
  return !("deleted" in customer && customer.deleted);
}

export async function ensureStripeCustomer(params: {
  userId: string;
  userEmail: string;
  existingCustomerId?: string | null;
}): Promise<string> {
  const stripe = getStripeClient();

  if (params.existingCustomerId?.startsWith("cus_")) {
    return params.existingCustomerId;
  }

  const customers = await stripe.customers.list({
    email: params.userEmail,
    limit: 20,
  });

  const matchedByUserId = customers.data.find(
    (customer) =>
      isActiveStripeCustomer(customer) && customer.metadata?.user_id === params.userId,
  );

  if (matchedByUserId && isActiveStripeCustomer(matchedByUserId)) {
    return matchedByUserId.id;
  }

  const firstActive = customers.data.find((customer) => isActiveStripeCustomer(customer));
  if (firstActive && isActiveStripeCustomer(firstActive)) {
    return firstActive.id;
  }

  const created = await stripe.customers.create({
    email: params.userEmail,
    metadata: {
      user_id: params.userId,
    },
  });

  return created.id;
}

export async function createTopUpCheckoutSession(params: {
  userId: string;
  userEmail: string;
  amountCents: number;
  currency?: "usd" | "eur";
  successUrl: string;
  cancelUrl: string;
  customerId?: string | null;
  metadata?: Record<string, string>;
}) {
  const stripe = getStripeClient();
  const currency = params.currency ?? getStripeDefaultCurrency();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: params.customerId ?? undefined,
    customer_email: params.customerId ? undefined : params.userEmail,
    success_url: `${params.successUrl}${params.successUrl.includes("?") ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: params.cancelUrl,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency,
          unit_amount: params.amountCents,
          product_data: {
            name: "QuizPlus Credits Top-up",
          },
        },
      },
    ],
    metadata: params.metadata,
    payment_intent_data: {
      setup_future_usage: "off_session",
      metadata: params.metadata,
    },
  });

  return session;
}

export async function createBillingPortalSession(params: {
  customerId: string;
  returnUrl: string;
}) {
  const stripe = getStripeClient();
  return stripe.billingPortal.sessions.create({
    customer: params.customerId,
    return_url: params.returnUrl,
  });
}

export async function createOffSessionAutoRechargePaymentIntent(params: {
  customerId: string;
  paymentMethodId: string;
  amountCents: number;
  currency?: "usd" | "eur";
  metadata?: Record<string, string>;
}) {
  const stripe = getStripeClient();
  return stripe.paymentIntents.create({
    amount: params.amountCents,
    currency: params.currency ?? getStripeDefaultCurrency(),
    customer: params.customerId,
    payment_method: params.paymentMethodId,
    confirm: true,
    off_session: true,
    metadata: params.metadata,
  });
}
