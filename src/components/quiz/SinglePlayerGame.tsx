"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ThumbsDown, ThumbsUp, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { CircularButton } from "@/components/quiz/CircularButton";
import { GameButton } from "@/components/quiz/GameButton";
import { QuizPlayHeader } from "@/components/quiz/QuizPlayHeader";
import { authClient } from "@/lib/auth-client";
import type { QuizWithQuestions, SaveQuizSessionPayload } from "@/lib/quiz-types";
import { cn } from "@/lib/utils";

type SinglePlayerGameProps = {
  quiz: QuizWithQuestions;
};

type GamePhase = "question" | "reveal" | "complete";
type VoteType = "like" | "dislike";
type SaveStatus = "idle" | "saving" | "saved" | "error" | "anonymous";

type QuestionResult = {
  questionId: string;
  questionText: string;
  selectedOptionIndex: number | null;
  correctOptionIndex: number;
  isCorrect: boolean;
  timeTakenMs: number;
};

const QUESTION_TIME_SECONDS = 30;
const AUTO_ADVANCE_MS = 3000;

function formatSecondsFromMs(durationMs: number) {
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function timerBarClass(remainingSeconds: number) {
  const ratio = remainingSeconds / QUESTION_TIME_SECONDS;
  if (ratio > 0.5) return "from-emerald-400 to-emerald-500";
  if (ratio > 0.2) return "from-amber-400 to-amber-500";
  return "from-rose-400 to-rose-500";
}

function computeLikeRatioLabel(likes: number, dislikes: number) {
  const total = likes + dislikes;
  if (total === 0) return "No votes yet";
  return `${Math.round((likes / total) * 100)}% likes`;
}

export function SinglePlayerGame({ quiz }: SinglePlayerGameProps) {
  const router = useRouter();
  const { data: sessionData } = authClient.useSession();

  const [phase, setPhase] = useState<GamePhase>("question");
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [focusedAnswerIndex, setFocusedAnswerIndex] = useState<number | null>(null);
  const [selectedAnswerIndex, setSelectedAnswerIndex] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(QUESTION_TIME_SECONDS);
  const [score, setScore] = useState(0);
  const [results, setResults] = useState<QuestionResult[]>([]);
  const [completedDurationMs, setCompletedDurationMs] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [likes, setLikes] = useState(quiz.likes);
  const [dislikes, setDislikes] = useState(quiz.dislikes);
  const [vote, setVote] = useState<VoteType | null>(quiz.currentVote ?? null);
  const [isVoting, setIsVoting] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const autoAdvanceRef = useRef<NodeJS.Timeout | null>(null);
  const questionStartedAtRef = useRef(0);
  const quizStartedAtRef = useRef<Date | null>(new Date());
  const quizFinishedAtRef = useRef<Date | null>(null);
  const scoreRef = useRef(0);
  const resultsRef = useRef<QuestionResult[]>([]);
  const hasPersistedRef = useRef(false);
  const finalizedQuestionKeyRef = useRef<string | null>(null);

  const totalQuestions = quiz.questions.length;
  const currentQuestion = quiz.questions[currentQuestionIndex];
  const currentCorrectOptionIndex = currentQuestion?.correctOptionIndex ?? null;

  const timerPercentage = useMemo(() => {
    return Math.max(0, (remainingSeconds / QUESTION_TIME_SECONDS) * 100);
  }, [remainingSeconds]);

  const progressPercentage = useMemo(() => {
    if (totalQuestions === 0) return 0;
    return Math.min(100, ((currentQuestionIndex + 1) / totalQuestions) * 100);
  }, [currentQuestionIndex, totalQuestions]);

  const correctExplanation =
    currentQuestion && currentCorrectOptionIndex !== null
      ? currentQuestion.options[currentCorrectOptionIndex]?.explanation
      : "";

  useEffect(() => {
    setLikes(quiz.likes);
    setDislikes(quiz.dislikes);
    setVote(quiz.currentVote ?? null);
    setVoteError(null);
  }, [quiz.currentVote, quiz.dislikes, quiz.id, quiz.likes]);

  function stopCountdown() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function clearAutoAdvance() {
    if (autoAdvanceRef.current) {
      clearTimeout(autoAdvanceRef.current);
      autoAdvanceRef.current = null;
    }
  }

  const moveToNextQuestion = useCallback(() => {
    clearAutoAdvance();

    const nextQuestionIndex = currentQuestionIndex + 1;
    if (nextQuestionIndex >= totalQuestions) {
      const finishedAt = new Date();
      quizFinishedAtRef.current = finishedAt;
      setCompletedDurationMs(
        quizStartedAtRef.current ? finishedAt.getTime() - quizStartedAtRef.current.getTime() : 0,
      );
      setPhase("complete");
      return;
    }

    setCurrentQuestionIndex(nextQuestionIndex);
    finalizedQuestionKeyRef.current = null;
    setSelectedAnswerIndex(null);
    setFocusedAnswerIndex(null);
    setPhase("question");
  }, [currentQuestionIndex, totalQuestions]);

  const finalizeAnswer = useCallback(
    (selectedIndex: number | null) => {
      if (phase !== "question" || !currentQuestion) return;

      const questionKey = `${currentQuestionIndex}:${currentQuestion.id}`;
      if (finalizedQuestionKeyRef.current === questionKey) return;
      finalizedQuestionKeyRef.current = questionKey;

      stopCountdown();

      const elapsedMs = Math.min(
        QUESTION_TIME_SECONDS * 1000,
        Math.max(0, Date.now() - questionStartedAtRef.current),
      );
      const isCorrect = selectedIndex === currentQuestion.correctOptionIndex;

      const result: QuestionResult = {
        questionId: currentQuestion.id,
        questionText: currentQuestion.questionText,
        selectedOptionIndex: selectedIndex,
        correctOptionIndex: currentQuestion.correctOptionIndex,
        isCorrect,
        timeTakenMs: elapsedMs,
      };

      const nextResults = [...resultsRef.current, result];
      resultsRef.current = nextResults;
      setResults(nextResults);

      if (isCorrect) {
        scoreRef.current += 1;
        setScore(scoreRef.current);
      }

      setSelectedAnswerIndex(selectedIndex);
      setPhase("reveal");

      clearAutoAdvance();
      autoAdvanceRef.current = setTimeout(() => {
        moveToNextQuestion();
      }, AUTO_ADVANCE_MS);
    },
    [currentQuestion, currentQuestionIndex, moveToNextQuestion, phase],
  );

  useEffect(() => {
    if (phase !== "question") {
      stopCountdown();
      return;
    }

    questionStartedAtRef.current = Date.now();
    setRemainingSeconds(QUESTION_TIME_SECONDS);

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
  }, [currentQuestionIndex, finalizeAnswer, phase]);

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
      clearAutoAdvance();
    };
  }, []);

  useEffect(() => {
    if (phase !== "complete") return;

    if (hasPersistedRef.current) return;

    const startedAt = quizStartedAtRef.current;
    const finishedAt = quizFinishedAtRef.current;
    if (!startedAt || !finishedAt) return;

    hasPersistedRef.current = true;
    setSaveStatus("saving");

    const payload: SaveQuizSessionPayload = {
      quizId: quiz.id,
      gameMode: "single",
      score: scoreRef.current,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      answers: resultsRef.current.map((result) => ({
        questionId: result.questionId,
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
          throw new Error("Failed to save score");
        }

        setSaveStatus(sessionData?.user ? "saved" : "anonymous");
      })
      .catch(() => {
        setSaveStatus("error");
      });
  }, [phase, quiz.id, sessionData?.user]);

  function playAgain() {
    clearAutoAdvance();
    stopCountdown();

    quizStartedAtRef.current = new Date();
    quizFinishedAtRef.current = null;
    scoreRef.current = 0;
    resultsRef.current = [];
    hasPersistedRef.current = false;
    finalizedQuestionKeyRef.current = null;

    setCurrentQuestionIndex(0);
    setFocusedAnswerIndex(null);
    setSelectedAnswerIndex(null);
    setRemainingSeconds(QUESTION_TIME_SECONDS);
    setScore(0);
    setResults([]);
    setCompletedDurationMs(0);
    setSaveStatus("idle");
    setPhase("question");
  }

  async function submitVote(nextVote: VoteType) {
    if (isVoting) return;

    setIsVoting(true);
    setVoteError(null);

    try {
      const response = await fetch(`/api/quiz/${quiz.id}/rate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ vote: nextVote }),
      });

      if (!response.ok) {
        throw new Error("Could not save vote");
      }

      const payload = (await response.json()) as {
        likes: number;
        dislikes: number;
        vote: VoteType;
      };

      setLikes(payload.likes);
      setDislikes(payload.dislikes);
      setVote(payload.vote);
    } catch (error) {
      setVoteError(error instanceof Error ? error.message : "Could not save vote");
    } finally {
      setIsVoting(false);
    }
  }

  if (!currentQuestion && phase !== "complete") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
        <div className="max-w-xl space-y-6 rounded-2xl border border-slate-700 bg-slate-900 p-8 text-center">
          <h1 className="text-3xl font-bold">Quiz unavailable</h1>
          <p className="text-lg text-slate-300">Could not load this quiz.</p>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <CircularButton onClick={playAgain}>Retry</CircularButton>
            <CircularButton onClick={() => router.push("/")}>Home</CircularButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 px-3 py-4 text-slate-100 sm:px-6 sm:py-6 md:px-10">
      <main className="mx-auto w-full max-w-5xl space-y-4 md:space-y-6">
        <QuizPlayHeader
          title={quiz.title}
          creatorName={quiz.creatorName}
          creatorImage={quiz.creatorImage}
        />
        {phase === "question" || phase === "reveal" ? (
          <section className="space-y-4 rounded-2xl border border-slate-700 bg-slate-900 p-4 md:space-y-5 md:p-7">
            <header className="space-y-3 md:space-y-4">
              <div className="flex items-center justify-between gap-4">
                <p className="text-base font-semibold text-cyan-200 md:text-xl">
                  Question {currentQuestionIndex + 1} of {totalQuestions}
                </p>
                <p className="text-base font-bold text-emerald-300 md:text-xl">Score: {score}</p>
              </div>

              <div className="h-2 overflow-hidden rounded-full border border-slate-700 bg-slate-950 md:h-3">
                <div
                  className="h-full bg-gradient-to-r from-cyan-400 to-cyan-500 transition-all"
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm font-semibold text-slate-300 md:text-base">
                  <span>Time left</span>
                  <span>{remainingSeconds}s</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full border border-slate-700 bg-slate-950 md:h-4">
                  <div
                    className={cn(
                      "h-full bg-gradient-to-r transition-all duration-1000",
                      timerBarClass(remainingSeconds),
                    )}
                    style={{ width: `${timerPercentage}%` }}
                  />
                </div>
              </div>

              <h2 className="text-xl leading-tight font-bold text-slate-100 md:text-4xl">
                {currentQuestion?.questionText}
              </h2>
            </header>

            <div className="grid gap-3 md:grid-cols-2 md:gap-4">
              {[0, 1, 2, 3].map((index) => {
                const option = currentQuestion?.options[index];
                const isCorrectOption = phase === "reveal" && index === currentCorrectOptionIndex;
                const isWrongSelection =
                  phase === "reveal" && selectedAnswerIndex === index && index !== currentCorrectOptionIndex;

                return (
                  <GameButton
                    key={index}
                    className="min-h-16 text-base md:min-h-20 md:text-xl"
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
              <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-950/70 p-3 md:space-y-4 md:p-4">
                <p className="text-base font-semibold text-slate-100 md:text-xl">
                  {selectedAnswerIndex === null
                    ? "Time is up."
                    : selectedAnswerIndex === currentCorrectOptionIndex
                      ? "Correct answer!"
                      : "Incorrect answer."}
                </p>
                <p className="text-sm leading-relaxed text-slate-300 md:text-lg">
                  {correctExplanation || "No explanation provided for this question."}
                </p>
                <div className="flex justify-center">
                  <GameButton
                    centered
                    className="min-h-12 max-w-xs text-base md:min-h-14 md:text-lg"
                    onClick={moveToNextQuestion}
                  >
                    Next Question
                  </GameButton>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {phase === "complete" ? (
          <section className="space-y-6 rounded-2xl border border-slate-700 bg-slate-900 p-6 md:p-8">
            <div className="space-y-2 text-center">
              <h2 className="text-4xl font-black tracking-tight text-slate-100 md:text-5xl">Quiz Complete</h2>
              <p className="text-2xl font-bold text-cyan-200 md:text-3xl">
                {score} out of {totalQuestions} correct
              </p>
              <p className="text-lg text-slate-300 md:text-xl">
                Total time: {formatSecondsFromMs(completedDurationMs)}
              </p>
            </div>

            <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-950/60 p-4">
              <h3 className="text-xl font-bold text-slate-100">Question Breakdown</h3>
              <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
                {results.map((result, index) => (
                  <div
                    key={`${result.questionId}-${index}`}
                    className="flex items-start justify-between gap-4 rounded-lg border border-slate-800 bg-slate-900/80 p-3"
                  >
                    <div className="space-y-1">
                      <p className="text-base font-semibold text-slate-100 md:text-lg">{index + 1}. {result.questionText}</p>
                      <p className="text-sm text-slate-400 md:text-base">
                        Time: {formatSecondsFromMs(result.timeTakenMs)}
                      </p>
                    </div>
                    <div className="pt-1">
                      {result.isCorrect ? (
                        <CheckCircle2 className="size-6 text-emerald-400" aria-label="Correct" />
                      ) : (
                        <XCircle className="size-6 text-rose-400" aria-label="Incorrect" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-950/60 p-4">
              <p className="text-lg font-semibold text-slate-100">Rate this quiz</p>
              <div className="flex flex-wrap gap-3">
                <GameButton
                  centered
                  icon={<ThumbsUp size={20} />}
                  onClick={() => void submitVote("like")}
                  disabled={isVoting}
                  state={vote === "like" ? "selected" : "default"}
                  className="min-h-14 max-w-56 text-lg"
                >
                  Like ({likes})
                </GameButton>
                <GameButton
                  centered
                  icon={<ThumbsDown size={20} />}
                  onClick={() => void submitVote("dislike")}
                  disabled={isVoting}
                  state={vote === "dislike" ? "selected" : "default"}
                  className="min-h-14 max-w-56 text-lg"
                >
                  Dislike ({dislikes})
                </GameButton>
              </div>
              <p className="text-base text-slate-300">{computeLikeRatioLabel(likes, dislikes)}</p>
              {voteError ? <p className="text-sm text-rose-300">{voteError}</p> : null}
            </div>

            <div className="space-y-1">
              {saveStatus === "saving" ? <p className="text-base text-slate-300">Saving score...</p> : null}
              {saveStatus === "saved" ? <p className="text-base text-emerald-300">Score saved!</p> : null}
              {saveStatus === "error" ? (
                <p className="text-base text-rose-300">Could not save score. Please try again later.</p>
              ) : null}
              {saveStatus === "anonymous" ? (
                <p className="text-base text-slate-300">
                  Create an account to save your scores.
                  <button
                    type="button"
                    onClick={() => router.push("/sign-in?callbackURL=/dashboard")}
                    className="ml-2 font-semibold text-cyan-300 underline underline-offset-2"
                  >
                    Sign in
                  </button>
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <GameButton centered className="min-h-14 max-w-xs text-lg" onClick={playAgain}>
                Play Again
              </GameButton>
              <GameButton
                centered
                className="min-h-14 max-w-xs border-cyan-500/50 bg-cyan-500/10 text-lg text-cyan-100"
                onClick={() => router.push("/")}
              >
                Back to Hub
              </GameButton>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
