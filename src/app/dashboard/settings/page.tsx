import { eq } from "drizzle-orm";
import { DashboardSettingsPageClient } from "@/components/dashboard/dashboard-settings-page-client";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { user } from "@/db/schema/auth";
import { getUserSessionOrNull } from "@/lib/user-auth";

export default async function DashboardSettingsPage() {
  const session = await getUserSessionOrNull();
  if (!session?.user?.id) {
    return null;
  }

  const [userRow, keyRows] = await Promise.all([
    db
      .select({
        locale: user.locale,
        preferredProvider: user.preferredProvider,
      })
      .from(user)
      .where(eq(user.id, session.user.id))
      .limit(1),
    db
      .select({
        provider: apiKeys.provider,
      })
      .from(apiKeys)
      .where(eq(apiKeys.userId, session.user.id)),
  ]);

  const locale = userRow[0]?.locale ?? "en";
  const preferredProvider = userRow[0]?.preferredProvider;
  const availableProviders = keyRows.map((row) => row.provider);

  return (
    <DashboardSettingsPageClient
      initialLocale={locale}
      initialPreferredProvider={
        preferredProvider === "openai" ||
        preferredProvider === "anthropic" ||
        preferredProvider === "google"
          ? preferredProvider
          : null
      }
      availableProviders={availableProviders}
    />
  );
}
