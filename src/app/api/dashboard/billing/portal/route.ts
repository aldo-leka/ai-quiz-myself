import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { user } from "@/db/schema/auth";
import { toAppUrl } from "@/lib/app-base-url";
import { createBillingPortalSession, ensureStripeCustomer } from "@/lib/stripe";
import { getUserSessionOrNull } from "@/lib/user-auth";

export const runtime = "nodejs";

export async function POST() {
  const session = await getUserSessionOrNull();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [userRow] = await db
    .select({
      stripeCustomerId: user.stripeCustomerId,
    })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1);

  const stripeCustomerId = await ensureStripeCustomer({
    userId: session.user.id,
    userEmail: session.user.email,
    existingCustomerId: userRow?.stripeCustomerId ?? null,
  });

  if (stripeCustomerId !== userRow?.stripeCustomerId) {
    await db
      .update(user)
      .set({ stripeCustomerId })
      .where(eq(user.id, session.user.id));
  }

  const portal = await createBillingPortalSession({
    customerId: stripeCustomerId,
    returnUrl: toAppUrl("/dashboard/billing").toString(),
  });

  return NextResponse.json({ url: portal.url });
}
