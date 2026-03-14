"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, Play, Trash2 } from "lucide-react";
import { PlayerSelect } from "@/components/dashboard/player-select";
import { QuizCard, type QuizCardGenerationProvider } from "@/components/quiz/QuizCard";
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
import { MY_QUIZZES_RANDOM_SOURCE, buildQuizPlayPath, type MyQuizzesRandomContext, type MyQuizzesRandomGameModeFilter, type MyQuizzesRandomLanguageFilter } from "@/lib/my-quizzes-random";
import { selectMyQuizzesRandomQuizId } from "@/lib/my-quizzes-random-client";
import { focusRemoteControl } from "@/lib/remote-focus";

type UserQuizRow = {
  id: string;
  title: string;
  theme: string;
  language: string;
  difficulty: "easy" | "medium" | "hard" | "mixed" | "escalating";
  gameMode: "single" | "wwtbam" | "couch_coop";
  generationProvider: QuizCardGenerationProvider | null;
  questionCount: number;
  playCount: number;
  likeRatio: number | null;
  status: "ready";
  createdAt: string;
};

type GenerationJobRow = {
  id: string;
  theme: string;
  language: string;
  gameMode: "single" | "wwtbam" | "couch_coop";
  difficulty: string;
  status: "pending" | "processing" | "failed";
  errorMessage: string | null;
  createdAt: string;
};

type DashboardQuizzesResponse = {
  quizzes: UserQuizRow[];
  jobs: GenerationJobRow[];
  availableLanguages: string[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
};

type ModeFilter = MyQuizzesRandomGameModeFilter;
type StatusFilter = "all" | "ready" | "generating" | "failed";
type LanguageFilter = MyQuizzesRandomLanguageFilter;
type QuizFilterFocusTarget = "mode" | "status" | "language" | "random";

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

const playerButtonBaseClass =
  "min-h-14 rounded-2xl border px-5 text-base transition focus-visible:ring-[#818cf8]/55 md:min-h-16 md:text-lg";
const playerButtonCyanClass =
  "border-[#6c8aff]/45 bg-[#6c8aff]/18 text-[#e4e4e9] hover:bg-[#818cf8]/24";
const playerButtonSecondaryClass =
  "border-[#252940] bg-[#1a1d2e]/86 text-[#e4e4e9] hover:border-[#818cf8]/55 hover:bg-[#6c8aff]/12 hover:text-[#e4e4e9]";
const playerButtonDangerClass =
  "border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20 hover:text-rose-100";
const languageLabelByValue: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  nl: "Dutch",
  sq: "Albanian",
};
const quizFilterIdByTarget: Record<QuizFilterFocusTarget, string> = {
  mode: "quizzes-filter-mode",
  status: "quizzes-filter-status",
  language: "quizzes-filter-language",
  random: "quizzes-play-random",
};

function formatLanguageLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "Unknown";

  const primaryTag = normalized.split("-")[0] ?? normalized;
  const primaryLabel = languageLabelByValue[primaryTag] ?? primaryTag.toUpperCase();
  return primaryTag === normalized ? primaryLabel : `${primaryLabel} (${normalized})`;
}

function getQuizFilterTargetFromTvId(tvId: string | undefined): QuizFilterFocusTarget | null {
  switch (tvId) {
    case "quizzes-filter-mode":
      return "mode";
    case "quizzes-filter-status":
      return "status";
    case "quizzes-filter-language":
      return "language";
    case "quizzes-play-random":
      return "random";
    default:
      return null;
  }
}

type DashboardQuizzesPageClientProps = {
  creatorImage: string | null;
  creatorName: string | null;
};

export function DashboardQuizzesPageClient({
  creatorImage,
  creatorName,
}: DashboardQuizzesPageClientProps) {
  const router = useRouter();
  const [rows, setRows] = useState<UserQuizRow[]>([]);
  const [jobs, setJobs] = useState<GenerationJobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ModeFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [language, setLanguage] = useState<LanguageFilter>("all");
  const [availableLanguages, setAvailableLanguages] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [quizPendingDelete, setQuizPendingDelete] = useState<UserQuizRow | null>(null);
  const [deletingQuizId, setDeletingQuizId] = useState<string | null>(null);
  const [isRandomPlayLoading, setIsRandomPlayLoading] = useState(false);
  const [modeSelectOpen, setModeSelectOpen] = useState(false);
  const [statusSelectOpen, setStatusSelectOpen] = useState(false);
  const [languageSelectOpen, setLanguageSelectOpen] = useState(false);
  const lastQuizFilterTargetRef = useRef<QuizFilterFocusTarget>("mode");
  const anyQuizFilterSelectOpen = modeSelectOpen || statusSelectOpen || languageSelectOpen;
  const canStartRandomPlay =
    !loading &&
    !isRandomPlayLoading &&
    (status === "all" || status === "ready") &&
    (rows.length > 0 || hasMore);

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

    return [...quizItems, ...jobItems].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [jobs, rows]);

  const fetchKey = useMemo(
    () => `${mode}|${status}|${language}|${page}`,
    [language, mode, page, status],
  );

  const languageOptions = useMemo<Array<{ value: LanguageFilter; label: string }>>(() => {
    const values = new Set(
      availableLanguages
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.length > 0),
    );

    if (language !== "all") {
      values.add(language);
    }

    return [
      { value: "all", label: "All Languages" },
      ...Array.from(values)
        .sort((left, right) => formatLanguageLabel(left).localeCompare(formatLanguageLabel(right)))
        .map((value) => ({
          value,
          label: formatLanguageLabel(value),
        })),
    ];
  }, [availableLanguages, language]);

  const playRandomContext = useMemo<MyQuizzesRandomContext>(
    () => ({
      source: MY_QUIZZES_RANDOM_SOURCE,
      filters: {
        gameMode: mode,
        language,
      },
    }),
    [language, mode],
  );

  const availableQuizFilterTargets = useMemo<QuizFilterFocusTarget[]>(
    () => (canStartRandomPlay ? ["mode", "status", "language", "random"] : ["mode", "status", "language"]),
    [canStartRandomPlay],
  );

  const focusElementByTvId = useCallback((tvId: string) => {
    const node = document.querySelector<HTMLElement>(`[data-tv-id='${tvId}']`);
    if (!node) return false;

    focusRemoteControl(node);
    return true;
  }, []);

  const focusQuizFilterControl = useCallback(
    (target: QuizFilterFocusTarget) => {
      const resolvedTarget = availableQuizFilterTargets.includes(target)
        ? target
        : availableQuizFilterTargets[availableQuizFilterTargets.length - 1] ?? "language";
      lastQuizFilterTargetRef.current = resolvedTarget;
      return focusElementByTvId(quizFilterIdByTarget[resolvedTarget]);
    },
    [availableQuizFilterTargets, focusElementByTvId],
  );

  const startRandomPlay = useCallback(async () => {
    if (isRandomPlayLoading) return;

    if (status !== "all" && status !== "ready") {
      setError("Random play only works with Ready or All status filters.");
      return;
    }

    setIsRandomPlayLoading(true);
    setError(null);
    try {
      const quizId = await selectMyQuizzesRandomQuizId({
        filters: playRandomContext.filters,
      });
      router.push(
        buildQuizPlayPath({
          quizId,
          playContext: playRandomContext,
        }),
      );
    } catch (randomPlayError) {
      setError(
        randomPlayError instanceof Error
          ? randomPlayError.message
          : "Could not start a random quiz.",
      );
      setIsRandomPlayLoading(false);
    }
  }, [isRandomPlayLoading, playRandomContext, router, status]);

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
      });
      if (language !== "all") {
        params.set("language", language);
      }

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
      setAvailableLanguages(payload.availableLanguages);
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
  }, [language, mode, page, status]);

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

  useEffect(() => {
    function onQuizFilterKeyDown(event: KeyboardEvent) {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter"].includes(event.key)) {
        return;
      }

      const activeElement =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (!activeElement) return;

      const currentTvId = activeElement.dataset.tvId;
      const isDashboardNavButton = Boolean(activeElement.closest("[data-tv-scope='dashboard-nav']"));

      if (isDashboardNavButton && event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        focusQuizFilterControl(lastQuizFilterTargetRef.current);
        return;
      }

      if (!currentTvId) return;

      if (currentTvId === "dashboard-quizzes-link") {
        if (event.key !== "ArrowDown") return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        focusQuizFilterControl(lastQuizFilterTargetRef.current);
        return;
      }

      if (currentTvId === "quizzes-create-button") {
        if (event.key !== "ArrowUp") return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        focusQuizFilterControl(lastQuizFilterTargetRef.current);
        return;
      }

      const currentFilterTarget = getQuizFilterTargetFromTvId(currentTvId);
      if (!currentFilterTarget) return;
      if (anyQuizFilterSelectOpen) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (event.key === "Enter") {
        activeElement.click();
        return;
      }

      if (event.key === "ArrowUp") {
        focusElementByTvId("dashboard-quizzes-link");
        return;
      }

      if (event.key === "ArrowDown") {
        focusElementByTvId("quizzes-create-button");
        return;
      }

      const currentIndex = availableQuizFilterTargets.indexOf(currentFilterTarget);
      if (currentIndex === -1) return;

      const nextIndex =
        event.key === "ArrowLeft"
          ? Math.max(0, currentIndex - 1)
          : Math.min(availableQuizFilterTargets.length - 1, currentIndex + 1);
      const nextTarget = availableQuizFilterTargets[nextIndex];
      if (!nextTarget || nextTarget === currentFilterTarget) return;

      focusQuizFilterControl(nextTarget);
    }

    window.addEventListener("keydown", onQuizFilterKeyDown, true);
    return () => window.removeEventListener("keydown", onQuizFilterKeyDown, true);
  }, [
    availableQuizFilterTargets,
    anyQuizFilterSelectOpen,
    focusElementByTvId,
    focusQuizFilterControl,
  ]);

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
    <div className="space-y-8">
      <section
        className="rounded-3xl border border-[#252940] bg-[#1a1d2e]/68 p-5 md:p-6"
        onFocusCapture={(event) => {
          const target =
            event.target instanceof HTMLElement
              ? getQuizFilterTargetFromTvId(event.target.dataset.tvId)
              : null;
          if (!target) return;
          lastQuizFilterTargetRef.current = target;
        }}
      >
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex flex-1 flex-col gap-3 md:flex-row md:flex-wrap xl:justify-end">
            <div className="space-y-2">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#9394a5]">
                Game Mode
              </p>
              <PlayerSelect
                value={mode}
                onValueChange={(value) => {
                  setPage(1);
                  setMode(value);
                }}
                options={modeOptions}
                open={modeSelectOpen}
                onOpenChange={(open) => {
                  setModeSelectOpen(open);
                  if (!open) {
                    window.requestAnimationFrame(() => {
                      focusQuizFilterControl("mode");
                    });
                  }
                }}
                triggerId={quizFilterIdByTarget.mode}
                widthClassName="w-full min-w-[190px] sm:w-[220px]"
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#9394a5]">
                Status
              </p>
              <PlayerSelect
                value={status}
                onValueChange={(value) => {
                  setPage(1);
                  setStatus(value);
                }}
                options={statusOptions}
                open={statusSelectOpen}
                onOpenChange={(open) => {
                  setStatusSelectOpen(open);
                  if (!open) {
                    window.requestAnimationFrame(() => {
                      focusQuizFilterControl("status");
                    });
                  }
                }}
                triggerId={quizFilterIdByTarget.status}
                widthClassName="w-full min-w-[190px] sm:w-[220px]"
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#9394a5]">
                Language
              </p>
              <PlayerSelect
                value={language}
                onValueChange={(value) => {
                  setPage(1);
                  setLanguage(value);
                }}
                options={languageOptions}
                open={languageSelectOpen}
                onOpenChange={(open) => {
                  setLanguageSelectOpen(open);
                  if (!open) {
                    window.requestAnimationFrame(() => {
                      focusQuizFilterControl("language");
                    });
                  }
                }}
                triggerId={quizFilterIdByTarget.language}
                widthClassName="w-full min-w-[190px] sm:w-[220px]"
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-transparent">
                Random
              </p>
              <Button
                type="button"
                data-tv-id={quizFilterIdByTarget.random}
                disabled={!canStartRandomPlay}
                className={playerButtonBaseClass + " " + playerButtonCyanClass}
                onClick={() => void startRandomPlay()}
              >
                {isRandomPlayLoading ? (
                  <>
                    <Loader2 className="mr-2 size-5 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Play className="mr-2 size-5" />
                    Play Random
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[clamp(2.6rem,4vw,4.5rem)] font-black leading-[0.95] tracking-tight text-[#e4e4e9]">
            My Quiz Library
          </h3>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xl text-[#9394a5] md:text-3xl">{total} items</p>
            <Button
              asChild
              data-tv-id="quizzes-create-button"
              className={playerButtonBaseClass + " " + playerButtonCyanClass}
            >
              <Link href="/dashboard/create">Create Quiz</Link>
            </Button>
          </div>
        </div>

        {error ? (
          <p className="rounded-2xl border border-rose-500/50 bg-rose-500/10 p-4 text-base text-rose-200 md:text-lg">
            {error}
          </p>
        ) : null}

        {loading ? (
          <div className="rounded-3xl border border-[#252940] bg-[#1a1d2e]/78 p-7 text-lg text-[#9394a5] md:text-2xl">
            Loading your quizzes...
          </div>
        ) : null}

        {!loading && rows.length === 0 && jobs.length === 0 ? (
          <div className="rounded-3xl border border-[#252940] bg-[#1a1d2e]/78 p-8 text-center md:p-10">
            <p className="text-3xl font-semibold text-[#e4e4e9] md:text-4xl">
              No quizzes yet. Generate your first quiz!
            </p>
            <Button
              asChild
              className={"mt-5 " + playerButtonBaseClass + " " + playerButtonCyanClass}
            >
              <Link href="/dashboard/create">Create Quiz</Link>
            </Button>
          </div>
        ) : null}

        {!loading ? (
          <div
            data-tv-scope="quizzes-grid"
            className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
          >
            {displayItems.map((item) => {
              if (item.kind === "job") {
                const { job } = item;
                const isGenerating = job.status === "pending" || job.status === "processing";
                return (
                  <div
                    key={job.id}
                    className="min-h-[420px] rounded-3xl border border-[#252940] bg-[#1a1d2e]/92 p-6 md:p-7"
                  >
                    <h4 className="text-3xl font-bold text-[#e4e4e9] md:text-4xl">{job.theme}</h4>
                    <p className="mt-4 text-lg text-[#9394a5] md:text-2xl">Mode: {job.gameMode}</p>
                    <p className="text-lg text-[#9394a5] md:text-2xl">Difficulty: {job.difficulty}</p>
                    <div className="mt-6 rounded-2xl border border-[#252940] bg-[#0f1117]/82 p-5">
                      {isGenerating ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-3 text-lg text-amber-200 md:text-2xl">
                            <Loader2 className="size-5 animate-spin" />
                            Generating...
                          </div>
                          <p className="text-base text-amber-100/85 md:text-lg">
                            This can take up to 1 minute.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center gap-3 text-lg text-rose-200 md:text-2xl">
                            <AlertTriangle className="size-5" />
                            Failed
                          </div>
                          <p className="text-base text-rose-300 md:text-lg">
                            {job.errorMessage ?? "Generation failed."}
                          </p>
                        </div>
                      )}
                    </div>
                    <p className="mt-5 text-base text-[#9394a5] md:text-lg">
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
                  generationProvider={quiz.generationProvider}
                  questionCount={quiz.questionCount}
                  playCount={quiz.playCount}
                  likeRatio={quiz.likeRatio}
                  creatorName={creatorName}
                  creatorImage={creatorImage}
                  statusLabel="Ready"
                  statusTone="ready"
                  size="large"
                >
                  <div className="flex flex-wrap gap-2">
                    <Button
                      asChild
                      className={playerButtonBaseClass + " " + playerButtonCyanClass}
                    >
                      <Link href={`/play/${quiz.id}`}>
                        <Play className="mr-2 size-5" />
                        Play
                      </Link>
                    </Button>
                    <Button
                      asChild
                      variant="outline"
                      className={playerButtonBaseClass + " " + playerButtonSecondaryClass}
                    >
                      <Link href={`/dashboard/${quiz.id}`}>View Details</Link>
                    </Button>
                    <Button
                      variant="outline"
                      className={playerButtonBaseClass + " " + playerButtonDangerClass}
                      onClick={() => setQuizPendingDelete(quiz)}
                      disabled={deletingQuizId === quiz.id}
                    >
                      <Trash2 className="mr-2 size-5" />
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
              className="min-h-14 rounded-2xl border-[#6c8aff]/45 bg-[#6c8aff]/12 px-6 text-lg text-[#e4e4e9] hover:bg-[#6c8aff]/18 md:text-xl"
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
          className="max-w-md rounded-3xl border border-[#252940] bg-gradient-to-br from-[#1a1d2e] to-[#0f1117] p-6 text-[#e4e4e9] shadow-2xl"
        >
          <AlertDialogHeader className="place-items-start text-left">
            <AlertDialogTitle className="text-3xl font-black tracking-tight text-[#e4e4e9]">
              Delete Quiz
            </AlertDialogTitle>
            <AlertDialogDescription className="text-lg leading-relaxed text-[#9394a5]">
              {quizPendingDelete
                ? `Delete "${quizPendingDelete.title}" and all related sessions? This cannot be undone.`
                : "This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <AlertDialogCancel
              disabled={Boolean(deletingQuizId)}
              className={playerButtonBaseClass + " " + playerButtonSecondaryClass}
            >
              Cancel
            </AlertDialogCancel>
            <Button
              variant="outline"
              className={playerButtonBaseClass + " " + playerButtonDangerClass}
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
