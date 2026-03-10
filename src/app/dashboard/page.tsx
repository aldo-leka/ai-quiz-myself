import { DashboardQuizzesPageClient } from "@/components/dashboard/dashboard-quizzes-page-client";
import { getUserSessionOrNull } from "@/lib/user-auth";

export default async function DashboardPage() {
  const session = await getUserSessionOrNull();
  if (!session?.user?.id) {
    return null;
  }

  return (
    <DashboardQuizzesPageClient
      creatorImage={session.user.avatarUrl || session.user.image || null}
      creatorName={session.user.name || session.user.email || "Player"}
    />
  );
}
