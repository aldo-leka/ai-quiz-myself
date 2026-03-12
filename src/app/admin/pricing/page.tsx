import { asc } from "drizzle-orm";
import { AdminPricingPageClient } from "@/components/admin/admin-pricing-page-client";
import { db } from "@/db";
import { platformSettings } from "@/db/schema";
import {
  STARTER_CREDITS_SETTING_KEY,
  QUIZ_GENERATION_COST_SETTING_KEY,
  resolveGenerationCostCentsFromSettings,
  resolveStarterCreditsCentsFromSettings,
} from "@/lib/billing";

export default async function AdminPricingPage() {
  const settings = await db
    .select({
      key: platformSettings.key,
      value: platformSettings.value,
      description: platformSettings.description,
      updatedAt: platformSettings.updatedAt,
    })
    .from(platformSettings)
    .orderBy(asc(platformSettings.key));

  const generationCostCents = resolveGenerationCostCentsFromSettings(settings);
  const starterCreditsCents = resolveStarterCreditsCentsFromSettings(settings);
  const universalSetting = settings.find(
    (setting) => setting.key === QUIZ_GENERATION_COST_SETTING_KEY,
  );
  const starterSetting = settings.find(
    (setting) => setting.key === STARTER_CREDITS_SETTING_KEY,
  );

  return (
    <AdminPricingPageClient
      initialGenerationCostCents={generationCostCents}
      initialStarterCreditsCents={starterCreditsCents}
      initialGenerationCostUpdatedAt={universalSetting?.updatedAt?.toISOString() ?? null}
      initialStarterCreditsUpdatedAt={starterSetting?.updatedAt?.toISOString() ?? null}
    />
  );
}
