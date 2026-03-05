import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { Play, Plus, Trophy } from "lucide-react";
import { QuizCard } from "@/components/quiz/QuizCard";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { credits, quizSessions, quizzes } from "@/db/schema";
import { getUserSessionOrNull } from "@/lib/user-auth";

const playerButtonBaseClass =
  "rounded-xl border transition focus-visible:ring-cyan-400/60";
const playerButtonCyanClass =
  "border-cyan-500/50 bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30";

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export default async function DashboardOverviewPage() {
  const session = await getUserSessionOrNull();
  if (!session?.user?.id) {
    return null;
  }

  const userId = session.user.id;

  const [quizStats, sessionStats, creditBalance, recentQuizzes, recentGames] = await Promise.all([
    db
      .select({
        totalQuizzes: sql<number>`count(*)::int`,
      })
      .from(quizzes)
      .where(eq(quizzes.creatorId, userId)),
    db
      .select({
        totalGames: sql<number>`count(*)::int`,
        avgScore: sql<number>`coalesce(avg(${quizSessions.totalScore})::float, 0)`,
      })
      .from(quizSessions)
      .where(eq(quizSessions.userId, userId)),
    db
      .select({
        balanceCents: credits.balanceCents,
      })
      .from(credits)
      .where(eq(credits.userId, userId))
      .limit(1),
    db
      .select({
        id: quizzes.id,
        title: quizzes.title,
        theme: quizzes.theme,
        difficulty: quizzes.difficulty,
        gameMode: quizzes.gameMode,
        questionCount: quizzes.questionCount,
        playCount: quizzes.playCount,
        likes: quizzes.likes,
        dislikes: quizzes.dislikes,
      })
      .from(quizzes)
      .where(eq(quizzes.creatorId, userId))
      .orderBy(desc(quizzes.createdAt))
      .limit(5),
    db
      .select({
        id: quizSessions.id,
        totalScore: quizSessions.totalScore,
        startedAt: quizSessions.startedAt,
        finishedAt: quizSessions.finishedAt,
        quizId: quizzes.id,
        quizTitle: quizzes.title,
      })
      .from(quizSessions)
      .innerJoin(quizzes, eq(quizSessions.quizId, quizzes.id))
      .where(eq(quizSessions.userId, userId))
      .orderBy(desc(quizSessions.startedAt))
      .limit(5),
  ]);

  const totalQuizzes = Number(quizStats[0]?.totalQuizzes ?? 0);
  const totalGames = Number(sessionStats[0]?.totalGames ?? 0);
  const avgScore = Number(sessionStats[0]?.avgScore ?? 0);
  const creditTotalCents = Number(creditBalance[0]?.balanceCents ?? 0);

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 md:p-8">
        <h2 className="text-3xl font-black tracking-tight text-slate-100 md:text-4xl">
          Welcome back, {session.user.name || "Player"}
        </h2>
        <p className="mt-2 text-lg text-slate-300">
          Track your progress, review recent games, and manage your quiz library.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
          <p className="text-sm font-semibold text-slate-400">Total Quizzes Created</p>
          <p className="mt-2 text-4xl font-black text-cyan-100">{totalQuizzes}</p>
        </div>
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
          <p className="text-sm font-semibold text-slate-400">Total Games Played</p>
          <p className="mt-2 text-4xl font-black text-cyan-100">{totalGames}</p>
        </div>
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
          <p className="text-sm font-semibold text-slate-400">Average Score</p>
          <p className="mt-2 text-4xl font-black text-cyan-100">{avgScore.toFixed(1)}</p>
        </div>
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
          <p className="text-sm font-semibold text-slate-400">Credits Balance</p>
          <p className="mt-2 text-4xl font-black text-cyan-100">
            ${(creditTotalCents / 100).toFixed(2)}
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-2xl font-black text-slate-100">Recent Quizzes</h3>
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
        </div>

        {recentQuizzes.length === 0 ? (
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 text-slate-300">
            <p>No quizzes yet. Generate your first quiz!</p>
            <Button
              asChild
              className="mt-4 border-cyan-500/50 bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30"
            >
              <Link href="/dashboard/create">
                <Plus className="mr-2 size-4" />
                Create Quiz
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
            {recentQuizzes.map((quiz) => {
              const totalVotes = quiz.likes + quiz.dislikes;
              return (
                <QuizCard
                  key={quiz.id}
                  title={quiz.title}
                  theme={quiz.theme}
                  difficulty={quiz.difficulty}
                  gameMode={quiz.gameMode}
                  questionCount={quiz.questionCount}
                  playCount={quiz.playCount}
                  likeRatio={totalVotes > 0 ? quiz.likes / totalVotes : null}
                  statusLabel="Ready"
                >
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
                </QuizCard>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h3 className="text-2xl font-black text-slate-100">Recent Games</h3>
        {recentGames.length === 0 ? (
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 text-slate-300">
            No games played yet.
          </div>
        ) : (
          <div className="space-y-3">
            {recentGames.map((game) => {
              const durationMs =
                game.finishedAt && game.startedAt
                  ? Math.max(0, game.finishedAt.getTime() - game.startedAt.getTime())
                  : null;
              return (
                <div
                  key={game.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4"
                >
                  <div>
                    <p className="text-lg font-semibold text-slate-100">{game.quizTitle}</p>
                    <p className="text-sm text-slate-400">{formatDate(game.startedAt)}</p>
                  </div>
                  <div className="flex items-center gap-4 text-slate-200">
                    <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 text-sm">
                      <Trophy className="size-4 text-cyan-300" />
                      Score {game.totalScore}
                    </div>
                    <div className="text-sm text-slate-400">
                      {durationMs !== null
                        ? `${Math.round(durationMs / 1000)}s`
                        : "In progress"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
