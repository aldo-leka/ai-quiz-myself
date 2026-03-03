import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { getUserSessionOrNull } from "@/lib/user-auth";

type RouteContext = {
  params: Promise<{ keyId: string }>;
};

export const runtime = "nodejs";

export async function DELETE(_: Request, { params }: RouteContext) {
  const session = await getUserSessionOrNull();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { keyId } = await params;

  const [deleted] = await db
    .delete(apiKeys)
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, session.user.id)))
    .returning({ id: apiKeys.id });

  if (!deleted) {
    return NextResponse.json({ error: "API key not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
