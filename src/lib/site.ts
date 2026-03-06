export const SITE_NAME = "QuizPlus";
export const SITE_DESCRIPTION =
  "AI-generated quizzes for solo play, couch co-op, and WWTBAM, with a public hub, user dashboard, and creator tools.";

export function getSiteUrl(): URL {
  const candidate =
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL ??
    process.env.BETTER_AUTH_URL ??
    "http://localhost:3000";

  try {
    return new URL(candidate);
  } catch {
    return new URL("http://localhost:3000");
  }
}
