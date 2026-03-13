import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { quizGameModeEnum } from "@/db/schema";
import { auth } from "@/lib/auth";
import { parseRecommendationExcludeIds, recommendQuizId } from "@/lib/quiz-recommendation-service";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  mode: z.enum(quizGameModeEnum.enumValues),
  currentQuizId: z.string().uuid(),
  exclude: z.string().optional(),
});

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const queryResult = querySchema.safeParse({
    mode: searchParams.get("mode"),
    currentQuizId: searchParams.get("currentQuizId"),
    exclude: searchParams.get("exclude") ?? undefined,
  });

  if (!queryResult.success) {
    return NextResponse.json(
      {
        error: "Invalid query",
        issues: queryResult.error.issues,
      },
      { status: 400 },
    );
  }

  const query = queryResult.data;

  let session: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
  try {
    session = await auth.api.getSession({
      headers: new Headers(await headers()),
    });
  } catch {
    session = null;
  }

  const clientExcludeIds = parseRecommendationExcludeIds(query.exclude);
  const userId = session?.user?.id ?? null;
  const recommendation = await recommendQuizId({
    mode: query.mode,
    userId,
    currentQuizId: query.currentQuizId,
    excludeIds: clientExcludeIds,
  });

  if (!recommendation) {
    return NextResponse.json({ error: "No matching quiz found" }, { status: 404 });
  }

  return NextResponse.json(
    {
      quizId: recommendation.id,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
