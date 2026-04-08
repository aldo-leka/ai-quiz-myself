import { getConfiguredAppBaseUrl } from "@/lib/app-base-url";

export const SITE_NAME = "QuizPlus";
export const SITE_DESCRIPTION =
  "Make instant custom trivia from a topic, article, or PDF, then play solo, couch co-op, or a millionaire-style quiz show.";

export function getSiteUrl(): URL {
  return getConfiguredAppBaseUrl();
}
