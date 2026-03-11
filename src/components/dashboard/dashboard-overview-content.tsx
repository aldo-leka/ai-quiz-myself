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
    <div className="space-y-10">
      <section className="rounded-3xl border border-[#252940] bg-[#1a1d2e]/68 p-7 md:p-10">
        <h2 className="text-[clamp(2.8rem,5vw,5rem)] leading-[0.95] font-black tracking-tight text-[#e4e4e9]">
          Welcome back, {user.name || "Player"}
        </h2>
        <p className="mt-3 max-w-4xl text-xl text-[#9394a5] md:text-3xl">
          Track your progress, review recent games, and manage your quiz library.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl border border-[#252940] bg-[#1a1d2e]/78 p-6 md:p-7">
          <p className="text-base font-semibold text-[#9394a5] md:text-xl">Total Quizzes Created</p>
          <p className="mt-3 text-5xl font-black text-[#e4e4e9] md:text-6xl">{overview.totalQuizzes}</p>
        </div>
        <div className="rounded-3xl border border-[#252940] bg-[#1a1d2e]/78 p-6 md:p-7">
          <p className="text-base font-semibold text-[#9394a5] md:text-xl">Total Games Played</p>
          <p className="mt-3 text-5xl font-black text-[#e4e4e9] md:text-6xl">{overview.totalGames}</p>
        </div>
        <div className="rounded-3xl border border-[#252940] bg-[#1a1d2e]/78 p-6 md:p-7">
          <p className="text-base font-semibold text-[#9394a5] md:text-xl">Average Accuracy</p>
          <p className="mt-3 text-5xl font-black text-[#e4e4e9] md:text-6xl">
            {overview.avgAccuracy.toFixed(1)}%
          </p>
        </div>
        <div className="rounded-3xl border border-[#252940] bg-[#1a1d2e]/78 p-6 md:p-7">
          <p className="text-base font-semibold text-[#9394a5] md:text-xl">Credits Balance</p>
          <p className="mt-3 text-5xl font-black text-[#e4e4e9] md:text-6xl">
            ${(overview.creditTotalCents / 100).toFixed(2)}
          </p>
        </div>
      </section>

      <section className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-3xl font-black tracking-tight text-[#e4e4e9] md:text-5xl">
            Recent Quizzes
          </h3>
          {recentQuizzesAction}
        </div>

        {overview.recentQuizzes.length === 0 ? (
          <div className="rounded-3xl border border-[#252940] bg-[#1a1d2e]/78 p-7 text-lg text-[#9394a5] md:text-2xl">
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
                  generationProvider={quiz.generationProvider}
                  questionCount={quiz.questionCount}
                  playCount={quiz.playCount}
                  likeRatio={totalVotes > 0 ? quiz.likes / totalVotes : null}
                  creatorName={user.name}
                  creatorImage={user.avatarUrl ?? user.image ?? null}
                  statusLabel="Ready"
                  size="large"
                >
                  {renderQuizAction ? renderQuizAction(quiz) : null}
                </QuizCard>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-5">
        <h3 className="text-3xl font-black tracking-tight text-[#e4e4e9] md:text-5xl">
          Recent Games
        </h3>
        {overview.recentGames.length === 0 ? (
          <div className="rounded-3xl border border-[#252940] bg-[#1a1d2e]/78 p-7 text-lg text-[#9394a5] md:text-2xl">
            No games played yet.
          </div>
        ) : (
          <div className="space-y-4">
            {overview.recentGames.map((game) => {
              const durationMs =
                game.finishedAt && game.startedAt
                  ? Math.max(0, game.finishedAt.getTime() - game.startedAt.getTime())
                  : null;

              return (
                <div
                  key={game.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[#252940] bg-[#1a1d2e]/78 p-5 md:p-6"
                >
                  <div>
                    <p className="text-2xl font-semibold text-[#e4e4e9] md:text-3xl">
                      {game.quizTitle}
                    </p>
                    <p className="mt-1 text-base text-[#9394a5] md:text-lg">
                      {formatDate(game.startedAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-[#e4e4e9]">
                    <div className="inline-flex items-center gap-2 rounded-full border border-[#252940] bg-[#0f1117]/72 px-4 py-2 text-base md:text-lg">
                      <Trophy className="size-5 text-[#818cf8]" />
                      Score {game.totalScore}
                    </div>
                    <div className="text-base text-[#9394a5] md:text-lg">
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
