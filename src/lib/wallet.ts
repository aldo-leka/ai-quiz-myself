import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { credits } from "@/db/schema";

export async function getWalletBalanceCents(userId: string): Promise<number> {
  const [row] = await db
    .select({ balanceCents: credits.balanceCents })
    .from(credits)
    .where(eq(credits.userId, userId))
    .limit(1);

  return Number(row?.balanceCents ?? 0);
}

export async function ensureWallet(userId: string): Promise<void> {
  await db
    .insert(credits)
    .values({
      userId,
      balanceCents: 0,
    })
    .onConflictDoNothing({
      target: credits.userId,
    });
}

export async function incrementWalletBalanceCents(userId: string, amountCents: number): Promise<void> {
  await db
    .insert(credits)
    .values({
      userId,
      balanceCents: amountCents,
    })
    .onConflictDoUpdate({
      target: credits.userId,
      set: {
        balanceCents: sql`${credits.balanceCents} + ${amountCents}`,
      },
    });
}

export async function tryDeductWalletBalanceCents(params: {
  userId: string;
  amountCents: number;
}): Promise<boolean> {
  const [updated] = await db
    .update(credits)
    .set({
      balanceCents: sql`${credits.balanceCents} - ${params.amountCents}`,
    })
    .where(
      and(
        eq(credits.userId, params.userId),
        gte(credits.balanceCents, params.amountCents),
      ),
    )
    .returning({ userId: credits.userId });

  return Boolean(updated);
}
