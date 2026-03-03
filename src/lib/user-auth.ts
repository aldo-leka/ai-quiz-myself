import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export type UserSession = NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
>;

export async function getUserSessionOrNull(): Promise<UserSession | null> {
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
