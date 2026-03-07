import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { db } from "@/db";
import { user } from "@/db/schema";
import { isAdminEmail } from "@/lib/admin";
import { auth } from "@/lib/auth";

export type UserSession = NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
>;

export const ADMIN_IMPERSONATION_COOKIE_NAME = "quizplus_admin_impersonation_user_id";

export type DashboardViewerContext = {
  authSession: UserSession;
  session: UserSession;
  canAccessAdmin: boolean;
  impersonation: {
    adminEmail: string | null;
    targetUserId: string;
    targetName: string;
    targetEmail: string;
  } | null;
};

async function getAuthSessionOrNull(): Promise<UserSession | null> {
  let session: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;

  try {
    session = await auth.api.getSession({
      headers: new Headers(await headers()),
    });
  } catch {
    session = null;
  }

  if (!session?.user?.id) return null;
  return session;
}

function isAdminSession(session: UserSession): boolean {
  return Boolean(session.user.isAdmin) || isAdminEmail(session.user.email);
}

export async function getDashboardViewerContextOrNull(): Promise<DashboardViewerContext | null> {
  const authSession = await getAuthSessionOrNull();
  if (!authSession?.user?.id) {
    return null;
  }

  const canAccessAdmin = isAdminSession(authSession);
  const cookieStore = await cookies();
  const impersonatedUserId =
    cookieStore.get(ADMIN_IMPERSONATION_COOKIE_NAME)?.value.trim() ?? "";

  if (!canAccessAdmin || !impersonatedUserId || impersonatedUserId === authSession.user.id) {
    return {
      authSession,
      session: authSession,
      canAccessAdmin,
      impersonation: null,
    };
  }

  const [impersonatedUser] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      image: user.image,
      avatarUrl: user.avatarUrl,
      isAdmin: user.isAdmin,
      locale: user.locale,
      preferredProvider: user.preferredProvider,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    })
    .from(user)
    .where(eq(user.id, impersonatedUserId))
    .limit(1);

  if (!impersonatedUser) {
    return {
      authSession,
      session: authSession,
      canAccessAdmin,
      impersonation: null,
    };
  }

  const session = {
    ...authSession,
    user: {
      ...authSession.user,
      id: impersonatedUser.id,
      name: impersonatedUser.name,
      email: impersonatedUser.email,
      emailVerified: impersonatedUser.emailVerified,
      image: impersonatedUser.image,
      avatarUrl: impersonatedUser.avatarUrl,
      isAdmin: impersonatedUser.isAdmin,
      locale: impersonatedUser.locale,
      preferredProvider: impersonatedUser.preferredProvider,
      createdAt: impersonatedUser.createdAt,
      updatedAt: impersonatedUser.updatedAt,
    },
  } as UserSession;

  return {
    authSession,
    session,
    canAccessAdmin,
    impersonation: {
      adminEmail: authSession.user.email ?? null,
      targetUserId: impersonatedUser.id,
      targetName: impersonatedUser.name,
      targetEmail: impersonatedUser.email,
    },
  };
}

export async function getUserSessionOrNull(): Promise<UserSession | null> {
  const viewerContext = await getDashboardViewerContextOrNull();
  return viewerContext?.session ?? null;
}
