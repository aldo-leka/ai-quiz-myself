import { logger, task } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { generateAndPersistWwtbamHostHints } from "@/lib/wwtbam-host-hint-service";

const payloadSchema = z.object({
  quizId: z.string().uuid(),
});

export const generateWwtbamHostHintsTask = task({
  id: "generate-wwtbam-host-hints",
  maxDuration: 1800,
  run: async (payload: z.infer<typeof payloadSchema>) => {
    const parsed = payloadSchema.parse(payload);
    const apiKey = process.env.OPENAI_API_KEY?.trim();

    if (!apiKey) {
      logger.warn("Skipping WWTBAM host hint generation because OPENAI_API_KEY is missing", {
        quizId: parsed.quizId,
      });
      return { ok: false as const, reason: "missing_openai_api_key" };
    }

    const result = await generateAndPersistWwtbamHostHints({
      quizId: parsed.quizId,
      apiKey,
    });

    if (!result.ok) {
      logger.warn("Skipping WWTBAM host hint generation", {
        quizId: parsed.quizId,
        reason: result.reason,
      });
      return result;
    }

    logger.log("Generated WWTBAM host hints", {
      quizId: parsed.quizId,
      generatedCount: result.generatedCount,
      updatedCount: result.updatedCount,
    });

    return result;
  },
});
