import "dotenv/config";
import {
  buildHostSpeechText,
  buildQuizTtsObjectKey,
  getQuizTtsContentType,
  getQuizTtsFormat,
  getQuizTtsModel,
  getQuizTtsVoice,
  synthesizeQuizSpeech,
} from "@/lib/quiz-tts";
import { downloadR2ObjectBuffer, isR2Configured, uploadR2ObjectBuffer } from "@/lib/r2";
import { getWwtbamHostPrewarmTexts } from "@/lib/wwtbam-host";

async function main() {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new Error("OPENAI_API_KEY is required to prewarm WWTBAM host audio.");
  }

  if (!isR2Configured()) {
    throw new Error("R2 must be configured to prewarm WWTBAM host audio.");
  }

  const model = getQuizTtsModel();
  const voice = getQuizTtsVoice("wwtbam");
  const format = getQuizTtsFormat();
  const contentType = getQuizTtsContentType(format);
  const texts = getWwtbamHostPrewarmTexts();

  let created = 0;
  let skipped = 0;

  for (const text of texts) {
    const speechText = buildHostSpeechText(text);
    const objectKey = buildQuizTtsObjectKey({
      segment: "host",
      gameMode: "wwtbam",
      model,
      voice,
      format,
      speechText,
    });

    try {
      await downloadR2ObjectBuffer(objectKey);
      skipped += 1;
      continue;
    } catch {
      // Cache miss. Generate below.
    }

    const audio = await synthesizeQuizSpeech({
      gameMode: "wwtbam",
      speechText,
    });

    await uploadR2ObjectBuffer({
      objectKey,
      body: audio,
      contentType,
      cacheControl: "public, max-age=31536000, immutable",
    });

    created += 1;
    process.stdout.write(`Prewarmed ${created + skipped}/${texts.length}\r`);
  }

  process.stdout.write("\n");
  console.log(`WWTBAM host audio prewarm complete. Created ${created}, skipped ${skipped}.`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
