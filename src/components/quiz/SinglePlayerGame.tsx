"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  House,
  LoaderCircle,
  Square,
  ThumbsDown,
  ThumbsUp,
  Volume2,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { CircularButton } from "@/components/quiz/CircularButton";
import { GameButton } from "@/components/quiz/GameButton";
import { QuizPlayHeader } from "@/components/quiz/QuizPlayHeader";
import { SlantedBar } from "@/components/quiz/SlantedBar";
import { Switch } from "@/components/ui/switch";
import { useCompactQuizLayout, useTvLikeQuizLayout } from "@/hooks/useCompactQuizLayout";
import { useEndScreenActions } from "@/hooks/use-end-screen-actions";
import { useReadAloudPreference } from "@/hooks/use-read-aloud-preference";
import { useQuestionReadAloud } from "@/hooks/use-question-read-aloud";
import { authClient } from "@/lib/auth-client";
import { buildQuizPlayPath, type MyQuizzesRandomContext } from "@/lib/my-quizzes-random";
import {
  getNextQuizIdForPlayback,
  setMyQuizzesRandomPlaybackContext,
} from "@/lib/my-quizzes-random-client";
import { rememberRecentQuiz } from "@/lib/recent-quiz-history";
import { focusRemoteControl } from "@/lib/remote-focus";
import type { QuizWithQuestions, SaveQuizSessionPayload } from "@/lib/quiz-types";
import { cn } from "@/lib/utils";

type SinglePlayerGameProps = {
  quiz: QuizWithQuestions;
  playContext?: MyQuizzesRandomContext | null;
};

type GamePhase = "question" | "reveal" | "complete";
type VoteType = "like" | "dislike";
type SaveStatus = "idle" | "saving" | "saved" | "error" | "anonymous";
type HeaderActionTarget = "header-quit" | "header-next";
type CompleteActionId = "play-next" | "play-again";
type CompleteActionTarget = `${"top" | "bottom"}-${CompleteActionId}`;
type RevealFocusTarget = HeaderActionTarget | "reveal-next";
type CompleteFocusTarget =
  | HeaderActionTarget
  | CompleteActionTarget
  | `breakdown-${number}`
  | "like"
  | "dislike"
  | "share"
  | "make-one-like-this"
  | "sign-in";

type QuestionResult = {
  questionId: string;
  questionText: string;
  selectedOptionIndex: number | null;
  correctOptionIndex: number;
  isCorrect: boolean;
  timeTakenMs: number;
};

const QUESTION_TIME_SECONDS = 30;
const AUTO_ADVANCE_MS = 4500;

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

export function SinglePlayerGame({ quiz, playContext = null }: SinglePlayerGameProps) {
  const router = useRouter();
  const { data: sessionData, isPending: isSessionPending } = authClient.useSession();
  const sessionUser = sessionData?.user as
    | {
        id?: string;
        readAloudEnabled?: boolean;
      }
    | undefined;
  const compactLayout = useCompactQuizLayout();
  const tvLikeLayout = useTvLikeQuizLayout();

  const [phase, setPhase] = useState<GamePhase>("question");
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [focusedAnswerIndex, setFocusedAnswerIndex] = useState<number | null>(null);
  const [focusedHeaderTarget, setFocusedHeaderTarget] = useState<HeaderActionTarget | null>(null);
  const [focusedRevealTarget, setFocusedRevealTarget] = useState<RevealFocusTarget | null>(null);
  const [focusedCompleteTarget, setFocusedCompleteTarget] = useState<CompleteFocusTarget | null>(null);
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
  const [isLoadingNextQuiz, setIsLoadingNextQuiz] = useState(false);
  const [revealOutlineProgress, setRevealOutlineProgress] = useState(0);
  const [answerWindowOpen, setAnswerWindowOpen] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const autoAdvanceRef = useRef<NodeJS.Timeout | null>(null);
  const answerButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const headerButtonRefs = useRef<Record<HeaderActionTarget, HTMLButtonElement | null>>({
    "header-quit": null,
    "header-next": null,
  });
  const nextQuestionButtonRef = useRef<HTMLButtonElement | null>(null);
  const revealPanelRef = useRef<HTMLDivElement | null>(null);
  const questionViewportAnchorRef = useRef<HTMLDivElement | null>(null);
  const completeFocusRefs = useRef<Record<string, HTMLElement | null>>({});
  const questionStartedAtRef = useRef(0);
  const answerWindowOpenedRef = useRef(false);
  const readAloudEnabledRef = useRef(false);
  const stopReadAloudRef = useRef<() => void>(() => {});
  const quizStartedAtRef = useRef<Date | null>(new Date());
  const quizFinishedAtRef = useRef<Date | null>(null);
  const scoreRef = useRef(0);
  const resultsRef = useRef<QuestionResult[]>([]);
  const hasPersistedRef = useRef(false);
  const finalizedQuestionKeyRef = useRef<string | null>(null);

  const totalQuestions = quiz.questions.length;
  const homePath = playContext ? "/dashboard" : "/hub";
  const nextButtonLabel = playContext ? "Next Random" : "Play Next";
  const nextHeaderLabel = playContext
    ? (isLoadingNextQuiz ? "Loading next random" : "Next Random")
    : (isLoadingNextQuiz ? "Loading next quiz" : "Next quiz");
  const currentQuestion = quiz.questions[currentQuestionIndex];
  const questionPlaybackKey = currentQuestion ? `${currentQuestionIndex}:${currentQuestion.id}` : null;
  const currentCorrectOptionIndex = currentQuestion?.correctOptionIndex ?? null;
  const accuracyPercentage =
    totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;
  const shouldShowSaveStatusCard =
    saveStatus === "saving" || saveStatus === "error" || saveStatus === "anonymous";
  const { shareState, shareQuiz, makeOneLikeThis } = useEndScreenActions({
    quizId: quiz.id,
    theme: quiz.theme,
    mode: quiz.gameMode,
    difficulty: quiz.difficulty,
    isSignedIn: Boolean(sessionData?.user?.id),
  });

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
  const completeFocusRows = useMemo<CompleteFocusTarget[][]>(() => {
    const rows: CompleteFocusTarget[][] = [
      ["header-quit", "header-next"],
      ["top-play-next", "top-play-again"],
      ["share", "make-one-like-this"],
      ["like", "dislike"],
      ...Array.from({ length: results.length }, (_, index) => [`breakdown-${index}` as const]),
    ];

    if (saveStatus === "anonymous") {
      rows.push(["sign-in"]);
    }

    rows.push(["bottom-play-next", "bottom-play-again"]);
    return rows;
  }, [results.length, saveStatus]);

  const {
    readAloudEnabled,
    readAloudPreferenceReady,
    readAloudSaving,
    readAloudPreferenceError,
    setReadAloudPreferenceError,
    toggleReadAloud,
  } = useReadAloudPreference({
    userId: sessionUser?.id,
    serverEnabled: sessionUser?.readAloudEnabled,
    serverPending: isSessionPending,
  });

  useEffect(() => {
    setLikes(quiz.likes);
    setDislikes(quiz.dislikes);
    setVote(quiz.currentVote ?? null);
    setVoteError(null);
  }, [quiz.currentVote, quiz.dislikes, quiz.id, quiz.likes]);

  useEffect(() => {
    rememberRecentQuiz("single", quiz.id);
  }, [quiz.id]);

  const stopCountdown = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearAutoAdvance = useCallback(() => {
    if (autoAdvanceRef.current) {
      clearTimeout(autoAdvanceRef.current);
      autoAdvanceRef.current = null;
    }
  }, []);

  const playNext = useCallback(async () => {
    if (isLoadingNextQuiz) return;

    setIsLoadingNextQuiz(true);
    try {
      const nextQuizId = await getNextQuizIdForPlayback({
        mode: "single",
        currentQuizId: quiz.id,
        playContext,
      });

      if (!nextQuizId) {
        router.push(homePath);
        return;
      }

      setMyQuizzesRandomPlaybackContext({
        quizId: nextQuizId,
        playContext,
      });
      router.push(
        buildQuizPlayPath({
          quizId: nextQuizId,
        }),
      );
    } catch {
      router.push(homePath);
    } finally {
      setIsLoadingNextQuiz(false);
    }
  }, [homePath, isLoadingNextQuiz, playContext, quiz.id, router]);

  const questionReadAloudSegments = useMemo(() => {
    if (!currentQuestion) {
      return [];
    }

    const endpoint = `/api/quiz/${quiz.id}/questions/${currentQuestion.id}/tts`;
    const ttsFingerprint = quiz.ttsFingerprint?.trim() ?? "";
    const options = currentQuestion.options.map((option) => option.text);
    const buildAudioUrl = (segment: "question" | "options") => {
      const searchParams = new URLSearchParams({
        segment,
        position: String(currentQuestionIndex + 1),
      });

      if (segment === "options") {
        for (const option of options) {
          searchParams.append("option", option);
        }
      }

      if (ttsFingerprint) {
        searchParams.set("tts", ttsFingerprint);
      }

      return `${endpoint}?${searchParams.toString()}`;
    };

    return [
      {
        id: "question",
        url: endpoint,
        audioUrl: buildAudioUrl("question"),
        body: {
          segment: "question",
          position: currentQuestionIndex + 1,
          questionText: currentQuestion.questionText,
          options,
        },
      },
      {
        id: "options",
        url: endpoint,
        audioUrl: buildAudioUrl("options"),
        body: {
          segment: "options",
          position: currentQuestionIndex + 1,
          questionText: currentQuestion.questionText,
          options,
        },
      },
    ] as const;
  }, [currentQuestion, currentQuestionIndex, quiz.id, quiz.ttsFingerprint]);

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
  }, [clearAutoAdvance, currentQuestionIndex, totalQuestions]);

  const finalizeAnswer = useCallback(
    (selectedIndex: number | null) => {
      if (phase !== "question" || !currentQuestion) return;

      const questionKey = `${currentQuestionIndex}:${currentQuestion.id}`;
      if (finalizedQuestionKeyRef.current === questionKey) return;
      finalizedQuestionKeyRef.current = questionKey;

      stopReadAloudRef.current();
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
    [clearAutoAdvance, currentQuestion, currentQuestionIndex, moveToNextQuestion, phase, stopCountdown],
  );

  const beginAnswerWindow = useCallback(() => {
    if (phase !== "question" || answerWindowOpenedRef.current) {
      return;
    }

    answerWindowOpenedRef.current = true;
    setAnswerWindowOpen(true);
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
  }, [finalizeAnswer, phase, stopCountdown]);

  const {
    activeSegmentId,
    error: readAloudPlaybackError,
    isLoading: isReadAloudLoading,
    isPlaying: isReadAloudPlaying,
    play: playReadAloud,
    stop: stopReadAloud,
  } = useQuestionReadAloud({
    segments: questionReadAloudSegments,
    playbackKey: questionPlaybackKey,
    autoPlayEnabled:
      phase === "question" && readAloudPreferenceReady && readAloudEnabled && !answerWindowOpen,
    onSegmentEnd: (segmentId) => {
      if (segmentId === "options") {
        beginAnswerWindow();
      }
    },
  });

  stopReadAloudRef.current = stopReadAloud;

  const readAloudError = readAloudPreferenceError ?? readAloudPlaybackError;

  useEffect(() => {
    readAloudEnabledRef.current = readAloudEnabled;
  }, [readAloudEnabled]);

  useEffect(() => {
    if (phase === "question") return;
    stopReadAloud();
  }, [phase, stopReadAloud]);

  useEffect(() => {
    if (phase !== "question") {
      stopCountdown();
      answerWindowOpenedRef.current = false;
      setAnswerWindowOpen(false);
      return;
    }

    answerWindowOpenedRef.current = false;
    setAnswerWindowOpen(false);
    setRemainingSeconds(QUESTION_TIME_SECONDS);
    questionStartedAtRef.current = Date.now();
    stopCountdown();

    if (!readAloudPreferenceReady) {
      return () => stopCountdown();
    }

    if (!readAloudEnabledRef.current) {
      beginAnswerWindow();
    }

    return () => stopCountdown();
  }, [beginAnswerWindow, currentQuestionIndex, phase, readAloudPreferenceReady, stopCountdown]);

  useEffect(() => {
    if (
      phase === "question" &&
      readAloudPreferenceReady &&
      readAloudEnabled &&
      !answerWindowOpen &&
      readAloudError
    ) {
      beginAnswerWindow();
    }
  }, [
    answerWindowOpen,
    beginAnswerWindow,
    phase,
    readAloudEnabled,
    readAloudError,
    readAloudPreferenceReady,
  ]);

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

      if (focusedHeaderTarget) {
        if (event.key === "Enter") {
          if (focusedHeaderTarget === "header-quit") {
            router.push(homePath);
            return;
          }

          void playNext();
          return;
        }

        if (event.key === "ArrowLeft") {
          setFocusedHeaderTarget("header-quit");
          return;
        }

        if (event.key === "ArrowRight") {
          setFocusedHeaderTarget("header-next");
          return;
        }

        if (event.key === "ArrowDown") {
          setFocusedHeaderTarget(null);
          setFocusedAnswerIndex(focusedHeaderTarget === "header-quit" ? 0 : 1);
        }
        return;
      }

      if (event.key === "Enter") {
        if (focusedAnswerIndex === null) return;
        finalizeAnswer(focusedAnswerIndex);
        return;
      }

      setFocusedAnswerIndex((previous) => {
        if (previous === null) {
          if (event.key === "ArrowUp") {
            setFocusedHeaderTarget("header-quit");
            return null;
          }
          if (event.key === "ArrowRight") return 1;
          if (event.key === "ArrowDown") return 2;
          return 0;
        }

        const row = Math.floor(previous / 2);
        const col = previous % 2;

        if (event.key === "ArrowUp" && previous < 2) {
          setFocusedHeaderTarget(previous === 0 ? "header-quit" : "header-next");
          return null;
        }

        if (event.key === "ArrowLeft") return row * 2 + Math.max(0, col - 1);
        if (event.key === "ArrowRight") return row * 2 + Math.min(1, col + 1);
        if (event.key === "ArrowUp") return Math.max(0, previous - 2);
        return Math.min(3, previous + 2);
      });
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [finalizeAnswer, focusedAnswerIndex, focusedHeaderTarget, homePath, phase, playNext, router]);

  useEffect(() => {
    if (phase === "complete") {
      setFocusedCompleteTarget((previous) => {
        if (previous && completeFocusRows.some((row) => row.includes(previous))) {
          return previous;
        }

        return completeFocusRows[0]?.[0] ?? null;
      });
      return;
    }

    setFocusedCompleteTarget(null);
  }, [completeFocusRows, phase]);

  useEffect(() => {
    if (phase === "question") {
      setFocusedRevealTarget(null);
      return;
    }

    if (phase !== "reveal") return;

    setFocusedHeaderTarget(null);
    setFocusedRevealTarget((previous) => previous ?? "reveal-next");
  }, [phase]);

  useEffect(() => {
    if (phase !== "reveal") {
      setRevealOutlineProgress(0);
      return;
    }

    setRevealOutlineProgress(0);

    const frame = window.requestAnimationFrame(() => {
      setRevealOutlineProgress(100);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [currentQuestionIndex, phase]);

  useEffect(() => {
    if (phase !== "reveal") return;

    const frame = window.requestAnimationFrame(() => {
      const targetNode =
        focusedRevealTarget === "header-quit" || focusedRevealTarget === "header-next"
          ? headerButtonRefs.current[focusedRevealTarget]
          : nextQuestionButtonRef.current;

      focusRemoteControl(targetNode);
      revealPanelRef.current?.scrollIntoView({
        block: "nearest",
        inline: "nearest",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [currentQuestionIndex, focusedRevealTarget, phase]);

  useEffect(() => {
    if (phase !== "question") return;
    if (typeof window === "undefined" || !window.matchMedia("(max-width: 767px)").matches) return;

    const anchor = questionViewportAnchorRef.current;
    if (!anchor) return;

    const frame = window.requestAnimationFrame(() => {
      const nextTop = Math.max(
        0,
        window.scrollY + anchor.getBoundingClientRect().bottom - window.innerHeight + 12,
      );
      window.scrollTo({
        top: nextTop,
        behavior: "auto",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [currentQuestionIndex, phase]);

  const registerCompleteFocusRef = useCallback(
    (target: CompleteFocusTarget) => (node: HTMLElement | null) => {
      if (node) {
        completeFocusRefs.current[target] = node;
        return;
      }

      delete completeFocusRefs.current[target];
    },
    [],
  );

  const registerHeaderButtonRef = useCallback(
    (target: HeaderActionTarget) => (node: HTMLButtonElement | null) => {
      headerButtonRefs.current[target] = node;
      if (node) {
        completeFocusRefs.current[target] = node;
        return;
      }

      delete completeFocusRefs.current[target];
    },
    [],
  );

  useEffect(() => {
    if (phase !== "question" || focusedAnswerIndex === null) return;

    const node = answerButtonRefs.current[focusedAnswerIndex];
    if (!node) return;

    const frame = window.requestAnimationFrame(() => {
      focusRemoteControl(node);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [focusedAnswerIndex, phase]);

  useEffect(() => {
    if (phase !== "question" || !focusedHeaderTarget) return;

    const node = headerButtonRefs.current[focusedHeaderTarget];
    if (!node) return;

    const frame = window.requestAnimationFrame(() => {
      focusRemoteControl(node);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [focusedHeaderTarget, phase]);

  useEffect(() => {
    if (phase !== "complete" || !focusedCompleteTarget) return;

    const node = completeFocusRefs.current[focusedCompleteTarget];
    if (!node) return;

    const frame = window.requestAnimationFrame(() => {
      focusRemoteControl(node);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [focusedCompleteTarget, phase]);

  useEffect(() => {
    return () => {
      stopReadAloudRef.current();
      stopCountdown();
      clearAutoAdvance();
    };
  }, [clearAutoAdvance, stopCountdown]);

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

  const playAgain = useCallback(() => {
    clearAutoAdvance();
    stopCountdown();

    quizStartedAtRef.current = new Date();
    quizFinishedAtRef.current = null;
    scoreRef.current = 0;
    resultsRef.current = [];
    hasPersistedRef.current = false;
    finalizedQuestionKeyRef.current = null;
    answerWindowOpenedRef.current = false;

    setCurrentQuestionIndex(0);
    setAnswerWindowOpen(false);
    setFocusedAnswerIndex(null);
    setFocusedCompleteTarget(null);
    setSelectedAnswerIndex(null);
    setRemainingSeconds(QUESTION_TIME_SECONDS);
    setScore(0);
    setResults([]);
    setCompletedDurationMs(0);
    setSaveStatus("idle");
    setPhase("question");
  }, [clearAutoAdvance, stopCountdown]);

  const submitVote = useCallback(async (nextVote: VoteType) => {
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
  }, [isVoting, quiz.id]);

  const getNextCompleteTarget = useCallback((
    currentTarget: CompleteFocusTarget | null,
    key: "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown",
  ) => {
    const initialTarget = completeFocusRows[0]?.[0] ?? null;
    if (!initialTarget) return null;

    if (!currentTarget) {
      return initialTarget;
    }

    const rowIndex = completeFocusRows.findIndex((row) => row.includes(currentTarget));
    if (rowIndex === -1) {
      return initialTarget;
    }

    const currentRow = completeFocusRows[rowIndex] ?? [];
    const columnIndex = Math.max(0, currentRow.indexOf(currentTarget));

    if (key === "ArrowLeft") {
      return currentRow[Math.max(0, columnIndex - 1)] ?? currentTarget;
    }

    if (key === "ArrowRight") {
      return currentRow[Math.min(currentRow.length - 1, columnIndex + 1)] ?? currentTarget;
    }

    const nextRowIndex =
      key === "ArrowUp"
        ? Math.max(0, rowIndex - 1)
        : Math.min(completeFocusRows.length - 1, rowIndex + 1);

    const nextRow = completeFocusRows[nextRowIndex] ?? currentRow;
    return nextRow[Math.min(columnIndex, nextRow.length - 1)] ?? currentTarget;
  }, [completeFocusRows]);

  useEffect(() => {
    if (phase !== "complete") return;

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
        if (!focusedCompleteTarget) return;

        if (focusedCompleteTarget === "header-quit") {
          router.push(homePath);
          return;
        }

        if (focusedCompleteTarget === "header-next") {
          void playNext();
          return;
        }

        if (focusedCompleteTarget === "like") {
          void submitVote("like");
          return;
        }

        if (focusedCompleteTarget === "dislike") {
          void submitVote("dislike");
          return;
        }

        if (focusedCompleteTarget === "share") {
          void shareQuiz();
          return;
        }

        if (focusedCompleteTarget === "make-one-like-this") {
          makeOneLikeThis();
          return;
        }

        if (focusedCompleteTarget === "sign-in") {
          router.push("/sign-in?callbackURL=/dashboard");
          return;
        }

        if (focusedCompleteTarget.startsWith("breakdown-")) {
          return;
        }

        if (focusedCompleteTarget.endsWith("play-next")) {
          void playNext();
          return;
        }

        if (focusedCompleteTarget.endsWith("play-again")) {
          playAgain();
          return;
        }

        router.push(homePath);
        return;
      }

      setFocusedCompleteTarget((previous) =>
        getNextCompleteTarget(
          previous,
          event.key as "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown",
        ),
      );
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusedCompleteTarget, getNextCompleteTarget, homePath, makeOneLikeThis, phase, playAgain, playNext, router, shareQuiz, submitVote]);

  useEffect(() => {
    if (phase !== "reveal") return;

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
        if (focusedRevealTarget === "header-quit") {
          router.push(homePath);
          return;
        }

        if (focusedRevealTarget === "header-next") {
          void playNext();
          return;
        }

        moveToNextQuestion();
        return;
      }

      setFocusedRevealTarget((previous) => {
        if (!previous) return "reveal-next";

        if (previous === "reveal-next") {
          if (event.key === "ArrowUp") return "header-quit";
          return "reveal-next";
        }

        if (previous === "header-quit") {
          if (event.key === "ArrowRight") return "header-next";
          if (event.key === "ArrowDown") return "reveal-next";
          return "header-quit";
        }

        if (event.key === "ArrowLeft") return "header-quit";
        if (event.key === "ArrowDown") return "reveal-next";
        return "header-next";
      });
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusedRevealTarget, homePath, moveToNextQuestion, phase, playNext, router]);

  if (!currentQuestion && phase !== "complete") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0f1117] px-6 text-[#e4e4e9]">
        <div className="max-w-xl space-y-6 rounded-2xl border border-[#252940] bg-[#1a1d2e] p-8 text-center">
          <h1 className="text-3xl font-bold">Quiz unavailable</h1>
          <p className="text-lg text-[#9394a5]">Could not load this quiz.</p>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <CircularButton onClick={playAgain}>Retry</CircularButton>
            <CircularButton onClick={() => router.push(homePath)}>Home</CircularButton>
          </div>
        </div>
      </div>
    );
  }

  function renderCompleteActions(position: "top" | "bottom") {
    const playNextTarget = `${position}-play-next` as const;
    const playAgainTarget = `${position}-play-again` as const;

    return (
      <div
        className={cn(
          "mx-auto w-full space-y-4",
          position === "top" ? "xl:max-w-4xl" : "",
        )}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <GameButton
            ref={registerCompleteFocusRef(playNextTarget)}
            centered
            disabled={isLoadingNextQuiz}
            className="min-h-20 border-[#6c8aff]/45 bg-[#6c8aff]/18 text-2xl text-[#e4e4e9] md:text-3xl"
            focused={focusedCompleteTarget === playNextTarget}
            onClick={() => void playNext()}
          >
            {isLoadingNextQuiz ? "Loading..." : nextButtonLabel}
          </GameButton>
          <GameButton
            ref={registerCompleteFocusRef(playAgainTarget)}
            centered
            className="min-h-20 text-2xl md:text-3xl"
            focused={focusedCompleteTarget === playAgainTarget}
            onClick={playAgain}
          >
            Play Again
          </GameButton>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "min-h-screen bg-[#0f1117] px-3 py-4 text-[#e4e4e9] sm:px-6 sm:py-7 md:px-10",
        compactLayout && "md:px-7 md:py-5",
      )}
    >
      <main className={cn("mx-auto w-full max-w-6xl space-y-4 md:space-y-7", compactLayout && "md:space-y-5")}>
        <QuizPlayHeader
          title={quiz.title}
          creatorName={quiz.creatorName}
          creatorImage={quiz.creatorImage}
          leftActionLabel="Quit"
          leftActionOnClick={() => router.push(homePath)}
          leftActionFocused={
            (phase === "question" && focusedHeaderTarget === "header-quit") ||
            (phase === "reveal" && focusedRevealTarget === "header-quit") ||
            (phase === "complete" && focusedCompleteTarget === "header-quit")
          }
          leftActionButtonRef={registerHeaderButtonRef("header-quit")}
          leftActionIcon={<House className="size-5 md:size-6" />}
          rightActionLabel={nextHeaderLabel}
          rightActionOnClick={() => void playNext()}
          rightActionDisabled={isLoadingNextQuiz}
          rightActionFocused={
            (phase === "question" && focusedHeaderTarget === "header-next") ||
            (phase === "reveal" && focusedRevealTarget === "header-next") ||
            (phase === "complete" && focusedCompleteTarget === "header-next")
          }
          rightActionButtonRef={registerHeaderButtonRef("header-next")}
          rightActionIcon={
            <span className="inline-flex items-center justify-center">
              {isLoadingNextQuiz ? (
                <LoaderCircle className="size-5 animate-spin md:size-6" />
              ) : (
                <ArrowRight className="size-5 md:size-6" />
              )}
            </span>
          }
        />
        {phase === "question" || phase === "reveal" ? (
          <section className="overflow-hidden rounded-3xl border border-[#252940] bg-[#1a1d2e]">
            <SlantedBar
              value={timerPercentage}
              className="h-3 border-x-0 border-t-0 md:h-4"
              fillClassName={cn("bg-gradient-to-r", timerBarClass(remainingSeconds))}
            />

            <div className={cn("space-y-3 p-3 md:space-y-6 md:p-8", compactLayout && "md:space-y-3 md:p-4")}>
              <header className={cn("space-y-2 md:space-y-4", compactLayout && "md:space-y-2")}>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <p className={cn("text-sm font-semibold text-[#818cf8] md:text-2xl", compactLayout && "md:text-base")}>
                    Question {currentQuestionIndex + 1} of {totalQuestions}
                  </p>
                  <div className="flex flex-wrap items-center gap-4">
                    <p className={cn("text-sm font-bold text-emerald-300 md:text-2xl", compactLayout && "md:text-lg")}>
                      Score: {score}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (isReadAloudPlaying) {
                        stopReadAloud();
                        if (!answerWindowOpen) {
                          beginAnswerWindow();
                        }
                        return;
                      }
                      void playReadAloud();
                    }}
                    disabled={questionReadAloudSegments.length === 0 || isReadAloudLoading}
                    className={cn(
                      "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition md:text-base",
                      isReadAloudPlaying || isReadAloudLoading
                        ? "border-[#818cf8]/70 bg-[#818cf8]/18 text-[#eef1ff]"
                        : "border-[#252940] bg-[#0f1117]/72 text-[#c7cada] hover:border-[#6c8aff]/45 hover:text-[#eef1ff]",
                      (questionReadAloudSegments.length === 0 || isReadAloudLoading) &&
                        "cursor-not-allowed opacity-70 hover:border-[#252940] hover:text-[#c7cada]",
                    )}
                  >
                    {isReadAloudLoading ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : isReadAloudPlaying ? (
                      <Square className="size-4" />
                    ) : (
                      <Volume2 className="size-4" />
                    )}
                    <span>
                      {isReadAloudLoading
                        ? "Loading voice"
                        : isReadAloudPlaying
                          ? activeSegmentId === "question"
                            ? "Reading question"
                            : "Reading options"
                          : "Read aloud"}
                    </span>
                  </button>

                  <label className="inline-flex min-h-11 items-center gap-3 rounded-full border border-[#252940] bg-[#0f1117]/72 px-4 py-2 text-sm font-semibold text-[#c7cada] md:text-base">
                    <Switch
                      checked={readAloudEnabled}
                      disabled={readAloudSaving}
                      onCheckedChange={(checked) => {
                        if (!checked) {
                          stopReadAloud();
                          if (!answerWindowOpen) {
                            beginAnswerWindow();
                          }
                        }
                        setReadAloudPreferenceError(null);
                        void toggleReadAloud(checked);
                      }}
                      aria-label="Toggle automatic read aloud"
                    />
                    <span>{readAloudSaving ? "Saving..." : "Auto-read"}</span>
                  </label>
                </div>

                {readAloudError ? (
                  <p className="text-sm font-medium text-rose-300 md:text-base">{readAloudError}</p>
                ) : null}

                <h2
                  className={cn(
                    "text-[clamp(1.35rem,6.1vw,3.5rem)] leading-[1.03] font-bold text-[#e4e4e9]",
                    compactLayout && "md:text-[clamp(1.7rem,3.2vw,2.75rem)]",
                    tvLikeLayout && "md:text-[clamp(2.55rem,4.8vw,4.1rem)]",
                  )}
                >
                  {currentQuestion?.questionText}
                </h2>
              </header>

              <div className={cn("grid gap-2.5 md:grid-cols-2 md:gap-4", compactLayout && "md:gap-3")}>
                {[0, 1, 2, 3].map((index) => {
                  const option = currentQuestion?.options[index];
                  const isCorrectOption = phase === "reveal" && index === currentCorrectOptionIndex;
                  const isWrongSelection =
                    phase === "reveal" && selectedAnswerIndex === index && index !== currentCorrectOptionIndex;

                  return (
                    <GameButton
                      key={index}
                      ref={(node) => {
                        answerButtonRefs.current[index] = node;
                      }}
                      className={cn(
                        "min-h-20 md:min-h-32 [&>span>span]:text-[clamp(1.2rem,5.8vw,3.5rem)] [&>span>span]:leading-[1.06]",
                        compactLayout &&
                          "md:min-h-24 md:[&>span>span]:text-[clamp(1.2rem,2.35vw,1.95rem)]",
                        tvLikeLayout &&
                          "md:min-h-28 md:[&>span>span]:text-[clamp(1.8rem,3.5vw,2.9rem)]",
                      )}
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
              <div ref={questionViewportAnchorRef} className="h-px" />

              {phase === "reveal" ? (
                <div
                  ref={revealPanelRef}
                  className="relative overflow-hidden space-y-4 rounded-2xl border border-[#252940] bg-[#0f1117]/82 p-4 md:p-5"
                >
                  <svg
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 h-full w-full"
                    preserveAspectRatio="none"
                    viewBox="0 0 100 100"
                  >
                    <rect
                      x="1.5"
                      y="1.5"
                      width="97"
                      height="97"
                      rx="10"
                      ry="10"
                      pathLength={100}
                      className="fill-none stroke-[#818cf8]/85"
                      strokeWidth="2.5"
                      strokeDasharray="100"
                      strokeDashoffset={100 - revealOutlineProgress}
                      strokeLinecap="round"
                      style={{
                        transition: `stroke-dashoffset ${AUTO_ADVANCE_MS}ms linear`,
                      }}
                    />
                  </svg>
                  <p className="text-base font-semibold text-[#e4e4e9] md:text-2xl">
                    {selectedAnswerIndex === null
                      ? "Time is up."
                      : selectedAnswerIndex === currentCorrectOptionIndex
                        ? "Correct answer!"
                        : "Incorrect answer."}
                  </p>
                  <p
                    className={cn(
                      "text-[clamp(1.05rem,4.9vw,3rem)] leading-tight text-[#9394a5]",
                      compactLayout && "md:text-[clamp(1.1rem,2vw,1.65rem)]",
                      tvLikeLayout && "md:text-[clamp(1.65rem,3vw,2.5rem)]",
                    )}
                  >
                    {correctExplanation || "No explanation provided for this question."}
                  </p>
                  <div className="flex justify-center">
                    <GameButton
                      ref={nextQuestionButtonRef}
                      centered
                      className={cn(
                        "min-h-12 max-w-sm text-sm md:min-h-20 md:text-xl",
                        compactLayout && "md:min-h-14 md:text-base",
                      )}
                      onClick={moveToNextQuestion}
                    >
                      Next Question
                    </GameButton>
                  </div>
                </div>
              ) : null}
            </div>

            <div
              className={cn(
                "border-t border-[#252940] bg-[#0f1117]/82 px-3 py-2.5 md:px-8 md:py-5",
                compactLayout && "md:px-5 md:py-3",
              )}
            >
              <SlantedBar
                value={progressPercentage}
                className={cn("h-3 md:h-4", compactLayout && "md:h-3")}
                fillClassName="bg-gradient-to-r from-[#818cf8] to-[#6c8aff]"
              />
            </div>
          </section>
        ) : null}

        {phase === "complete" ? (
          <section className="space-y-8 rounded-3xl border border-[#252940] bg-[#1a1d2e] p-8 md:p-12">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.85fr)]">
              <div className="rounded-3xl border border-[#252940] bg-[#0f1117]/72 p-6 md:p-8">
                <p className="text-base font-semibold uppercase tracking-[0.28em] text-[#818cf8] md:text-lg">
                  Final Result
                </p>
                <h2 className="mt-4 text-[clamp(3.4rem,5vw,6rem)] leading-[0.92] font-black tracking-tight text-[#e4e4e9]">
                  Quiz Complete
                </h2>
                <p className="mt-5 text-[clamp(2.5rem,4.4vw,4.75rem)] leading-none font-black text-[#e4e4e9]">
                  {score} / {totalQuestions}
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-3xl border border-[#252940] bg-[#0f1117]/72 p-6">
                  <p className="text-base font-semibold text-[#9394a5] md:text-lg">Accuracy</p>
                  <p className="mt-3 text-5xl font-black text-emerald-300 md:text-6xl">
                    {accuracyPercentage}%
                  </p>
                </div>
                <div className="rounded-3xl border border-[#252940] bg-[#0f1117]/72 p-6">
                  <p className="text-base font-semibold text-[#9394a5] md:text-lg">Total Time</p>
                  <p className="mt-3 text-4xl font-black text-[#e4e4e9] md:text-5xl">
                    {formatSecondsFromMs(completedDurationMs)}
                  </p>
                </div>
              </div>
            </div>

            {renderCompleteActions("top")}

            <div className="space-y-5 rounded-3xl border border-[#252940] bg-[#0f1117]/72 p-6 md:p-7">
              <p className="text-3xl font-semibold text-[#e4e4e9] md:text-4xl">Rate this quiz</p>
              <div className="flex flex-wrap gap-3">
                <GameButton
                  ref={registerCompleteFocusRef("like")}
                  centered
                  icon={<ThumbsUp size={20} />}
                  onClick={() => void submitVote("like")}
                  disabled={isVoting}
                  focused={focusedCompleteTarget === "like"}
                  state={vote === "like" ? "selected" : "default"}
                  className="min-h-20 max-w-72 text-2xl md:text-3xl"
                >
                  Like ({likes})
                </GameButton>
                <GameButton
                  ref={registerCompleteFocusRef("dislike")}
                  centered
                  icon={<ThumbsDown size={20} />}
                  onClick={() => void submitVote("dislike")}
                  disabled={isVoting}
                  focused={focusedCompleteTarget === "dislike"}
                  state={vote === "dislike" ? "selected" : "default"}
                  className="min-h-20 max-w-72 text-2xl md:text-3xl"
                >
                  Dislike ({dislikes})
                </GameButton>
              </div>
              <p className="text-xl text-[#9394a5] md:text-2xl">
                {computeLikeRatioLabel(likes, dislikes)}
              </p>
              {voteError ? <p className="text-lg text-rose-300 md:text-xl">{voteError}</p> : null}
            </div>

            <div className="space-y-5 rounded-3xl border border-[#252940] bg-[#0f1117]/72 p-6 md:p-7">
              <p className="text-3xl font-semibold text-[#e4e4e9] md:text-4xl">Keep this round moving</p>
              <div className="grid gap-4 md:grid-cols-2">
                <GameButton
                  ref={registerCompleteFocusRef("share")}
                  centered
                  className="min-h-20 text-2xl md:text-3xl"
                  focused={focusedCompleteTarget === "share"}
                  onClick={() => void shareQuiz()}
                >
                  {shareState === "copied"
                    ? "Link Copied"
                    : shareState === "error"
                      ? "Copy Failed"
                      : "Share This Quiz"}
                </GameButton>
                <GameButton
                  ref={registerCompleteFocusRef("make-one-like-this")}
                  centered
                  className="min-h-20 border-[#6c8aff]/45 bg-[#6c8aff]/12 text-2xl md:text-3xl"
                  focused={focusedCompleteTarget === "make-one-like-this"}
                  onClick={makeOneLikeThis}
                >
                  Make One Like This
                </GameButton>
              </div>
            </div>

            <div className="space-y-5 rounded-3xl border border-[#252940] bg-[#0f1117]/72 p-6 md:p-7">
              <h3 className="text-3xl font-bold text-[#e4e4e9] md:text-4xl">Question Breakdown</h3>
              <div className="max-h-[32rem] space-y-4 overflow-y-auto pr-1">
                {results.map((result, index) => (
                  <div
                    key={`${result.questionId}-${index}`}
                    ref={registerCompleteFocusRef(`breakdown-${index}`)}
                    tabIndex={-1}
                    className={cn(
                      "flex items-start justify-between gap-4 rounded-3xl border border-[#252940] bg-[#1a1d2e]/86 p-5 transition",
                      focusedCompleteTarget === `breakdown-${index}` ? "border-amber-300 ring-4 ring-[#818cf8]/70" : "",
                    )}
                    aria-selected={focusedCompleteTarget === `breakdown-${index}`}
                  >
                    <div className="space-y-1">
                      <p className="text-2xl font-semibold text-[#e4e4e9] md:text-3xl">
                        {index + 1}. {result.questionText}
                      </p>
                      <p className="text-lg text-[#9394a5] md:text-xl">
                        Time: {formatSecondsFromMs(result.timeTakenMs)}
                      </p>
                    </div>
                    <div className="pt-1">
                      {result.isCorrect ? (
                        <CheckCircle2 className="size-7 text-emerald-400" aria-label="Correct" />
                      ) : (
                        <XCircle className="size-7 text-rose-400" aria-label="Incorrect" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {shouldShowSaveStatusCard ? (
              <div className="rounded-3xl border border-[#252940] bg-[#0f1117]/72 p-6">
                {saveStatus === "saving" ? <p className="text-xl text-[#9394a5]">Saving score...</p> : null}
                {saveStatus === "error" ? (
                  <p className="text-xl text-rose-300">Could not save score. Please try again later.</p>
                ) : null}
                {saveStatus === "anonymous" ? (
                  <p className="text-xl text-[#9394a5]">
                    Create an account to save your scores.
                    <button
                      ref={registerCompleteFocusRef("sign-in")}
                      type="button"
                      onClick={() => router.push("/sign-in?callbackURL=/dashboard")}
                      className={cn(
                        "ml-2 font-semibold text-[#818cf8] underline underline-offset-2",
                        focusedCompleteTarget === "sign-in" ? "rounded-md ring-4 ring-[#818cf8]/70" : "",
                      )}
                    >
                      Sign in
                    </button>
                  </p>
                ) : null}
              </div>
            ) : null}

            {renderCompleteActions("bottom")}
          </section>
        ) : null}
      </main>
    </div>
  );
}
