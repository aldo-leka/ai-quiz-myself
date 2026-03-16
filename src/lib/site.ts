export const SITE_NAME = "QuizPlus";
export const SITE_DESCRIPTION =
  "Make instant custom trivia from a topic, article, or PDF, then play solo, couch co-op, or a millionaire-style quiz show.";

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
