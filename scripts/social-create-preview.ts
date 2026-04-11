import "dotenv/config";
import { reserveSocialPreview } from "@/lib/social/service";

function readFlag(name: string) {
  const flag = `--${name}`;
  const index = process.argv.findIndex((value) => value === flag);
  if (index < 0) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

async function main() {
  const pipelineSlug = readFlag("pipeline");
  const quizId = readFlag("quizId");
  const baseUrl = readFlag("baseUrl") ?? process.env.SOCIAL_PREVIEW_BASE_URL ?? "http://127.0.0.1:3000";

  const result = await reserveSocialPreview({
    pipelineSlug: pipelineSlug ?? undefined,
    quizId: quizId ?? undefined,
    baseUrl,
  });

  if (!result.socialPost) {
    console.log(
      JSON.stringify(
        {
          status: "empty",
          pipeline: result.pipeline.slug,
          remainingEligible: result.remainingEligible,
          nudge: result.nudge,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(
    JSON.stringify(
      {
        status: "ok",
        pipeline: result.pipeline.slug,
        remainingEligible: result.remainingEligible,
        nudge: result.nudge,
        socialPostId: result.socialPost.id,
        previewToken: result.socialPost.previewToken,
        reviewUrl: result.socialPost.previewManifest?.reviewUrl ?? null,
        playUrl: result.socialPost.playUrl,
        quiz: {
          id: result.socialPost.quizSnapshot.quizId,
          title: result.socialPost.quizSnapshot.title,
          gameMode: result.socialPost.quizSnapshot.gameMode,
          selectedQuestionCount: result.socialPost.quizSnapshot.selectedQuestionCount,
        },
        variants: result.socialPost.previewManifest?.variants ?? [],
      },
      null,
      2,
    ),
  );
}

void main();
