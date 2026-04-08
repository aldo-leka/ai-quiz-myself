import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { user } from "@/db/schema";
import { getAdminSessionOrNull } from "@/lib/admin-auth";
import { toAppUrl } from "@/lib/app-base-url";
import { ADMIN_IMPERSONATION_COOKIE_NAME } from "@/lib/user-auth";

const impersonationCookieOptions = {
  httpOnly: true,
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};

function normalizeRedirectTo(value: FormDataEntryValue | null, fallback: string): string {
  if (typeof value !== "string") return fallback;
  return value.startsWith("/") ? value : fallback;
}

function clearImpersonationCookie(response: NextResponse) {
  response.cookies.set({
    ...impersonationCookieOptions,
    name: ADMIN_IMPERSONATION_COOKIE_NAME,
    value: "",
    maxAge: 0,
  });
}

export async function POST(request: Request) {
  const adminSession = await getAdminSessionOrNull();
  if (!adminSession) {
    return NextResponse.redirect(toAppUrl("/"), 303);
  }

  const formData = await request.formData();
  const intent = formData.get("intent");
  const redirectTo = normalizeRedirectTo(
    formData.get("redirectTo"),
    intent === "stop" ? "/admin/users" : "/dashboard",
  );

  if (intent === "stop") {
    const response = NextResponse.redirect(toAppUrl(redirectTo), 303);
    clearImpersonationCookie(response);
    return response;
  }

  const userIdValue = formData.get("userId");
  const userId = typeof userIdValue === "string" ? userIdValue.trim() : "";
  if (!userId) {
    return NextResponse.redirect(toAppUrl("/admin/users"), 303);
  }

  const response = NextResponse.redirect(toAppUrl(redirectTo), 303);

  if (userId === adminSession.user.id) {
    clearImpersonationCookie(response);
    return response;
  }

  const [targetUser] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!targetUser) {
    return NextResponse.redirect(toAppUrl("/admin/users"), 303);
  }

  response.cookies.set({
    ...impersonationCookieOptions,
    name: ADMIN_IMPERSONATION_COOKIE_NAME,
    value: targetUser.id,
  });

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  clearImpersonationCookie(response);
  return response;
}
