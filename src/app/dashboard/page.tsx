import Link from "next/link";
import { Play, Plus } from "lucide-react";
import { DashboardOverviewContent } from "@/components/dashboard/dashboard-overview-content";
import { Button } from "@/components/ui/button";
import { getDashboardOverviewData } from "@/lib/dashboard-overview";
import { getUserSessionOrNull } from "@/lib/user-auth";

const playerButtonBaseClass =
  "rounded-xl border transition focus-visible:ring-cyan-400/60";
const playerButtonCyanClass =
  "border-cyan-500/50 bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30";

export default async function DashboardOverviewPage() {
  const session = await getUserSessionOrNull();
  if (!session?.user?.id) {
    return null;
  }

  const overview = await getDashboardOverviewData(session.user.id);

  return (
    <DashboardOverviewContent
      user={{
        name: session.user.name || "Player",
        image: session.user.image,
        avatarUrl: session.user.avatarUrl,
      }}
      overview={overview}
      recentQuizzesAction={
        <Button
          asChild
          variant="outline"
          className="border-cyan-500/50 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20"
        >
          <Link href="/dashboard/create">
            <Plus className="mr-2 size-4" />
            Create Quiz
          </Link>
        </Button>
      }
      emptyQuizzesAction={
        <Button
          asChild
          className="border-cyan-500/50 bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30"
        >
          <Link href="/dashboard/create">
            <Plus className="mr-2 size-4" />
            Create Quiz
          </Link>
        </Button>
      }
      renderQuizAction={(quiz) => (
        <Button
          asChild
          size="sm"
          className={`${playerButtonBaseClass} ${playerButtonCyanClass}`}
        >
          <Link href={`/play/${quiz.id}`}>
            <Play className="mr-1 size-4" />
            Play
          </Link>
        </Button>
      )}
    />
  );
}
