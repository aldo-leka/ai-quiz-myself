import { MyQuizzesPageClient } from "@/components/dashboard/my-quizzes-page-client";
import { getUserSessionOrNull } from "@/lib/user-auth";

export default async function DashboardMyQuizzesPage() {
  const session = await getUserSessionOrNull();
  if (!session?.user?.id) {
    return null;
  }

  return (
    <MyQuizzesPageClient
      creatorImage={session.user.avatarUrl || session.user.image || null}
      creatorName={session.user.name || session.user.email || "Player"}
    />
  );
}
