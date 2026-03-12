import { eq, inArray } from "drizzle-orm";
import { DashboardCreatePageClient } from "@/components/dashboard/dashboard-create-page-client";
import { db } from "@/db";
import { apiKeys, credits, platformSettings } from "@/db/schema";
import { user } from "@/db/schema/auth";
import {
  LEGACY_AI_GENERATION_COST_SETTING_KEY,
  LEGACY_PDF_GENERATION_COST_SETTING_KEY,
  QUIZ_GENERATION_COST_SETTING_KEY,
  resolveGenerationCostCentsFromSettings,
} from "@/lib/billing";
import { MAX_R2_PDF_FILE_SIZE_BYTES } from "@/lib/r2";
import { getUserSessionOrNull } from "@/lib/user-auth";

export default async function DashboardCreatePage() {
  const session = await getUserSessionOrNull();
  if (!session?.user?.id) {
    return null;
  }

  const [userRow, apiKeyRows, creditRow, costRows] = await Promise.all([
    db
      .select({
        locale: user.locale,
      })
      .from(user)
      .where(eq(user.id, session.user.id))
      .limit(1),
    db
      .select({
        id: apiKeys.id,
      })
      .from(apiKeys)
      .where(eq(apiKeys.userId, session.user.id))
      .limit(1),
    db
      .select({
        balanceCents: credits.balanceCents,
      })
      .from(credits)
      .where(eq(credits.userId, session.user.id))
      .limit(1),
    db
      .select({
        key: platformSettings.key,
        value: platformSettings.value,
      })
      .from(platformSettings)
      .where(
        inArray(platformSettings.key, [
          QUIZ_GENERATION_COST_SETTING_KEY,
          LEGACY_AI_GENERATION_COST_SETTING_KEY,
          LEGACY_PDF_GENERATION_COST_SETTING_KEY,
        ]),
      ),
  ]);

  const generationCostCents = resolveGenerationCostCentsFromSettings(costRows);

  return (
    <DashboardCreatePageClient
      isAdmin={Boolean(session.user.isAdmin)}
      hasApiKey={apiKeyRows.length > 0}
      initialLocale={userRow[0]?.locale ?? "en"}
      walletBalanceCents={Number(creditRow[0]?.balanceCents ?? 0)}
      standardGenerationCostCents={generationCostCents}
      pdfGenerationCostCents={generationCostCents}
      platformBillingAvailable={Boolean(process.env.OPENAI_API_KEY)}
      pdfMaxFileSizeBytes={MAX_R2_PDF_FILE_SIZE_BYTES}
    />
  );
}
