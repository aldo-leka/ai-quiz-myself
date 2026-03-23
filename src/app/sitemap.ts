import type { MetadataRoute } from "next";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { quizzes } from "@/db/schema";
import { getSiteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getSiteUrl();
  const staticRoutes = [
    "/",
    "/hub",
    "/birthday-trivia-game",
    "/quiz-from-pdf",
    "/movie-trivia-night",
    "/millionaire-game-online",
  ] as const;
  const staticEntries = staticRoutes.map((path) => ({
    url: new URL(path, baseUrl).toString(),
    lastModified: new Date(),
    changeFrequency: path === "/" ? ("weekly" as const) : ("monthly" as const),
    priority: path === "/" ? 1 : 0.8,
  }));

  try {
    const quizRows = await db
      .select({
        id: quizzes.id,
        updatedAt: quizzes.updatedAt,
      })
      .from(quizzes)
      .where(eq(quizzes.isHub, true))
      .orderBy(asc(quizzes.updatedAt));

    return [
      ...staticEntries,
      ...quizRows.map((quiz) => ({
        url: new URL(`/play/${quiz.id}`, baseUrl).toString(),
        lastModified: quiz.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
    ];
  } catch (error) {
    console.warn("Falling back to static sitemap entries because quiz metadata could not be loaded.", error);
    return staticEntries;
  }
}
