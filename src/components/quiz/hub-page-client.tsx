"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Shuffle,
} from "lucide-react";
import { GameButton } from "@/components/quiz/GameButton";
import { FilterPill } from "@/components/quiz/FilterPill";
import { QuizCard, type QuizCardGenerationProvider } from "@/components/quiz/QuizCard";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import { clearMyQuizzesRandomPlaybackContext } from "@/lib/my-quizzes-random-client";
import { cn } from "@/lib/utils";

type HubQuiz = {
  id: string;
  title: string;
  theme: string;
  difficulty: "easy" | "medium" | "hard" | "mixed" | "escalating";
  gameMode: "single" | "wwtbam" | "couch_coop";
  generationProvider: QuizCardGenerationProvider | null;
  questionCount: number;
  playCount: number;
  likes: number;
  dislikes: number;
  likeRatio: number | null;
  creatorName: string | null;
  creatorImage: string | null;
};

type HubResponse = {
  quizzes: HubQuiz[];
  total: number;
  page: number;
  hasMore: boolean;
};

type PopularTheme = {
  theme: string;
  totalPlayCount: number;
  quizCount: number;
};

type HubThemesResponse = {
  themes: PopularTheme[];
};

type HubSort = "popular" | "newest";
type DifficultyFilter = "all" | "easy" | "medium" | "hard" | "mixed";
type ModeFilter = "all" | "single" | "wwtbam" | "couch_coop";
type HubFilters = {
  difficulty: DifficultyFilter;
  mode: ModeFilter;
  theme: string | null;
  sort: HubSort;
};

const DEFAULT_LIMIT = 20;
const HUB_FILTERS_STORAGE_KEY = "quizplus:filters:hub:v2";
const defaultHubFilters: HubFilters = {
  difficulty: "all",
  mode: "all",
  theme: null,
  sort: "popular",
};

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

const hubFilterPillClassName =
  "min-h-10 px-3.5 text-base focus:outline-none focus:ring-4 focus:ring-[#818cf8]/70 md:min-h-14 md:px-5 md:text-xl xl:min-h-16 xl:px-6 xl:text-[1.5rem]";

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
  if (value === "all" || value === "single" || value === "wwtbam" || value === "couch_coop") {
    return value;
  }
  return "all";
}

function normalizeTheme(value: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function loadStoredHubFilters(): HubFilters {
  if (typeof window === "undefined") {
    return defaultHubFilters;
  }

  try {
    const rawValue = window.localStorage.getItem(HUB_FILTERS_STORAGE_KEY);
    if (!rawValue) {
      return defaultHubFilters;
    }

    const parsed = JSON.parse(rawValue) as {
      difficulty?: unknown;
      mode?: unknown;
      theme?: unknown;
      sort?: unknown;
    };

    return {
      difficulty: normalizeDifficulty(
        typeof parsed.difficulty === "string" ? parsed.difficulty : null,
      ),
      mode: normalizeMode(typeof parsed.mode === "string" ? parsed.mode : null),
      theme: normalizeTheme(typeof parsed.theme === "string" ? parsed.theme : null),
      sort: normalizeSort(typeof parsed.sort === "string" ? parsed.sort : null),
    };
  } catch {
    return defaultHubFilters;
  }
}

function userInitials(name: string): string {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .slice(0, 2);

  if (parts.length === 0) return "U";
  return parts.map((part) => part[0]!.toUpperCase()).join("");
}

function getGridColumns(width: number): number {
  if (width < 768) return 1;
  if (width < 1280) return 2;
  if (width < 1536) return 3;
  return 4;
}

function QuizSkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {Array.from({ length: 12 }).map((_, index) => (
        <div
          key={`skeleton-${index}`}
          className="rounded-2xl border border-[#252940] bg-[#1a1d2e]/86 p-5"
        >
          <Skeleton className="h-8 w-3/4 bg-[#252940]" />
          <div className="mt-4 flex gap-2">
            <Skeleton className="h-7 w-24 rounded-full bg-[#252940]" />
            <Skeleton className="h-7 w-20 rounded-full bg-[#252940]" />
          </div>
          <div className="mt-5 space-y-3">
            <Skeleton className="h-6 w-full bg-[#252940]" />
            <Skeleton className="h-6 w-5/6 bg-[#252940]" />
          </div>
          <div className="mt-6 grid grid-cols-2 gap-2">
            <Skeleton className="h-10 bg-[#252940]" />
            <Skeleton className="h-10 bg-[#252940]" />
            <Skeleton className="h-10 bg-[#252940]" />
            <Skeleton className="h-10 bg-[#252940]" />
          </div>
        </div>
      ))}
    </div>
  );
}

function HomePageContent() {
  const router = useRouter();
  const { data: sessionData } = authClient.useSession();
  const pageRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const surpriseButtonRef = useRef<HTMLButtonElement | null>(null);
  const didAutoFocusHubRef = useRef(false);
  const [gridColumns, setGridColumns] = useState(4);

  const [hubQuizzes, setHubQuizzes] = useState<HubQuiz[]>([]);
  const [popularThemes, setPopularThemes] = useState<PopularTheme[]>([]);
  const [didLoadThemes, setDidLoadThemes] = useState(false);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSurpriseLoading, setIsSurpriseLoading] = useState(false);
  const [hubError, setHubError] = useState<string | null>(null);
  const [filters, setFilters] = useState<HubFilters>(defaultHubFilters);
  const [page, setPage] = useState(1);
  const [filtersReady, setFiltersReady] = useState(false);
  const previousFetchRef = useRef<{ key: string; page: number }>({
    key: "",
    page: 1,
  });

  const filterFetchKey = useMemo(
    () => `${filters.difficulty}|${filters.mode}|${filters.theme ?? "all"}|${filters.sort}|${DEFAULT_LIMIT}`,
    [filters],
  );

  const updateFilters = useCallback(
    (updates: Partial<HubFilters>) => {
      const nextFilters: HubFilters = {
        difficulty: updates.difficulty ?? filters.difficulty,
        mode: updates.mode ?? filters.mode,
        theme: updates.theme !== undefined ? updates.theme : filters.theme,
        sort: updates.sort ?? filters.sort,
      };

      if (
        nextFilters.difficulty === filters.difficulty &&
        nextFilters.mode === filters.mode &&
        nextFilters.theme === filters.theme &&
        nextFilters.sort === filters.sort
      ) {
        return;
      }

      setHubError(null);
      setFilters(nextFilters);
      setPage(1);
    },
    [filters],
  );

  useEffect(() => {
    setFilters(loadStoredHubFilters());
    setFiltersReady(true);
  }, []);

  useEffect(() => {
    if (!filtersReady || typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(HUB_FILTERS_STORAGE_KEY, JSON.stringify(filters));
    } catch {
      // Ignore storage write failures and keep the view usable.
    }
  }, [filters, filtersReady]);

  useEffect(() => {
    if (!filtersReady) {
      return;
    }

    let isCancelled = false;
    const controller = new AbortController();

    async function fetchHubPage(pageNumber: number): Promise<HubResponse> {
      const params = new URLSearchParams();
      if (filters.difficulty !== "all") params.set("difficulty", filters.difficulty);
      if (filters.mode !== "all") params.set("mode", filters.mode);
      if (filters.theme) params.set("theme", filters.theme);
      if (filters.sort !== "popular") params.set("sort", filters.sort);
      params.set("page", String(pageNumber));
      params.set("limit", String(DEFAULT_LIMIT));

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
        previousFetchRef.current.key === filterFetchKey &&
        page === previousFetchRef.current.page + 1;

      setHubError(null);
      if (isLoadMore) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }

      try {
        if (isLoadMore) {
          const payload = await fetchHubPage(page);
          if (isCancelled) return;
          setHubQuizzes((previous) => [...previous, ...payload.quizzes]);
          setTotal(payload.total);
          setHasMore(payload.hasMore);
        } else if (page > 1) {
          const pages = Array.from({ length: page }, (_, index) => index + 1);
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
          key: filterFetchKey,
          page,
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
  }, [filterFetchKey, filters, filtersReady, page]);

  useEffect(() => {
    if (!filtersReady) {
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setDidLoadThemes(false);

    async function loadPopularThemes() {
      try {
        const params = new URLSearchParams({ limit: "10" });
        if (filters.mode !== "all") {
          params.set("mode", filters.mode);
        }

        const response = await fetch(`/api/quiz/hub/themes?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Failed to load themes.");
        }

        const payload = (await response.json()) as HubThemesResponse;
        if (!cancelled) {
          setPopularThemes(payload.themes);
        }
      } catch {
        if (!cancelled) {
          setPopularThemes([]);
        }
      } finally {
        if (!cancelled) {
          setDidLoadThemes(true);
        }
      }
    }

    void loadPopularThemes();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [filters.mode, filtersReady]);

  const featuredThemeOptions = useMemo(() => {
    const cappedThemes = popularThemes.slice(0, 4);

    if (!filters.theme) {
      return cappedThemes;
    }

    const alreadyVisible = cappedThemes.some((entry) => entry.theme === filters.theme);
    if (alreadyVisible) {
      return cappedThemes;
    }

    return [
      {
        theme: filters.theme,
        totalPlayCount: 0,
        quizCount: 0,
      },
      ...cappedThemes.slice(0, 3),
    ];
  }, [filters.theme, popularThemes]);

  useEffect(() => {
    const updateColumns = () => {
      setGridColumns(getGridColumns(window.innerWidth));
    };

    updateColumns();
    window.addEventListener("resize", updateColumns);
    return () => window.removeEventListener("resize", updateColumns);
  }, []);

  useEffect(() => {
    if (didAutoFocusHubRef.current || !didLoadThemes) return;
    const button = surpriseButtonRef.current;
    if (!button) return;

    didAutoFocusHubRef.current = true;

    const frame = window.requestAnimationFrame(() => {
      button.focus({ preventScroll: true });
      button.scrollIntoView({ block: "end", inline: "nearest" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [didLoadThemes]);

  useEffect(() => {
    const button = surpriseButtonRef.current;
    if (!button) return;
    if (document.activeElement !== button) return;

    const frame = window.requestAnimationFrame(() => {
      button.scrollIntoView({ block: "end", inline: "nearest" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [didLoadThemes, featuredThemeOptions.length, sessionData?.user?.id]);

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
      if (filters.theme) {
        params.set("theme", filters.theme);
      }

      const response = await fetch(`/api/quiz/random?${params.toString()}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("No hub quiz available for this mode yet.");
      }

      const payload = (await response.json()) as { quiz: { id: string } };
      clearMyQuizzesRandomPlaybackContext();
      router.push(`/play/${payload.quiz.id}`);
    } catch (error) {
      const fallbackMessage = filters.theme
        ? "No hub quiz available for this theme yet."
        : "Could not start a random quiz.";
      setHubError(error instanceof Error ? error.message : fallbackMessage);
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
      clearMyQuizzesRandomPlaybackContext();
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
      if (index < gridColumns) {
        surpriseButtonRef.current?.focus();
      } else {
        moveCardFocus(index, "up");
      }
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveCardFocus(index, "down");
    }
  }

  const surpriseButtonLabel = isSurpriseLoading ? "Finding Quiz..." : "Surprise Me";

  return (
    <div ref={pageRef} className="min-h-screen overflow-x-clip bg-[#0f1117] text-[#e4e4e9]">
      <main className="mx-auto w-full max-w-[1700px] space-y-8 px-4 py-5 md:px-8 md:py-8">
        <section className="rounded-3xl border border-[#252940] bg-gradient-to-br from-[#1a1d2e] to-[#0f1117] p-4 shadow-2xl md:p-8">
          <div className="space-y-4 md:space-y-8">
            <div className="flex flex-wrap items-start justify-between gap-4 md:gap-5">
              <h1 className="text-4xl leading-[0.92] font-black tracking-tight text-[#e4e4e9] sm:text-5xl md:text-8xl xl:text-[6.5rem]">
                QuizPlus Hub
              </h1>
            </div>

            <div className="grid gap-3 md:gap-4 lg:grid-cols-2 xl:grid-cols-4">
              <div className="min-w-0 space-y-2 rounded-2xl border border-[#252940] bg-[#1a1d2e]/72 p-3 md:space-y-3 md:p-4">
                <p className="text-xs font-semibold tracking-[0.24em] text-[#9394a5] uppercase md:text-sm">
                  Sort
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1 pr-1 md:flex-wrap md:gap-3 md:overflow-visible md:pb-0 md:pr-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {SORT_OPTIONS.map((option) => (
                    <FilterPill
                      key={option.value}
                      isActive={filters.sort === option.value}
                      className={`${hubFilterPillClassName} shrink-0`}
                      onClick={() => updateFilters({ sort: option.value })}
                    >
                      {option.label}
                    </FilterPill>
                  ))}
                </div>
              </div>

              <div className="min-w-0 space-y-2 rounded-2xl border border-[#252940] bg-[#1a1d2e]/72 p-3 md:space-y-3 md:p-4">
                <p className="text-xs font-semibold tracking-[0.24em] text-[#9394a5] uppercase md:text-sm">
                  Popular Themes
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1 pr-1 md:flex-wrap md:gap-3 md:overflow-visible md:pb-0 md:pr-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <FilterPill
                    isActive={filters.theme === null}
                    className={`${hubFilterPillClassName} max-w-[14rem] shrink-0 md:max-w-[15rem] md:shrink xl:max-w-[16rem]`}
                    onClick={() => updateFilters({ theme: null })}
                  >
                    All Themes
                  </FilterPill>
                  {featuredThemeOptions.map((entry) => (
                    <FilterPill
                      key={entry.theme}
                      isActive={filters.theme === entry.theme}
                      className={`${hubFilterPillClassName} max-w-[16rem] shrink-0 md:max-w-[17.5rem] md:shrink xl:max-w-[18.5rem]`}
                      onClick={() => updateFilters({ theme: entry.theme })}
                    >
                      {entry.theme}
                    </FilterPill>
                  ))}
                </div>
              </div>

              <div className="min-w-0 space-y-2 rounded-2xl border border-[#252940] bg-[#1a1d2e]/72 p-3 md:space-y-3 md:p-4">
                <p className="text-xs font-semibold tracking-[0.24em] text-[#9394a5] uppercase md:text-sm">
                  Difficulty
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1 pr-1 md:flex-wrap md:gap-3 md:overflow-visible md:pb-0 md:pr-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {DIFFICULTY_OPTIONS.map((option) => (
                    <FilterPill
                      key={option.value}
                      isActive={filters.difficulty === option.value}
                      className={`${hubFilterPillClassName} shrink-0`}
                      onClick={() => updateFilters({ difficulty: option.value })}
                    >
                      {option.label}
                    </FilterPill>
                  ))}
                </div>
              </div>

              <div className="min-w-0 space-y-2 rounded-2xl border border-[#252940] bg-[#1a1d2e]/72 p-3 md:space-y-3 md:p-4">
                <p className="text-xs font-semibold tracking-[0.24em] text-[#9394a5] uppercase md:text-sm">
                  Game Mode
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1 pr-1 md:flex-wrap md:gap-3 md:overflow-visible md:pb-0 md:pr-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {MODE_OPTIONS.map((option) => (
                    <FilterPill
                      key={option.value}
                      isActive={filters.mode === option.value}
                      className={`${hubFilterPillClassName} shrink-0`}
                      onClick={() => updateFilters({ mode: option.value, theme: null })}
                    >
                      {option.label}
                    </FilterPill>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-4">
              <div className="hidden sm:block" aria-hidden="true" />
              <GameButton
                ref={surpriseButtonRef}
                centered
                className="min-h-14 w-full max-w-full border-[#6c8aff]/45 bg-[#6c8aff]/18 text-xl text-[#e4e4e9] focus:outline-none focus:ring-4 focus:ring-[#818cf8]/70 sm:justify-self-center sm:w-auto sm:min-w-[18rem] md:min-h-20 md:text-3xl xl:min-w-[34rem] xl:text-5xl"
                onClick={() => void handleSurpriseMe()}
                disabled={isSurpriseLoading}
                icon={<Shuffle className="size-8 md:size-10 xl:size-12" />}
              >
                {surpriseButtonLabel}
              </GameButton>
              {sessionData?.user ? (
                <button
                  type="button"
                  onClick={() => router.push("/dashboard")}
                  className={cn(
                    "relative inline-flex min-h-12 w-full items-center justify-center rounded-full border border-[#252940] bg-[#1a1d2e]/86 px-4 py-2.5 text-lg font-semibold text-[#e4e4e9] transition sm:justify-self-end md:min-h-20 md:px-7 md:py-3 md:text-3xl xl:w-auto xl:text-4xl",
                    "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#818cf8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f1117]",
                  )}
                >
                  <Avatar className="absolute top-1/2 left-2 size-9 -translate-y-1/2 overflow-hidden border border-[#818cf8]/35 bg-[#1a1d2e]/86 shadow-none md:left-3 md:size-14">
                    <AvatarImage
                      src={
                        (
                          sessionData.user as typeof sessionData.user & {
                            avatarUrl?: string | null;
                          }
                        ).avatarUrl ??
                        sessionData.user.image ??
                        undefined
                      }
                      alt={sessionData.user.name}
                      className="object-cover object-center"
                    />
                    <AvatarFallback className="bg-[#252940] text-[#e4e4e9]">
                      {userInitials(sessionData.user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="block w-full px-12 text-center select-none md:px-16">
                    {sessionData.user.name.trim() || "Player"}
                  </span>
                  <Avatar
                    aria-hidden="true"
                    className="invisible absolute top-1/2 right-2 size-9 -translate-y-1/2 overflow-hidden border border-[#818cf8]/35 bg-[#1a1d2e]/86 shadow-none md:right-3 md:size-14"
                  />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => router.push("/sign-in?callbackURL=/dashboard")}
                  className={cn(
                    "min-h-12 w-full select-none rounded-full border border-[#6c8aff]/45 bg-[#6c8aff]/12 px-4 py-2.5 text-lg font-semibold whitespace-nowrap text-[#e4e4e9] transition sm:justify-self-end sm:w-auto md:min-h-20 md:px-8 md:py-3 md:text-3xl xl:text-4xl",
                    "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#818cf8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f1117]",
                  )}
                >
                  Not logged in
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-5xl font-black tracking-tight text-[#e4e4e9] md:text-7xl">
              Browse & Play
            </h2>
            <p className="text-3xl text-[#9394a5] md:text-5xl">
              {total} quiz{total === 1 ? "" : "es"}
            </p>
          </div>

          {hubError ? (
            <p className="rounded-xl border border-rose-500/50 bg-rose-500/10 p-4 text-2xl text-rose-200 md:text-4xl">
              {hubError}
            </p>
          ) : null}

          {isLoading ? <QuizSkeletonGrid /> : null}

          {!isLoading && hubQuizzes.length === 0 ? (
            <div className="rounded-2xl border border-[#252940] bg-[#1a1d2e]/78 p-8 text-center">
              <p className="text-3xl font-semibold text-[#e4e4e9] md:text-4xl">
                No quizzes found. Try different filters.
              </p>
            </div>
          ) : null}

          {!isLoading && hubQuizzes.length > 0 ? (
            <>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {hubQuizzes.map((quiz, index) => {
                  return (
                    <QuizCard
                      key={quiz.id}
                      interactive
                      cardRef={(node) => {
                        cardRefs.current[index] = node;
                      }}
                      title={quiz.title}
                      theme={quiz.theme}
                      difficulty={quiz.difficulty}
                      gameMode={quiz.gameMode}
                      generationProvider={quiz.generationProvider}
                      questionCount={quiz.questionCount}
                      playCount={quiz.playCount}
                      likeRatio={quiz.likeRatio}
                      creatorName={quiz.creatorName}
                      creatorImage={quiz.creatorImage}
                      size="large"
                      statusLabel="Ready"
                      onClick={() => {
                        clearMyQuizzesRandomPlaybackContext();
                        router.push(`/play/${quiz.id}`);
                      }}
                      onKeyDown={(event) => handleCardKeyDown(event, index, quiz.id)}
                    />
                  );
                })}
              </div>

              {hasMore ? (
                <div className="flex justify-center pt-2">
                  <Button
                    type="button"
                    onClick={() => setPage((previous) => previous + 1)}
                    disabled={isLoadingMore}
                    variant="outline"
                    className="min-h-20 min-w-72 border-[#6c8aff]/45 bg-[#6c8aff]/12 px-8 text-3xl font-semibold text-[#e4e4e9] hover:bg-[#6c8aff]/18 focus-visible:ring-[#818cf8]/55 md:text-4xl"
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

export function HubPageClient() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0f1117]" />}>
      <HomePageContent />
    </Suspense>
  );
}
