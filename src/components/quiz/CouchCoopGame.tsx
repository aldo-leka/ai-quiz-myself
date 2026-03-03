"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Medal, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { CircularButton } from "@/components/quiz/CircularButton";
import { GameButton } from "@/components/quiz/GameButton";
import { authClient } from "@/lib/auth-client";
import type { PlayableQuestion, QuizWithQuestions, SaveQuizSessionPayload } from "@/lib/quiz-types";
import { cn } from "@/lib/utils";

type CouchCoopGameProps = {
  quiz: QuizWithQuestions;
};

type GamePhase = "setup" | "question" | "reveal" | "complete";
type SaveStatus = "idle" | "saving" | "saved" | "error" | "anonymous";

type PlayerResult = {
  questionId: string;
  questionText: string;
  playerName: string;
  playerIndex: number;
  selectedOptionIndex: number | null;
  correctOptionIndex: number;
  isCorrect: boolean;
  timeTakenMs: number;
};

const QUESTION_TIME_SECONDS = 30;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;
const MAX_NAME_LENGTH = 20;

function formatSecondsFromMs(durationMs: number) {
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function timerBarClass(remainingSeconds: number) {
  const ratio = remainingSeconds / QUESTION_TIME_SECONDS;
  if (ratio > 0.5) return "from-emerald-400 to-emerald-500";
  if (ratio > 0.2) return "from-amber-400 to-amber-500";
  return "from-rose-400 to-rose-500";
}

function shuffleItems<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const randomIndex = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[randomIndex]] = [copy[randomIndex], copy[i]];
  }
  return copy;
}

function normalizePlayerNames(rawNames: string[]): string[] {
  return rawNames.map((name, index) => {
    const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
    return trimmed.length > 0 ? trimmed : `Player ${index + 1}`;
  });
}

export function CouchCoopGame({ quiz }: CouchCoopGameProps) {
  const router = useRouter();
  const { data: sessionData } = authClient.useSession();

  const [phase, setPhase] = useState<GamePhase>("setup");
  const [setupNames, setSetupNames] = useState<string[]>(["", ""]);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [timerEnabled, setTimerEnabled] = useState(true);

  const [questions, setQuestions] = useState<PlayableQuestion[]>([]);
  const [playerNames, setPlayerNames] = useState<string[]>([]);
  const [scores, setScores] = useState<number[]>([]);
  const [results, setResults] = useState<PlayerResult[]>([]);

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [focusedAnswerIndex, setFocusedAnswerIndex] = useState<number | null>(null);
  const [selectedAnswerIndex, setSelectedAnswerIndex] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(QUESTION_TIME_SECONDS);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const questionStartedAtRef = useRef(0);
  const startedAtRef = useRef<Date | null>(null);
  const finishedAtRef = useRef<Date | null>(null);
  const hasPersistedRef = useRef(false);
  const finalizedQuestionKeyRef = useRef<string | null>(null);

  const totalQuestions = questions.length;
  const currentQuestion = questions[currentQuestionIndex];
  const currentCorrectOptionIndex = currentQuestion?.correctOptionIndex ?? null;

  const currentPlayerIndex = playerNames.length > 0 ? currentQuestionIndex % playerNames.length : 0;
  const currentPlayerName = playerNames[currentPlayerIndex] ?? "Player";

  const timerPercentage = useMemo(() => {
    return Math.max(0, (remainingSeconds / QUESTION_TIME_SECONDS) * 100);
  }, [remainingSeconds]);

  const progressPercentage = useMemo(() => {
    if (totalQuestions === 0) return 0;
    return Math.min(100, ((currentQuestionIndex + 1) / totalQuestions) * 100);
  }, [currentQuestionIndex, totalQuestions]);

  const totalCorrect = useMemo(() => scores.reduce((sum, score) => sum + score, 0), [scores]);

  const leaderboard = useMemo(() => {
    return playerNames
      .map((name, index) => {
        const playerAnswers = results.filter((result) => result.playerIndex === index);
        const answerCount = playerAnswers.length;
        const avgTimeMs =
          answerCount > 0
            ? playerAnswers.reduce((sum, answer) => sum + answer.timeTakenMs, 0) / answerCount
            : 0;
        const score = scores[index] ?? 0;
        const correctRate = answerCount > 0 ? (score / answerCount) * 100 : 0;

        return {
          name,
          score,
          answerCount,
          avgTimeMs,
          correctRate,
        };
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.avgTimeMs !== b.avgTimeMs) return a.avgTimeMs - b.avgTimeMs;
        return a.name.localeCompare(b.name);
      });
  }, [playerNames, results, scores]);

  function stopCountdown() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  const persistCompletedSession = useCallback(
    (
      snapshotPlayers: string[],
      snapshotScores: number[],
      snapshotResults: PlayerResult[],
      finishedAt: Date,
    ) => {
      if (hasPersistedRef.current || !startedAtRef.current) return;

      hasPersistedRef.current = true;
      setSaveStatus("saving");

      const payload: SaveQuizSessionPayload = {
        quizId: quiz.id,
        gameMode: "couch_coop",
        score: snapshotScores.reduce((sum, score) => sum + score, 0),
        players: snapshotPlayers.map((name, index) => ({
          name,
          isOwner: index === 0,
        })),
        startedAt: startedAtRef.current.toISOString(),
        finishedAt: finishedAt.toISOString(),
        answers: snapshotResults.map((result) => ({
          questionId: result.questionId,
          playerName: result.playerName,
          selectedOptionIndex: result.selectedOptionIndex,
          isCorrect: result.isCorrect,
          timeTakenMs: result.timeTakenMs,
        })),
      };

      void fetch("/api/quiz/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error("Failed to save session");
          }
          setSaveStatus(sessionData?.user ? "saved" : "anonymous");
        })
        .catch(() => {
          setSaveStatus("error");
        });
    },
    [quiz.id, sessionData?.user],
  );

  const moveToNextTurn = useCallback(() => {
    stopCountdown();

    const nextQuestionIndex = currentQuestionIndex + 1;
    if (nextQuestionIndex >= totalQuestions) {
      const finishedAt = new Date();
      finishedAtRef.current = finishedAt;
      persistCompletedSession(playerNames, scores, results, finishedAt);
      setPhase("complete");
      return;
    }

    setCurrentQuestionIndex(nextQuestionIndex);
    setSelectedAnswerIndex(null);
    setFocusedAnswerIndex(null);
    setRemainingSeconds(QUESTION_TIME_SECONDS);
    finalizedQuestionKeyRef.current = null;
    setPhase("question");
  }, [currentQuestionIndex, persistCompletedSession, playerNames, results, scores, totalQuestions]);

  const finalizeAnswer = useCallback(
    (selectedIndex: number | null) => {
      if (phase !== "question" || !currentQuestion) return;

      const questionKey = `${currentQuestionIndex}:${currentQuestion.id}`;
      if (finalizedQuestionKeyRef.current === questionKey) return;
      finalizedQuestionKeyRef.current = questionKey;

      stopCountdown();

      const elapsedMs = Math.max(0, Date.now() - questionStartedAtRef.current);
      const isCorrect = selectedIndex === currentQuestion.correctOptionIndex;

      setResults((previous) => [
        ...previous,
        {
          questionId: currentQuestion.id,
          questionText: currentQuestion.questionText,
          playerName: currentPlayerName,
          playerIndex: currentPlayerIndex,
          selectedOptionIndex: selectedIndex,
          correctOptionIndex: currentQuestion.correctOptionIndex,
          isCorrect,
          timeTakenMs: elapsedMs,
        },
      ]);

      if (isCorrect) {
        setScores((previous) => {
          const next = [...previous];
          next[currentPlayerIndex] = (next[currentPlayerIndex] ?? 0) + 1;
          return next;
        });
      }

      setSelectedAnswerIndex(selectedIndex);
      setPhase("reveal");
    },
    [currentPlayerIndex, currentPlayerName, currentQuestion, currentQuestionIndex, phase],
  );

  useEffect(() => {
    if (phase !== "question" || !currentQuestion) {
      stopCountdown();
      return;
    }

    questionStartedAtRef.current = Date.now();

    if (!timerEnabled) return;

    stopCountdown();
    timerRef.current = setInterval(() => {
      setRemainingSeconds((previous) => {
        const next = previous - 1;
        if (next <= 0) {
          stopCountdown();
          finalizeAnswer(null);
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => stopCountdown();
  }, [currentQuestion, finalizeAnswer, phase, timerEnabled]);

  useEffect(() => {
    if (phase !== "question") return;

    function onKeyDown(event: KeyboardEvent) {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter"].includes(event.key)) {
        return;
      }

      const activeElement = document.activeElement as HTMLElement | null;
      if (activeElement && (activeElement.tagName === "INPUT" || activeElement.tagName === "TEXTAREA")) {
        return;
      }

      event.preventDefault();

      if (event.key === "Enter") {
        if (focusedAnswerIndex === null) return;
        finalizeAnswer(focusedAnswerIndex);
        return;
      }

      setFocusedAnswerIndex((previous) => {
        if (previous === null) {
          if (event.key === "ArrowRight") return 1;
          if (event.key === "ArrowDown") return 2;
          return 0;
        }

        const row = Math.floor(previous / 2);
        const col = previous % 2;

        if (event.key === "ArrowLeft") return row * 2 + Math.max(0, col - 1);
        if (event.key === "ArrowRight") return row * 2 + Math.min(1, col + 1);
        if (event.key === "ArrowUp") return Math.max(0, previous - 2);
        return Math.min(3, previous + 2);
      });
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [finalizeAnswer, focusedAnswerIndex, phase]);

  useEffect(() => {
    return () => {
      stopCountdown();
    };
  }, []);

  function beginRound(nextPlayerNames: string[]) {
    const trimmedPlayers = normalizePlayerNames(nextPlayerNames);
    if (trimmedPlayers.length < MIN_PLAYERS) {
      setSetupError("Add at least 2 players to start.");
      return;
    }

    const shuffledQuestions = shuffleItems(quiz.questions);

    setSetupError(null);
    setQuestions(shuffledQuestions);
    setPlayerNames(trimmedPlayers);
    setScores(Array.from({ length: trimmedPlayers.length }, () => 0));
    setResults([]);
    setCurrentQuestionIndex(0);
    setFocusedAnswerIndex(null);
    setSelectedAnswerIndex(null);
    setRemainingSeconds(QUESTION_TIME_SECONDS);
    setSaveStatus("idle");
    setPhase("question");

    startedAtRef.current = new Date();
    finishedAtRef.current = null;
    hasPersistedRef.current = false;
    finalizedQuestionKeyRef.current = null;
  }

  function startGameFromSetup() {
    const normalized = normalizePlayerNames(setupNames);
    if (normalized.length < MIN_PLAYERS) {
      setSetupError("Add at least 2 players to start.");
      return;
    }

    beginRound(normalized);
  }

  function rematch() {
    if (playerNames.length < MIN_PLAYERS) {
      setPhase("setup");
      return;
    }

    beginRound(playerNames);
  }

  async function pickAnotherCouchQuiz() {
    try {
      const withExclude = await fetch(`/api/quiz/random?mode=couch_coop&exclude=${quiz.id}`, {
        cache: "no-store",
      });

      if (withExclude.ok) {
        const payload = (await withExclude.json()) as { quiz: { id: string } };
        router.push(`/play/${payload.quiz.id}`);
        return;
      }

      const fallback = await fetch("/api/quiz/random?mode=couch_coop", { cache: "no-store" });
      if (!fallback.ok) {
        router.push("/");
        return;
      }

      const payload = (await fallback.json()) as { quiz: { id: string } };
      router.push(`/play/${payload.quiz.id}`);
    } catch {
      router.push("/");
    }
  }

  if (phase === "setup") {
    return (
      <div className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100 sm:px-6 md:px-10">
        <main className="mx-auto w-full max-w-4xl space-y-6">
          <section className="space-y-6 rounded-2xl border border-slate-700 bg-slate-900 p-6 md:p-8">
            <div className="space-y-2 text-center">
              <h1 className="text-4xl font-black tracking-tight md:text-5xl">Who&apos;s playing?</h1>
              <p className="text-lg text-slate-300 md:text-xl">
                Enter 2 to 6 players, then start your couch co-op round.
              </p>
            </div>

            <div className="space-y-3">
              {setupNames.map((name, index) => (
                <div key={`player-input-${index}`} className="flex items-center gap-3">
                  <label
                    htmlFor={`player-name-${index}`}
                    className="w-24 text-sm font-semibold text-slate-300 md:text-base"
                  >
                    Player {index + 1}
                  </label>
                  <input
                    id={`player-name-${index}`}
                    type="text"
                    value={name}
                    maxLength={MAX_NAME_LENGTH}
                    onChange={(event) => {
                      const nextName = event.target.value.slice(0, MAX_NAME_LENGTH);
                      setSetupNames((previous) => {
                        const next = [...previous];
                        next[index] = nextName;
                        return next;
                      });
                    }}
                    placeholder={`Player ${index + 1}`}
                    className={cn(
                      "min-h-12 w-full rounded-lg border border-slate-700 bg-slate-950 px-4 text-base text-slate-100",
                      "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-400/50",
                    )}
                  />
                  <GameButton
                    centered
                    disabled={setupNames.length <= MIN_PLAYERS}
                    className="min-h-12 max-w-32"
                    onClick={() =>
                      setSetupNames((previous) =>
                        previous.length <= MIN_PLAYERS
                          ? previous
                          : previous.filter((_, currentIndex) => currentIndex !== index),
                      )
                    }
                  >
                    Remove
                  </GameButton>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap justify-center gap-3">
              <GameButton
                centered
                disabled={setupNames.length >= MAX_PLAYERS}
                className="min-h-12 max-w-44"
                onClick={() =>
                  setSetupNames((previous) =>
                    previous.length >= MAX_PLAYERS ? previous : [...previous, ""],
                  )
                }
              >
                Add Player
              </GameButton>
              <GameButton
                centered
                state={timerEnabled ? "selected" : "default"}
                className="min-h-12 max-w-44"
                onClick={() => setTimerEnabled((previous) => !previous)}
              >
                Timer: {timerEnabled ? "ON" : "OFF"}
              </GameButton>
            </div>

            {setupError ? (
              <p className="rounded-lg border border-rose-500/50 bg-rose-500/10 p-3 text-center text-rose-200">
                {setupError}
              </p>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <GameButton
                centered
                className="min-h-14 max-w-xs border-cyan-500/50 bg-cyan-500/20 text-lg text-cyan-100"
                onClick={startGameFromSetup}
              >
                Start Couch Co-op
              </GameButton>
              <GameButton
                centered
                className="min-h-14 max-w-xs"
                onClick={() => router.push("/")}
              >
                Back to Hub
              </GameButton>
            </div>
          </section>
        </main>
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
        <div className="w-full max-w-2xl space-y-6 rounded-2xl border border-slate-700 bg-slate-900 p-8 text-center">
          <h1 className="text-3xl font-bold md:text-4xl">Quiz unavailable</h1>
          <p className="text-lg text-slate-300 md:text-xl">Could not load this couch co-op quiz.</p>
          <div className="flex justify-center">
            <CircularButton onClick={() => router.push("/")}>Home</CircularButton>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "complete") {
    return (
      <div className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100 sm:px-6 md:px-10">
        <main className="mx-auto w-full max-w-5xl space-y-6">
          <section className="space-y-6 rounded-2xl border border-slate-700 bg-slate-900 p-6 md:p-8">
            <div className="space-y-2 text-center">
              <h2 className="text-4xl font-black tracking-tight md:text-5xl">Leaderboard</h2>
              <p className="text-xl text-cyan-200 md:text-2xl">
                Team score: {totalCorrect} / {totalQuestions}
              </p>
            </div>

            <div className="space-y-3">
              {leaderboard.map((entry, index) => (
                <div
                  key={`${entry.name}-${index}`}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-700 bg-slate-950/70 p-4"
                >
                  <div className="flex items-center gap-3">
                    <span className="inline-flex size-9 items-center justify-center rounded-full border border-slate-600 bg-slate-900 text-base font-bold">
                      {index + 1}
                    </span>
                    <div className="space-y-1">
                      <p className="text-lg font-bold text-slate-100">
                        {entry.name}
                        {index < 3 ? <Medal className="ml-2 inline size-4 text-amber-300" /> : null}
                      </p>
                      <p className="text-sm text-slate-400">
                        {entry.correctRate.toFixed(1)}% correct | Avg time {formatSecondsFromMs(entry.avgTimeMs)}
                      </p>
                    </div>
                  </div>
                  <p className="text-2xl font-black text-emerald-300">{entry.score}</p>
                </div>
              ))}
            </div>

            <div className="space-y-1">
              {saveStatus === "saving" ? (
                <p className="text-base text-slate-300">Saving session...</p>
              ) : null}
              {saveStatus === "saved" ? (
                <p className="text-base text-emerald-300">Session saved!</p>
              ) : null}
              {saveStatus === "error" ? (
                <p className="text-base text-rose-300">Could not save this session.</p>
              ) : null}
              {saveStatus === "anonymous" ? (
                <p className="text-base text-slate-300">Played in guest mode.</p>
              ) : null}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <GameButton centered className="min-h-14 max-w-xs text-lg" onClick={rematch}>
                Rematch
              </GameButton>
              <GameButton
                centered
                className="min-h-14 max-w-xs border-cyan-500/50 bg-cyan-500/20 text-lg text-cyan-100"
                onClick={() => void pickAnotherCouchQuiz()}
              >
                Pick Another Couch Quiz
              </GameButton>
              <GameButton centered className="min-h-14 max-w-xs text-lg" onClick={() => router.push("/")}>
                Back to Hub
              </GameButton>
            </div>
          </section>
        </main>
      </div>
    );
  }

  const correctExplanation =
    currentCorrectOptionIndex !== null ? currentQuestion.options[currentCorrectOptionIndex]?.explanation : "";

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100 sm:px-6 md:px-10">
      <main className="mx-auto w-full max-w-6xl space-y-6">
        <section className="space-y-4 rounded-2xl border border-slate-700 bg-slate-900 p-5 md:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-lg font-semibold text-cyan-200 md:text-xl">
              Question {currentQuestionIndex + 1} of {totalQuestions}
            </p>
            <span className="rounded-full border border-amber-400/50 bg-amber-500/20 px-4 py-1 text-sm font-bold text-amber-100 md:text-base">
              {currentPlayerName}&apos;s turn
            </span>
          </div>

          <div className="h-3 overflow-hidden rounded-full border border-slate-700 bg-slate-950">
            <div
              className="h-full bg-gradient-to-r from-cyan-400 to-cyan-500 transition-all"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>

          {timerEnabled ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-base font-semibold text-slate-300">
                <span>Time left</span>
                <span>{remainingSeconds}s</span>
              </div>
              <div className="h-4 overflow-hidden rounded-full border border-slate-700 bg-slate-950">
                <div
                  className={cn(
                    "h-full bg-gradient-to-r transition-all duration-1000",
                    timerBarClass(remainingSeconds),
                  )}
                  style={{ width: `${timerPercentage}%` }}
                />
              </div>
            </div>
          ) : null}

          <h2 className="text-2xl leading-tight font-bold md:text-4xl">{currentQuestion.questionText}</h2>

          <div className="grid gap-4 md:grid-cols-2">
            {[0, 1, 2, 3].map((index) => {
              const option = currentQuestion.options[index];
              const isCorrectOption = phase === "reveal" && index === currentCorrectOptionIndex;
              const isWrongSelection =
                phase === "reveal" && selectedAnswerIndex === index && index !== currentCorrectOptionIndex;

              return (
                <GameButton
                  key={index}
                  className="min-h-20 text-lg md:text-xl"
                  state={isCorrectOption ? "correct" : isWrongSelection ? "wrong" : "default"}
                  focused={phase === "question" && focusedAnswerIndex === index}
                  disabled={phase !== "question"}
                  onClick={() => finalizeAnswer(index)}
                >
                  {`${String.fromCharCode(65 + index)}: ${option?.text ?? ""}`}
                </GameButton>
              );
            })}
          </div>

          {phase === "reveal" ? (
            <div className="space-y-4 rounded-xl border border-slate-700 bg-slate-950/70 p-4">
              <p className="text-lg font-semibold text-slate-100 md:text-xl">
                {selectedAnswerIndex === null
                  ? `${currentPlayerName} ran out of time.`
                  : selectedAnswerIndex === currentCorrectOptionIndex
                    ? `${currentPlayerName} is correct!`
                    : `${currentPlayerName} is incorrect.`}
              </p>
              <p className="text-base leading-relaxed text-slate-300 md:text-lg">
                {correctExplanation || "No explanation provided for this question."}
              </p>
              <div className="flex justify-center">
                <GameButton centered className="min-h-14 max-w-xs text-lg" onClick={moveToNextTurn}>
                  {currentQuestionIndex + 1 >= totalQuestions ? "Show Leaderboard" : "Next Turn"}
                </GameButton>
              </div>
            </div>
          ) : null}
        </section>

        <section className="space-y-3 rounded-2xl border border-slate-700 bg-slate-900 p-4 md:p-6">
          <h3 className="text-xl font-bold text-slate-100">Live Scoreboard</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {playerNames.map((name, index) => {
              const playerAnswers = results.filter((result) => result.playerIndex === index);
              const latestAnswer = playerAnswers[playerAnswers.length - 1];

              return (
                <div
                  key={`${name}-${index}`}
                  className={cn(
                    "space-y-2 rounded-xl border bg-slate-950/60 p-4",
                    index === currentPlayerIndex && phase === "question"
                      ? "border-cyan-400/60"
                      : "border-slate-700",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-lg font-bold text-slate-100">{name}</p>
                    <p className="text-2xl font-black text-emerald-300">{scores[index] ?? 0}</p>
                  </div>
                  <p className="text-sm text-slate-400">
                    {playerAnswers.length} answered
                    {playerAnswers.length > 0
                      ? ` | Avg ${formatSecondsFromMs(
                          playerAnswers.reduce((sum, answer) => sum + answer.timeTakenMs, 0) /
                            playerAnswers.length,
                        )}`
                      : ""}
                  </p>
                  <div className="pt-1">
                    {latestAnswer ? (
                      latestAnswer.isCorrect ? (
                        <span className="inline-flex items-center gap-1 text-sm text-emerald-300">
                          <CheckCircle2 className="size-4" />
                          Last: Correct
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-sm text-rose-300">
                          <XCircle className="size-4" />
                          Last: Incorrect
                        </span>
                      )
                    ) : (
                      <span className="text-sm text-slate-500">No answers yet</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
