import { asc } from "drizzle-orm";
import { AdminPricingPageClient } from "@/components/admin/admin-pricing-page-client";
import { db } from "@/db";
import { platformSettings } from "@/db/schema";
import {
  QUIZ_GENERATION_COST_SETTING_KEY,
  resolveGenerationCostCentsFromSettings,
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
  const universalSetting = settings.find(
    (setting) => setting.key === QUIZ_GENERATION_COST_SETTING_KEY,
  );

  return (
    <AdminPricingPageClient
      initialGenerationCostCents={generationCostCents}
      initialUpdatedAt={universalSetting?.updatedAt?.toISOString() ?? null}
    />
  );
}
