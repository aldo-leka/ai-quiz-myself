"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Play, Trash2 } from "lucide-react";
import { FilterPill } from "@/components/quiz/FilterPill";
import { QuizCard } from "@/components/quiz/QuizCard";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type UserQuizRow = {
  id: string;
  title: string;
  theme: string;
  difficulty: "easy" | "medium" | "hard" | "mixed" | "escalating";
  gameMode: "single" | "wwtbam" | "couch_coop";
  questionCount: number;
  playCount: number;
  likeRatio: number | null;
  status: "ready";
  createdAt: string;
};

type GenerationJobRow = {
  id: string;
  theme: string;
  gameMode: "single" | "wwtbam" | "couch_coop";
  difficulty: string;
  status: "pending" | "processing" | "failed";
  errorMessage: string | null;
  createdAt: string;
};

type DashboardQuizzesResponse = {
  quizzes: UserQuizRow[];
  jobs: GenerationJobRow[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
};

type ModeFilter = "all" | "single" | "wwtbam" | "couch_coop";
type StatusFilter = "all" | "ready" | "generating" | "failed";
type SortFilter = "newest" | "most_played";

const modeOptions: Array<{ value: ModeFilter; label: string }> = [
  { value: "all", label: "All Modes" },
  { value: "single", label: "Single Player" },
  { value: "couch_coop", label: "Couch Co-op" },
  { value: "wwtbam", label: "WWTBAM" },
];

const statusOptions: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "All Status" },
  { value: "ready", label: "Ready" },
  { value: "generating", label: "Generating" },
  { value: "failed", label: "Failed" },
];

const sortOptions: Array<{ value: SortFilter; label: string }> = [
  { value: "newest", label: "Newest" },
  { value: "most_played", label: "Most Played" },
];

const playerButtonBaseClass =
  "rounded-xl border transition focus-visible:ring-cyan-400/60";
const playerButtonCyanClass =
  "border-cyan-500/50 bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30";
const playerButtonSecondaryClass =
  "border-slate-600 bg-slate-900/80 text-slate-100 hover:border-cyan-400/60 hover:bg-cyan-500/10 hover:text-cyan-100";
const playerButtonDangerClass =
  "border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20 hover:text-rose-100";

export function MyQuizzesPageClient() {
  const [rows, setRows] = useState<UserQuizRow[]>([]);
  const [jobs, setJobs] = useState<GenerationJobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ModeFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortFilter>("newest");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [quizPendingDelete, setQuizPendingDelete] = useState<UserQuizRow | null>(null);
  const [deletingQuizId, setDeletingQuizId] = useState<string | null>(null);

  const displayItems = useMemo(() => {
    const quizItems = rows.map((quiz) => ({
      kind: "quiz" as const,
      createdAt: quiz.createdAt,
      quiz,
    }));

    const jobItems = jobs.map((job) => ({
      kind: "job" as const,
      createdAt: job.createdAt,
      job,
    }));

    if (sort !== "newest") {
      return [...quizItems, ...jobItems];
    }

    return [...quizItems, ...jobItems].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [jobs, rows, sort]);

  const fetchKey = useMemo(
    () => `${mode}|${status}|${sort}|${page}`,
    [mode, status, sort, page],
  );

  const load = useCallback(async (options?: { background?: boolean }) => {
    const isBackground = options?.background ?? false;
    if (!isBackground) {
      setLoading(true);
      setError(null);
    }

    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "12",
        gameMode: mode,
        status,
        sort,
      });

      const response = await fetch(`/api/dashboard/quizzes?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as DashboardQuizzesResponse & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load quizzes");
      }

      setRows((previous) => {
        if (page > 1 && !isBackground) {
          return [...previous, ...payload.quizzes];
        }
        return payload.quizzes;
      });
      setJobs(payload.jobs);
      setTotal(payload.total);
      setHasMore(payload.hasMore);
    } catch (fetchError) {
      if (!isBackground) {
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load quizzes");
      }
    } finally {
      if (!isBackground) {
        setLoading(false);
      }
    }
  }, [mode, page, sort, status]);

  useEffect(() => {
    void load();
  }, [fetchKey, load]);

  useEffect(() => {
    const hasActiveJobs = jobs.some(
      (job) => job.status === "pending" || job.status === "processing",
    );
    if (!hasActiveJobs || page !== 1) {
      return;
    }

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        void load({ background: true });
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [jobs, load, page]);

  async function deleteQuiz(quiz: UserQuizRow | null) {
    if (!quiz) return;

    setDeletingQuizId(quiz.id);
    setError(null);
    try {
      const response = await fetch(`/api/dashboard/quizzes/${quiz.id}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to delete quiz");
      }

      setRows((previous) => previous.filter((row) => row.id !== quiz.id));
      setTotal((previous) => Math.max(0, previous - 1));
      setQuizPendingDelete(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete quiz");
    } finally {
      setDeletingQuizId(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900/60 p-4 md:p-6">
        <div className="space-y-3">
          <h2 className="text-2xl font-bold text-slate-100">Game Mode</h2>
          <div className="flex flex-wrap gap-3">
            {modeOptions.map((option) => (
              <FilterPill
                key={option.value}
                isActive={mode === option.value}
                onClick={() => {
                  setPage(1);
                  setMode(option.value);
                }}
              >
                {option.label}
              </FilterPill>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-2xl font-bold text-slate-100">Status</h2>
          <div className="flex flex-wrap gap-3">
            {statusOptions.map((option) => (
              <FilterPill
                key={option.value}
                isActive={status === option.value}
                onClick={() => {
                  setPage(1);
                  setStatus(option.value);
                }}
              >
                {option.label}
              </FilterPill>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-2xl font-bold text-slate-100">Sort</h2>
          <div className="flex flex-wrap gap-3">
            {sortOptions.map((option) => (
              <FilterPill
                key={option.value}
                isActive={sort === option.value}
                onClick={() => {
                  setPage(1);
                  setSort(option.value);
                }}
              >
                {option.label}
              </FilterPill>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-3xl font-black tracking-tight text-slate-100">My Quiz Library</h3>
          <div className="flex items-center gap-3">
            <p className="text-lg text-slate-300">{total} items</p>
            <Button
              asChild
              className={`min-h-11 ${playerButtonBaseClass} ${playerButtonCyanClass}`}
            >
              <Link href="/dashboard/create">Create Quiz</Link>
            </Button>
          </div>
        </div>

        {error ? (
          <p className="rounded-xl border border-rose-500/50 bg-rose-500/10 p-4 text-rose-200">
            {error}
          </p>
        ) : null}

        {loading ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 text-slate-300">
            Loading your quizzes...
          </div>
        ) : null}

        {!loading && rows.length === 0 && jobs.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-8 text-center">
            <p className="text-2xl font-semibold text-slate-200">
              No quizzes yet. Generate your first quiz!
            </p>
            <Button
              asChild
              className={`mt-4 ${playerButtonBaseClass} ${playerButtonCyanClass}`}
            >
              <Link href="/dashboard/create">Create Quiz</Link>
            </Button>
          </div>
        ) : null}

        {!loading ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {displayItems.map((item) => {
              if (item.kind === "job") {
                const { job } = item;
                const isGenerating = job.status === "pending" || job.status === "processing";
                return (
                  <div
                    key={job.id}
                    className="min-h-[320px] rounded-2xl border border-slate-700 bg-slate-900/90 p-5"
                  >
                    <h4 className="text-2xl font-bold text-slate-100">{job.theme}</h4>
                    <p className="mt-3 text-slate-300">Mode: {job.gameMode}</p>
                    <p className="text-slate-300">Difficulty: {job.difficulty}</p>
                    <div className="mt-5 rounded-lg border border-slate-800 bg-slate-950/70 p-4">
                      {isGenerating ? (
                        <div className="flex items-center gap-2 text-amber-200">
                          <Loader2 className="size-4 animate-spin" />
                          Generating...
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-rose-200">
                            <AlertTriangle className="size-4" />
                            Failed
                          </div>
                          <p className="text-sm text-rose-300">{job.errorMessage ?? "Generation failed."}</p>
                        </div>
                      )}
                    </div>
                    <p className="mt-4 text-sm text-slate-400">
                      Created {new Date(job.createdAt).toLocaleString()}
                    </p>
                  </div>
                );
              }

              const { quiz } = item;
              return (
                <QuizCard
                  key={quiz.id}
                  title={quiz.title}
                  theme={quiz.theme}
                  difficulty={quiz.difficulty}
                  gameMode={quiz.gameMode}
                  questionCount={quiz.questionCount}
                  playCount={quiz.playCount}
                  likeRatio={quiz.likeRatio}
                  statusLabel="Ready"
                  statusTone="ready"
                >
                  <div className="flex flex-wrap gap-2">
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
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className={`${playerButtonBaseClass} ${playerButtonSecondaryClass}`}
                    >
                      <Link href={`/dashboard/my-quizzes/${quiz.id}`}>View Details</Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className={`${playerButtonBaseClass} ${playerButtonDangerClass}`}
                      onClick={() => setQuizPendingDelete(quiz)}
                      disabled={deletingQuizId === quiz.id}
                    >
                      <Trash2 className="mr-1 size-4" />
                      {deletingQuizId === quiz.id ? "Deleting..." : "Delete"}
                    </Button>
                  </div>
                </QuizCard>
              );
            })}
          </div>
        ) : null}

        {hasMore ? (
          <div className="flex justify-center">
            <Button
              type="button"
              variant="outline"
              className="border-cyan-500/50 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20"
              onClick={() => setPage((previous) => previous + 1)}
            >
              Load More
            </Button>
          </div>
        ) : null}
      </section>

      <AlertDialog
        open={quizPendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deletingQuizId) {
            setQuizPendingDelete(null);
          }
        }}
      >
        <AlertDialogContent
          className="max-w-md rounded-3xl border border-slate-700 bg-gradient-to-br from-slate-900 to-slate-950 p-6 text-slate-100 shadow-2xl"
        >
          <AlertDialogHeader className="place-items-start text-left">
            <AlertDialogTitle className="text-2xl font-black tracking-tight text-slate-100">
              Delete Quiz
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base leading-relaxed text-slate-300">
              {quizPendingDelete
                ? `Delete "${quizPendingDelete.title}" and all related sessions? This cannot be undone.`
                : "This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <AlertDialogCancel
              disabled={Boolean(deletingQuizId)}
              className={`min-h-11 ${playerButtonBaseClass} ${playerButtonSecondaryClass}`}
            >
              Cancel
            </AlertDialogCancel>
            <Button
              variant="outline"
              className={`min-h-11 ${playerButtonBaseClass} ${playerButtonDangerClass}`}
              disabled={Boolean(deletingQuizId)}
              onClick={() => void deleteQuiz(quizPendingDelete)}
            >
              {deletingQuizId ? "Deleting..." : "Delete Quiz"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
