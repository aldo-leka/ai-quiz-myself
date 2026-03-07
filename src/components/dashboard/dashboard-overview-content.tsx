import type { ReactNode } from "react";
import { Trophy } from "lucide-react";
import { QuizCard } from "@/components/quiz/QuizCard";
import type { DashboardOverviewData } from "@/lib/dashboard-overview";

type DashboardOverviewContentProps = {
  user: {
    name: string;
    image?: string | null;
    avatarUrl?: string | null;
  };
  overview: DashboardOverviewData;
  recentQuizzesAction?: ReactNode;
  emptyQuizzesAction?: ReactNode;
  renderQuizAction?: (quiz: DashboardOverviewData["recentQuizzes"][number]) => ReactNode;
};

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function DashboardOverviewContent({
  user,
  overview,
  recentQuizzesAction,
  emptyQuizzesAction,
  renderQuizAction,
}: DashboardOverviewContentProps) {
  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 md:p-8">
        <h2 className="text-3xl font-black tracking-tight text-slate-100 md:text-4xl">
          Welcome back, {user.name || "Player"}
        </h2>
        <p className="mt-2 text-lg text-slate-300">
          Track your progress, review recent games, and manage your quiz library.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
          <p className="text-sm font-semibold text-slate-400">Total Quizzes Created</p>
          <p className="mt-2 text-4xl font-black text-cyan-100">{overview.totalQuizzes}</p>
        </div>
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
          <p className="text-sm font-semibold text-slate-400">Total Games Played</p>
          <p className="mt-2 text-4xl font-black text-cyan-100">{overview.totalGames}</p>
        </div>
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
          <p className="text-sm font-semibold text-slate-400">Average Score</p>
          <p className="mt-2 text-4xl font-black text-cyan-100">{overview.avgScore.toFixed(1)}</p>
        </div>
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
          <p className="text-sm font-semibold text-slate-400">Credits Balance</p>
          <p className="mt-2 text-4xl font-black text-cyan-100">
            ${(overview.creditTotalCents / 100).toFixed(2)}
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-2xl font-black text-slate-100">Recent Quizzes</h3>
          {recentQuizzesAction}
        </div>

        {overview.recentQuizzes.length === 0 ? (
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 text-slate-300">
            <p>No quizzes yet. Generate your first quiz!</p>
            {emptyQuizzesAction ? <div className="mt-4">{emptyQuizzesAction}</div> : null}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
            {overview.recentQuizzes.map((quiz) => {
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
                  creatorName={user.name}
                  creatorImage={user.avatarUrl ?? user.image ?? null}
                  statusLabel="Ready"
                >
                  {renderQuizAction ? renderQuizAction(quiz) : null}
                </QuizCard>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h3 className="text-2xl font-black text-slate-100">Recent Games</h3>
        {overview.recentGames.length === 0 ? (
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 text-slate-300">
            No games played yet.
          </div>
        ) : (
          <div className="space-y-3">
            {overview.recentGames.map((game) => {
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
                      {durationMs !== null ? `${Math.round(durationMs / 1000)}s` : "In progress"}
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
