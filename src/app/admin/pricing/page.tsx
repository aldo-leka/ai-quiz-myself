import { asc } from "drizzle-orm";
import { AdminPricingPageClient } from "@/components/admin/admin-pricing-page-client";
import { db } from "@/db";
import { platformSettings } from "@/db/schema";

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

  return (
    <AdminPricingPageClient
      initialSettings={settings.map((setting) => ({
        ...setting,
        updatedAt: setting.updatedAt.toISOString(),
      }))}
    />
  );
}
