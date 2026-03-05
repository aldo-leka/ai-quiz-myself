import { DashboardBillingPageClient } from "@/components/dashboard/dashboard-billing-page-client";
import { getUserSessionOrNull } from "@/lib/user-auth";

type DashboardBillingPageProps = {
  searchParams?: Promise<{ topup?: string }>;
};

export default async function DashboardBillingPage({ searchParams }: DashboardBillingPageProps) {
  const session = await getUserSessionOrNull();
  if (!session?.user?.id) {
    return null;
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const topUpStatus =
    resolvedSearchParams.topup === "success" || resolvedSearchParams.topup === "cancel"
      ? resolvedSearchParams.topup
      : null;

  return <DashboardBillingPageClient topUpStatus={topUpStatus} />;
}
