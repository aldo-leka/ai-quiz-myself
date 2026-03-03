"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Clock3,
  Gamepad2,
  Shuffle,
  ThumbsUp,
  Trophy,
  Tv,
  UserRound,
  Users,
} from "lucide-react";
import { GameButton } from "@/components/quiz/GameButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type HubQuiz = {
  id: string;
  title: string;
  theme: string;
  difficulty: "easy" | "medium" | "hard" | "mixed" | "escalating";
  gameMode: "single" | "wwtbam" | "couch_coop";
  questionCount: number;
  playCount: number;
  likes: number;
  dislikes: number;
  likeRatio: number | null;
};

type HubResponse = {
  quizzes: HubQuiz[];
  total: number;
  page: number;
  hasMore: boolean;
};

type HubSort = "popular" | "newest";
type DifficultyFilter = "all" | "easy" | "medium" | "hard" | "mixed";
type ModeFilter = "all" | "single" | "wwtbam" | "couch_coop";

const DEFAULT_LIMIT = 20;

const DIFFICULTY_OPTIONS: Array<{ value: DifficultyFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
  { value: "mixed", label: "Mixed" },
];

const MODE_OPTIONS: Array<{ value: ModeFilter; label: string }> = [
  { value: "all", label: "All Modes" },
  { value: "single", label: "Single Player" },
  { value: "couch_coop", label: "Couch Co-op" },
  { value: "wwtbam", label: "WWTBAM" },
];

const SORT_OPTIONS: Array<{ value: HubSort; label: string }> = [
  { value: "popular", label: "Popular" },
  { value: "newest", label: "Newest" },
];

function normalizeSort(value: string | null): HubSort {
  return value === "newest" ? "newest" : "popular";
}

function normalizeDifficulty(value: string | null): DifficultyFilter {
  if (value === "easy" || value === "medium" || value === "hard" || value === "mixed") {
    return value;
  }
  return "all";
}

function normalizeMode(value: string | null): ModeFilter {
  if (value === "single" || value === "wwtbam" || value === "couch_coop") return value;
  return "all";
}

function normalizePositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function getGridColumns(width: number): number {
  if (width < 768) return 1;
  if (width < 1280) return 2;
  if (width < 1536) return 3;
  return 4;
}

function formatLikeRatio(likeRatio: number | null): string {
  if (likeRatio === null) return "No votes";
  return `${Math.round(likeRatio * 100)}% likes`;
}

function difficultyBadgeClass(difficulty: HubQuiz["difficulty"]): string {
  if (difficulty === "easy") return "border-emerald-500/50 bg-emerald-500/20 text-emerald-200";
  if (difficulty === "medium") return "border-amber-500/50 bg-amber-500/20 text-amber-200";
  if (difficulty === "hard") return "border-rose-500/50 bg-rose-500/20 text-rose-200";
  if (difficulty === "escalating") return "border-violet-500/50 bg-violet-500/20 text-violet-200";
  return "border-cyan-500/50 bg-cyan-500/20 text-cyan-200";
}

function gameModeMeta(mode: HubQuiz["gameMode"]): {
  label: string;
  icon: React.ReactNode;
} {
  if (mode === "single") {
    return { label: "Single Player", icon: <UserRound className="size-5" /> };
  }
  if (mode === "couch_coop") {
    return { label: "Couch Co-op", icon: <Users className="size-5" /> };
  }
  return { label: "WWTBAM", icon: <Tv className="size-5" /> };
}

function FilterPill({
  isActive,
  onClick,
  children,
}: {
  isActive: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-12 min-w-12 rounded-full border px-5 py-2 text-lg font-semibold transition",
        "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
        isActive
          ? "border-cyan-400 bg-cyan-500/20 text-cyan-100"
          : "border-slate-700 bg-slate-900 text-slate-200",
      )}
    >
      {children}
    </button>
  );
}

function QuizSkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {Array.from({ length: 12 }).map((_, index) => (
        <div
          key={`skeleton-${index}`}
          className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5"
        >
          <Skeleton className="h-8 w-3/4 bg-slate-800" />
          <div className="mt-4 flex gap-2">
            <Skeleton className="h-7 w-24 rounded-full bg-slate-800" />
            <Skeleton className="h-7 w-20 rounded-full bg-slate-800" />
          </div>
          <div className="mt-5 space-y-3">
            <Skeleton className="h-6 w-full bg-slate-800" />
            <Skeleton className="h-6 w-5/6 bg-slate-800" />
          </div>
          <div className="mt-6 grid grid-cols-2 gap-2">
            <Skeleton className="h-10 bg-slate-800" />
            <Skeleton className="h-10 bg-slate-800" />
            <Skeleton className="h-10 bg-slate-800" />
            <Skeleton className="h-10 bg-slate-800" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pageRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [gridColumns, setGridColumns] = useState(4);

  const [hubQuizzes, setHubQuizzes] = useState<HubQuiz[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSurpriseLoading, setIsSurpriseLoading] = useState(false);
  const [hubError, setHubError] = useState<string | null>(null);
  const previousFetchRef = useRef<{ key: string; page: number }>({
    key: "",
    page: 1,
  });

  const filters = useMemo(() => {
    const difficulty = normalizeDifficulty(searchParams.get("difficulty"));
    const mode = normalizeMode(searchParams.get("mode"));
    const sort = normalizeSort(searchParams.get("sort"));
    const page = normalizePositiveInt(searchParams.get("page"), 1);
    const limit = normalizePositiveInt(searchParams.get("limit"), DEFAULT_LIMIT);

    return {
      difficulty,
      mode,
      sort,
      page,
      limit,
      fetchKey: `${difficulty}|${mode}|${sort}|${limit}`,
    };
  }, [searchParams]);

  const updateQueryParams = useCallback(
    (
      updates: Partial<{
        difficulty: DifficultyFilter;
        mode: ModeFilter;
        sort: HubSort;
        page: number;
        limit: number;
      }>,
      pushHistory = false,
    ) => {
      const next = new URLSearchParams(searchParams.toString());

      const setOrDelete = (key: string, value: string | null | undefined) => {
        if (!value) {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      };

      if (updates.difficulty !== undefined) {
        setOrDelete("difficulty", updates.difficulty === "all" ? null : updates.difficulty);
      }

      if (updates.mode !== undefined) {
        setOrDelete("mode", updates.mode === "all" ? null : updates.mode);
      }

      if (updates.sort !== undefined) {
        setOrDelete("sort", updates.sort === "popular" ? null : updates.sort);
      }

      if (updates.page !== undefined) {
        setOrDelete("page", updates.page <= 1 ? null : String(updates.page));
      }

      if (updates.limit !== undefined) {
        setOrDelete("limit", updates.limit === DEFAULT_LIMIT ? null : String(updates.limit));
      }

      const query = next.toString();
      const href = query ? `/?${query}` : "/";

      if (pushHistory) {
        router.push(href, { scroll: false });
      } else {
        router.replace(href, { scroll: false });
      }
    },
    [router, searchParams],
  );

  useEffect(() => {
    let isCancelled = false;
    const controller = new AbortController();

    async function fetchHubPage(pageNumber: number): Promise<HubResponse> {
      const params = new URLSearchParams();
      if (filters.difficulty !== "all") params.set("difficulty", filters.difficulty);
      if (filters.mode !== "all") params.set("mode", filters.mode);
      if (filters.sort !== "popular") params.set("sort", filters.sort);
      params.set("page", String(pageNumber));
      params.set("limit", String(filters.limit));

      const response = await fetch(`/api/quiz/hub?${params.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error("Failed to load hub quizzes.");
      }

      return (await response.json()) as HubResponse;
    }

    async function loadHubQuizzes() {
      const isLoadMore =
        previousFetchRef.current.key === filters.fetchKey &&
        filters.page === previousFetchRef.current.page + 1;

      setHubError(null);
      if (isLoadMore) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }

      try {
        if (isLoadMore) {
          const payload = await fetchHubPage(filters.page);
          if (isCancelled) return;
          setHubQuizzes((previous) => [...previous, ...payload.quizzes]);
          setTotal(payload.total);
          setHasMore(payload.hasMore);
        } else if (filters.page > 1) {
          const pages = Array.from({ length: filters.page }, (_, index) => index + 1);
          const responses = await Promise.all(pages.map((pageNumber) => fetchHubPage(pageNumber)));
          if (isCancelled) return;

          const merged = responses.flatMap((response) => response.quizzes);
          const unique = Array.from(new Map(merged.map((quiz) => [quiz.id, quiz])).values());
          const lastPage = responses[responses.length - 1];

          setHubQuizzes(unique);
          setTotal(lastPage?.total ?? unique.length);
          setHasMore(lastPage?.hasMore ?? false);
        } else {
          const payload = await fetchHubPage(1);
          if (isCancelled) return;
          setHubQuizzes(payload.quizzes);
          setTotal(payload.total);
          setHasMore(payload.hasMore);
        }

        previousFetchRef.current = {
          key: filters.fetchKey,
          page: filters.page,
        };
      } catch (error) {
        if (!isCancelled) {
          setHubError(error instanceof Error ? error.message : "Failed to load quizzes.");
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
          setIsLoadingMore(false);
        }
      }
    }

    void loadHubQuizzes();

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [filters]);

  useEffect(() => {
    const updateColumns = () => {
      setGridColumns(getGridColumns(window.innerWidth));
    };

    updateColumns();
    window.addEventListener("resize", updateColumns);
    return () => window.removeEventListener("resize", updateColumns);
  }, []);

  useEffect(() => {
    const rootNode = pageRef.current;
    if (!rootNode) return;

    const handleArrowFocusNavigation = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (
        event.key !== "ArrowLeft" &&
        event.key !== "ArrowRight" &&
        event.key !== "ArrowUp" &&
        event.key !== "ArrowDown"
      ) {
        return;
      }

      const activeElement = document.activeElement as HTMLElement | null;
      if (!activeElement || !rootNode.contains(activeElement)) return;

      // Preserve cursor navigation inside text inputs.
      if (activeElement.tagName === "INPUT" || activeElement.tagName === "TEXTAREA") {
        return;
      }

      const focusableElements = Array.from(
        rootNode.querySelectorAll<HTMLElement>(
          "button,[href],input,select,textarea,[tabindex]:not([tabindex='-1'])",
        ),
      ).filter((element) => {
        if (element.hasAttribute("disabled")) return false;
        if (element.getAttribute("aria-hidden") === "true") return false;
        return true;
      });

      const currentIndex = focusableElements.indexOf(activeElement);
      if (currentIndex < 0) return;

      const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
      const nextIndex = Math.max(
        0,
        Math.min(focusableElements.length - 1, currentIndex + direction),
      );

      if (nextIndex !== currentIndex) {
        event.preventDefault();
        focusableElements[nextIndex]?.focus();
      }
    };

    rootNode.addEventListener("keydown", handleArrowFocusNavigation);
    return () => {
      rootNode.removeEventListener("keydown", handleArrowFocusNavigation);
    };
  }, []);

  async function handleSurpriseMe() {
    setIsSurpriseLoading(true);
    setHubError(null);

    try {
      const params = new URLSearchParams();
      if (filters.mode !== "all") {
        params.set("mode", filters.mode);
      }

      const response = await fetch(`/api/quiz/random?${params.toString()}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("No hub quiz available for this mode yet.");
      }

      const payload = (await response.json()) as { quiz: { id: string } };
      router.push(`/play/${payload.quiz.id}`);
    } catch (error) {
      setHubError(error instanceof Error ? error.message : "Could not start a random quiz.");
      setIsSurpriseLoading(false);
    }
  }

  function moveCardFocus(currentIndex: number, direction: "up" | "down" | "left" | "right") {
    const lastIndex = hubQuizzes.length - 1;
    if (lastIndex < 0) return;

    let nextIndex = currentIndex;

    if (direction === "left") nextIndex = Math.max(0, currentIndex - 1);
    if (direction === "right") nextIndex = Math.min(lastIndex, currentIndex + 1);
    if (direction === "up") nextIndex = Math.max(0, currentIndex - gridColumns);
    if (direction === "down") nextIndex = Math.min(lastIndex, currentIndex + gridColumns);

    cardRefs.current[nextIndex]?.focus();
  }

  function handleCardKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
    quizId: string,
  ) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      router.push(`/play/${quizId}`);
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveCardFocus(index, "left");
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveCardFocus(index, "right");
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveCardFocus(index, "up");
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveCardFocus(index, "down");
    }
  }

  return (
    <div ref={pageRef} className="min-h-screen bg-slate-950 text-slate-100">
      <main className="mx-auto w-full max-w-[1700px] space-y-8 px-4 py-6 md:px-8 md:py-8">
        <section className="rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-6 shadow-2xl md:p-8">
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="text-4xl font-black tracking-tight text-slate-100 md:text-6xl">
                QuizPlus Hub
              </h1>
              <p className="mt-3 text-lg text-slate-300 md:text-2xl">
                Browse hub quizzes, filter by mode and difficulty, then jump straight into play.
              </p>
            </div>

            <div className="flex flex-col gap-4 xl:flex-row xl:justify-end">
              <GameButton
                centered
                className="min-h-14 w-full max-w-full border-cyan-500/50 bg-cyan-500/20 text-lg text-cyan-100 xl:w-auto xl:min-w-64"
                onClick={() => void handleSurpriseMe()}
                disabled={isSurpriseLoading}
                icon={<Shuffle className="size-6" />}
              >
                {isSurpriseLoading ? "Finding Quiz..." : "Surprise Me"}
              </GameButton>
            </div>
          </div>
        </section>

        <section className="space-y-6 rounded-3xl border border-slate-800 bg-slate-900/60 p-4 md:p-6">
          <div className="space-y-3">
            <h2 className="text-2xl font-bold text-slate-100">Game Mode</h2>
            <div className="flex flex-wrap gap-3">
              {MODE_OPTIONS.map((option) => (
                <FilterPill
                  key={option.value}
                  isActive={filters.mode === option.value}
                  onClick={() => updateQueryParams({ mode: option.value, page: 1 })}
                >
                  {option.label}
                </FilterPill>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-2xl font-bold text-slate-100">Difficulty</h2>
            <div className="flex flex-wrap gap-3">
              {DIFFICULTY_OPTIONS.map((option) => (
                <FilterPill
                  key={option.value}
                  isActive={filters.difficulty === option.value}
                  onClick={() => updateQueryParams({ difficulty: option.value, page: 1 })}
                >
                  {option.label}
                </FilterPill>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-2xl font-bold text-slate-100">Sort</h2>
            <div className="flex flex-wrap gap-3">
              {SORT_OPTIONS.map((option) => (
                <FilterPill
                  key={option.value}
                  isActive={filters.sort === option.value}
                  onClick={() => updateQueryParams({ sort: option.value, page: 1 })}
                >
                  {option.label}
                </FilterPill>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-3xl font-black tracking-tight text-slate-100">Browse & Play</h2>
            <p className="text-lg text-slate-300">
              {total} quiz{total === 1 ? "" : "es"}
            </p>
          </div>

          {hubError ? (
            <p className="rounded-xl border border-rose-500/50 bg-rose-500/10 p-4 text-lg text-rose-200">
              {hubError}
            </p>
          ) : null}

          {isLoading ? <QuizSkeletonGrid /> : null}

          {!isLoading && hubQuizzes.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-8 text-center">
              <p className="text-2xl font-semibold text-slate-200">
                No quizzes found. Try different filters.
              </p>
            </div>
          ) : null}

          {!isLoading && hubQuizzes.length > 0 ? (
            <>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {hubQuizzes.map((quiz, index) => {
                  const modeMeta = gameModeMeta(quiz.gameMode);
                  return (
                    <button
                      key={quiz.id}
                      ref={(node) => {
                        cardRefs.current[index] = node;
                      }}
                      type="button"
                      onClick={() => router.push(`/play/${quiz.id}`)}
                      onKeyDown={(event) => handleCardKeyDown(event, index, quiz.id)}
                      className={cn(
                        "group min-h-[320px] rounded-2xl border border-slate-700 bg-slate-900/90 p-5 text-left transition",
                        "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
                      )}
                    >
                      <h3 className="line-clamp-2 text-2xl font-bold text-slate-100">{quiz.title}</h3>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Badge
                          variant="outline"
                          className="min-h-8 border-cyan-500/40 bg-cyan-500/10 px-3 text-sm text-cyan-100"
                        >
                          {quiz.theme}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn("min-h-8 px-3 text-sm", difficultyBadgeClass(quiz.difficulty))}
                        >
                          {quiz.difficulty === "escalating" ? "Escalating" : quiz.difficulty}
                        </Badge>
                      </div>

                      <div className="mt-5 flex items-center gap-2 text-lg text-slate-200">
                        <span className="text-cyan-300">{modeMeta.icon}</span>
                        <span>{modeMeta.label}</span>
                      </div>

                      <div className="mt-5 grid grid-cols-2 gap-3 text-base text-slate-300">
                        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                          <div className="flex items-center gap-2 text-slate-400">
                            <Gamepad2 className="size-4" />
                            Questions
                          </div>
                          <div className="mt-1 text-2xl font-bold text-slate-100">{quiz.questionCount}</div>
                        </div>
                        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                          <div className="flex items-center gap-2 text-slate-400">
                            <Trophy className="size-4" />
                            Plays
                          </div>
                          <div className="mt-1 text-2xl font-bold text-slate-100">{quiz.playCount}</div>
                        </div>
                        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                          <div className="flex items-center gap-2 text-slate-400">
                            <ThumbsUp className="size-4" />
                            Rating
                          </div>
                          <div className="mt-1 text-xl font-bold text-slate-100">
                            {formatLikeRatio(quiz.likeRatio)}
                          </div>
                        </div>
                        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                          <div className="flex items-center gap-2 text-slate-400">
                            <Clock3 className="size-4" />
                            Status
                          </div>
                          <div className="mt-1 text-xl font-bold text-cyan-200">Ready</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {hasMore ? (
                <div className="flex justify-center pt-2">
                  <Button
                    type="button"
                    onClick={() => updateQueryParams({ page: filters.page + 1 }, true)}
                    disabled={isLoadingMore}
                    variant="outline"
                    className="min-h-14 min-w-56 border-cyan-500/50 bg-cyan-500/10 px-8 text-lg font-semibold text-cyan-100 hover:bg-cyan-500/20 focus-visible:ring-cyan-400/60"
                  >
                    {isLoadingMore ? "Loading More..." : "Load More"}
                  </Button>
                </div>
              ) : null}
            </>
          ) : null}
        </section>
      </main>
    </div>
  );
}
