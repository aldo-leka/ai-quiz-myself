import { cookies } from "next/headers";
import { z } from "zod";

export const ANON_COOKIE_NAME = "quizplus_anon_id";
export const ANON_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 * 2;

export async function getAnonIdFromCookie() {
  const cookieStore = await cookies();
  const parsedAnonId = z.string().uuid().safeParse(cookieStore.get(ANON_COOKIE_NAME)?.value);
  return parsedAnonId.success ? parsedAnonId.data : null;
}

export async function getOrCreateAnonId() {
  const existingAnonId = await getAnonIdFromCookie();

  if (existingAnonId) {
    return {
      anonId: existingAnonId,
      shouldSetCookie: false,
    };
  }

  return {
    anonId: crypto.randomUUID(),
    shouldSetCookie: true,
  };
}
