"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Clock3, Trophy, Tv, UserRound, Users } from "lucide-react";
import { FilterPill } from "@/components/quiz/FilterPill";
import { Button } from "@/components/ui/button";

type HistorySessionRow = {
  id: string;
  quizId: string;
  quizTitle: string;
  gameMode: "single" | "wwtbam" | "couch_coop";
  totalScore: number;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
};

type HistoryListResponse = {
  sessions: HistorySessionRow[];
  page: number;
  total: number;
  hasMore: boolean;
  error?: string;
};

type SessionAnswer = {
  id: string;
  questionId: string;
  questionText: string;
  options: Array<{ text: string; explanation: string }>;
  correctOptionIndex: number;
  selectedOptionIndex: number | null;
  isCorrect: boolean;
  timeTakenMs: number;
  position: number;
};

type HistoryDetailResponse = {
  session: {
    id: string;
    quizId: string;
    quizTitle: string;
    gameMode: "single" | "wwtbam" | "couch_coop";
    totalScore: number;
    startedAt: string;
    finishedAt: string | null;
    durationMs: number | null;
  };
  answers: SessionAnswer[];
  error?: string;
};

type ModeFilter = "all" | "single" | "wwtbam" | "couch_coop";
type SortFilter = "date" | "score";

const modeOptions: Array<{ value: ModeFilter; label: string }> = [
  { value: "all", label: "All Modes" },
  { value: "single", label: "Single Player" },
  { value: "couch_coop", label: "Couch Co-op" },
  { value: "wwtbam", label: "WWTBAM" },
];

const sortOptions: Array<{ value: SortFilter; label: string }> = [
  { value: "date", label: "Latest" },
  { value: "score", label: "Top Score" },
];

function modeMeta(mode: HistorySessionRow["gameMode"]) {
  if (mode === "single") return { label: "Single Player", icon: <UserRound className="size-4" /> };
  if (mode === "couch_coop") return { label: "Couch Co-op", icon: <Users className="size-4" /> };
  return { label: "WWTBAM", icon: <Tv className="size-4" /> };
}

function getCorrectAnswerText(answer: SessionAnswer): string {
  const option = answer.options[answer.correctOptionIndex];
  if (option?.text) {
    return option.text;
  }
  return "Unavailable";
}

export function DashboardHistoryPageClient() {
  const [rows, setRows] = useState<HistorySessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ModeFilter>("all");
  const [sort, setSort] = useState<SortFilter>("date");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [detailsBySessionId, setDetailsBySessionId] = useState<Record<string, SessionAnswer[]>>(
    {},
  );
  const [detailLoading, setDetailLoading] = useState<string | null>(null);

  const fetchKey = useMemo(() => `${mode}|${sort}|${page}`, [mode, sort, page]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: "20",
          gameMode: mode,
          sort,
        });
        const response = await fetch(`/api/dashboard/history?${params.toString()}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as HistoryListResponse;
        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to load history");
        }

        if (!cancelled) {
          setRows(payload.sessions);
          setHasMore(payload.hasMore);
          setTotal(payload.total);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "Failed to load history");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [fetchKey, mode, page, sort]);

  async function toggleExpanded(sessionId: string) {
    if (expandedSessionId === sessionId) {
      setExpandedSessionId(null);
      return;
    }

    setExpandedSessionId(sessionId);
    if (detailsBySessionId[sessionId]) return;

    setDetailLoading(sessionId);
    try {
      const response = await fetch(`/api/dashboard/history/${sessionId}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as HistoryDetailResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load session details");
      }
      setDetailsBySessionId((previous) => ({
        ...previous,
        [sessionId]: payload.answers,
      }));
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Failed to load session details");
    } finally {
      setDetailLoading(null);
    }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-6 rounded-3xl border border-[#252940] bg-[#1a1d2e]/68 p-5 md:p-8">
        <div className="space-y-3">
          <h2 className="text-3xl font-black tracking-tight text-[#e4e4e9] md:text-4xl">
            Game Mode
          </h2>
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
          <h2 className="text-3xl font-black tracking-tight text-[#e4e4e9] md:text-4xl">
            Sort
          </h2>
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

      <section className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[clamp(2.6rem,4vw,4.5rem)] font-black leading-[0.95] tracking-tight text-[#e4e4e9]">
            Play History
          </h3>
          <p className="text-xl text-[#9394a5] md:text-3xl">{total} sessions</p>
        </div>

        {error ? (
          <p className="rounded-2xl border border-rose-500/50 bg-rose-500/10 p-4 text-base text-rose-200 md:text-lg">
            {error}
          </p>
        ) : null}

        {loading ? (
          <div className="rounded-3xl border border-[#252940] bg-[#1a1d2e]/78 p-7 text-lg text-[#9394a5] md:text-2xl">
            Loading history...
          </div>
        ) : null}

        {!loading && rows.length === 0 ? (
          <div className="rounded-3xl border border-[#252940] bg-[#1a1d2e]/78 p-8 text-center md:p-10">
            <p className="text-3xl font-semibold text-[#e4e4e9] md:text-4xl">
              No games played yet. Browse the hub!
            </p>
            <Button
              asChild
              className="mt-5 min-h-14 rounded-2xl border-[#6c8aff]/45 bg-[#6c8aff]/18 px-6 text-lg text-[#e4e4e9] hover:bg-[#818cf8]/24 md:text-xl"
            >
              <Link href="/">Back to Hub</Link>
            </Button>
          </div>
        ) : null}

        <div className="space-y-4">
          {rows.map((row) => {
            const meta = modeMeta(row.gameMode);
            const isExpanded = expandedSessionId === row.id;
            const details = detailsBySessionId[row.id];

            return (
              <article
                key={row.id}
                className="rounded-3xl border border-[#252940] bg-[#1a1d2e]/78 p-5 md:p-6"
              >
                <button
                  type="button"
                  onClick={() => void toggleExpanded(row.id)}
                  className="flex w-full flex-wrap items-center justify-between gap-3 text-left"
                >
                  <div>
                    <p className="text-2xl font-semibold text-[#e4e4e9] md:text-3xl">
                      {row.quizTitle}
                    </p>
                    <p className="mt-2 inline-flex items-center gap-2 text-base text-[#9394a5] md:text-lg">
                      <span className="text-[#818cf8]">{meta.icon}</span>
                      {meta.label}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    <div className="inline-flex items-center gap-2 rounded-full border border-[#252940] bg-[#0f1117]/72 px-4 py-2 text-base text-[#e4e4e9] md:text-lg">
                      <Trophy className="size-5 text-[#818cf8]" />
                      Score {row.totalScore}
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-[#252940] bg-[#0f1117]/72 px-4 py-2 text-base text-[#e4e4e9] md:text-lg">
                      <Clock3 className="size-5 text-[#818cf8]" />
                      {row.durationMs !== null ? `${Math.round(row.durationMs / 1000)}s` : "In progress"}
                    </div>
                    <span className="text-[#9394a5]">
                      {isExpanded ? <ChevronUp className="size-6" /> : <ChevronDown className="size-6" />}
                    </span>
                  </div>
                </button>

                {isExpanded ? (
                  <div className="mt-5 space-y-3 border-t border-[#252940] pt-5">
                    {detailLoading === row.id ? (
                      <p className="text-base text-[#9394a5] md:text-lg">Loading answers...</p>
                    ) : details && details.length > 0 ? (
                      details.map((answer) => (
                        <div
                          key={answer.id}
                          className={`rounded-2xl border p-4 ${
                            answer.isCorrect
                              ? "border-emerald-500/50 bg-emerald-500/10"
                              : "border-rose-500/50 bg-rose-500/10"
                          }`}
                        >
                          <p className="text-base font-semibold text-[#e4e4e9] md:text-xl">
                            Q{answer.position}: {answer.questionText}
                          </p>
                          <p className="mt-1 text-base text-[#9394a5] md:text-lg">
                            {answer.isCorrect ? "Correct" : "Wrong"} · {Math.round(answer.timeTakenMs / 1000)}s
                          </p>
                          <div className="mt-2 space-y-1 text-base md:text-lg">
                            <p className="text-[#818cf8]">
                              Correct answer: {getCorrectAnswerText(answer)}
                            </p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-base text-[#9394a5] md:text-lg">
                        No answer breakdown available.
                      </p>
                    )}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>

        {hasMore ? (
          <div className="flex justify-center">
            <Button
              variant="outline"
              className="min-h-14 rounded-2xl border-[#6c8aff]/45 bg-[#6c8aff]/12 px-6 text-lg text-[#e4e4e9] hover:bg-[#6c8aff]/18 md:text-xl"
              onClick={() => setPage((previous) => previous + 1)}
            >
              Load More
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
