import Link from "next/link";
import { Play, Plus } from "lucide-react";
import { DashboardOverviewContent } from "@/components/dashboard/dashboard-overview-content";
import { Button } from "@/components/ui/button";
import { getDashboardOverviewData } from "@/lib/dashboard-overview";
import { getUserSessionOrNull } from "@/lib/user-auth";

const playerButtonBaseClass =
  "min-h-14 rounded-2xl border px-5 text-base transition focus-visible:ring-cyan-400/60 md:min-h-16 md:text-lg";
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
          className="min-h-14 rounded-2xl border-cyan-500/50 bg-cyan-500/10 px-6 text-lg text-cyan-100 hover:bg-cyan-500/20 md:text-xl"
        >
          <Link href="/dashboard/create">
            <Plus className="mr-2 size-5" />
            Create Quiz
          </Link>
        </Button>
      }
      emptyQuizzesAction={
        <Button
          asChild
          className="min-h-14 rounded-2xl border-cyan-500/50 bg-cyan-500/20 px-6 text-lg text-cyan-100 hover:bg-cyan-500/30 md:text-xl"
        >
          <Link href="/dashboard/create">
            <Plus className="mr-2 size-5" />
            Create Quiz
          </Link>
        </Button>
      }
      renderQuizAction={(quiz) => (
        <Button
          asChild
          className={playerButtonBaseClass + " " + playerButtonCyanClass}
        >
          <Link href={`/play/${quiz.id}`}>
            <Play className="mr-2 size-5" />
            Play
          </Link>
        </Button>
      )}
    />
  );
}
