import { eq } from "drizzle-orm";
import { DashboardCreatePageClient } from "@/components/dashboard/dashboard-create-page-client";
import { db } from "@/db";
import { apiKeys, credits, platformSettings } from "@/db/schema";
import { user } from "@/db/schema/auth";
import { getUserSessionOrNull } from "@/lib/user-auth";

function parseSettingInt(value: string | null | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export default async function DashboardCreatePage() {
  const session = await getUserSessionOrNull();
  if (!session?.user?.id) {
    return null;
  }

  const [userRow, apiKeyRows, creditRow, pdfCostRow] = await Promise.all([
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
        balance: credits.balance,
      })
      .from(credits)
      .where(eq(credits.userId, session.user.id))
      .limit(1),
    db
      .select({
        value: platformSettings.value,
      })
      .from(platformSettings)
      .where(eq(platformSettings.key, "credit_cost_pdf_generation"))
      .limit(1),
  ]);

  return (
    <DashboardCreatePageClient
      hasApiKey={apiKeyRows.length > 0}
      initialLocale={userRow[0]?.locale ?? "en"}
      creditBalance={Number(creditRow[0]?.balance ?? 0)}
      pdfCreditCost={parseSettingInt(pdfCostRow[0]?.value, 1)}
    />
  );
}

