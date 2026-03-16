"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  House,
  LoaderCircle,
  Medal,
  Square,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Volume2,
  XCircle,
} from "lucide-react";
import posthog from "posthog-js";
import { useRouter } from "next/navigation";
import { CircularButton } from "@/components/quiz/CircularButton";
import { GameButton } from "@/components/quiz/GameButton";
import { QuizPlayHeader } from "@/components/quiz/QuizPlayHeader";
import { SlantedBar } from "@/components/quiz/SlantedBar";
import { Switch } from "@/components/ui/switch";
import { useCompactQuizLayout, useTvLikeQuizLayout } from "@/hooks/useCompactQuizLayout";
import { useEndScreenActions } from "@/hooks/use-end-screen-actions";
import { useQuestionReadAloud } from "@/hooks/use-question-read-aloud";
import { useReadAloudPreference } from "@/hooks/use-read-aloud-preference";
import { authClient } from "@/lib/auth-client";
import { buildQuizPlayPath, type MyQuizzesRandomContext } from "@/lib/my-quizzes-random";
import {
  getNextQuizIdForPlayback,
  setMyQuizzesRandomPlaybackContext,
} from "@/lib/my-quizzes-random-client";
import { rememberRecentQuiz } from "@/lib/recent-quiz-history";
import { focusRemoteControl, scrollRemoteControlIntoView } from "@/lib/remote-focus";
import type { PlayableQuestion, QuizWithQuestions, SaveQuizSessionPayload } from "@/lib/quiz-types";
import { cn } from "@/lib/utils";

type CouchCoopGameProps = {
  quiz: QuizWithQuestions;
  playContext?: MyQuizzesRandomContext | null;
  entrySource?: "direct" | "share";
};

type GamePhase = "setup" | "question" | "reveal" | "complete";
type SaveStatus = "idle" | "saving" | "saved" | "error" | "anonymous";
type HeaderActionTarget = "header-quit" | "header-next";
type SetupFocusTarget =
  | HeaderActionTarget
  | `setup-input-${number}`
  | `setup-remove-${number}`
  | "setup-add"
  | "setup-timer"
  | "setup-start"
  | "setup-back";
type RevealFocusTarget = HeaderActionTarget | "reveal-next";
type VoteType = "like" | "dislike";
type CompleteFocusTarget =
  | HeaderActionTarget
  | "like"
  | "dislike"
  | "share"
  | "make-one-like-this"
  | "complete-rematch"
  | "complete-random";

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

function computeLikeRatioLabel(likes: number, dislikes: number) {
  const total = likes + dislikes;
  if (total === 0) return "Be the first to rate this quiz";
  return `${Math.round((likes / total) * 100)}% likes`;
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

export function CouchCoopGame({
  quiz,
  playContext = null,
  entrySource = "direct",
}: CouchCoopGameProps) {
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
  const homePath = playContext ? "/dashboard" : "/hub";

  const [phase, setPhase] = useState<GamePhase>("setup");
  const [setupNames, setSetupNames] = useState<string[]>(["", ""]);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [timerEnabled, setTimerEnabled] = useState(true);

  const [questions, setQuestions] = useState<PlayableQuestion[]>([]);
  const [playerNames, setPlayerNames] = useState<string[]>([]);
  const [scores, setScores] = useState<number[]>([]);
  const [results, setResults] = useState<PlayerResult[]>([]);

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [setupFocusTarget, setSetupFocusTarget] = useState<SetupFocusTarget | null>(null);
  const [focusedAnswerIndex, setFocusedAnswerIndex] = useState<number | null>(null);
  const [focusedHeaderTarget, setFocusedHeaderTarget] = useState<HeaderActionTarget | null>(null);
  const [focusedRevealTarget, setFocusedRevealTarget] = useState<RevealFocusTarget | null>(null);
  const [focusedCompleteTarget, setFocusedCompleteTarget] = useState<CompleteFocusTarget | null>(null);
  const [selectedAnswerIndex, setSelectedAnswerIndex] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(QUESTION_TIME_SECONDS);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [likes, setLikes] = useState(quiz.likes);
  const [dislikes, setDislikes] = useState(quiz.dislikes);
  const [vote, setVote] = useState<VoteType | null>(quiz.currentVote ?? null);
  const [isVoting, setIsVoting] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [isLoadingNextQuiz, setIsLoadingNextQuiz] = useState(false);
  const [answerWindowOpen, setAnswerWindowOpen] = useState(false);
  const nextButtonLabel = playContext ? "Next Random" : "Play Next";
  const nextHeaderLabel = playContext
    ? (isLoadingNextQuiz ? "Loading next random" : "Next Random")
    : (isLoadingNextQuiz ? "Loading next quiz" : "Next quiz");
  const { shareState, shareQuiz, makeOneLikeThis } = useEndScreenActions({
    quizId: quiz.id,
    theme: quiz.theme,
    mode: quiz.gameMode,
    difficulty: quiz.difficulty,
    isSignedIn: Boolean(sessionData?.user?.id),
  });

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const headerButtonRefs = useRef<Record<HeaderActionTarget, HTMLButtonElement | null>>({
    "header-quit": null,
    "header-next": null,
  });
  const setupButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const setupInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const completeFocusRefs = useRef<Record<string, HTMLElement | null>>({});
  const nextTurnButtonRef = useRef<HTMLButtonElement | null>(null);
  const questionViewportAnchorRef = useRef<HTMLDivElement | null>(null);
  const questionStartedAtRef = useRef(0);
  const answerWindowOpenedRef = useRef(false);
  const readAloudEnabledRef = useRef(false);
  const stopReadAloudRef = useRef<() => void>(() => {});
  const startedAtRef = useRef<Date | null>(null);
  const finishedAtRef = useRef<Date | null>(null);
  const hasPersistedRef = useRef(false);
  const finalizedQuestionKeyRef = useRef<string | null>(null);
  const playAttemptRef = useRef(0);
  const hasTrackedCompletionRef = useRef(false);

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
  const teamAccuracyPercentage =
    totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

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

  const completeFocusRows = useMemo<CompleteFocusTarget[][]>(() => {
    const rows: CompleteFocusTarget[][] = [["header-quit", "header-next"]];
    rows.push(["share", "make-one-like-this"]);
    rows.push(["like", "dislike"]);
    rows.push(["complete-random", "complete-rematch"]);
    return rows;
  }, []);

  const trackQuizStarted = useCallback(
    (playerCount: number, startReason: "initial" | "rematch") => {
      playAttemptRef.current += 1;
      hasTrackedCompletionRef.current = false;
      posthog.capture("quiz_started", {
        quiz_id: quiz.id,
        game_mode: quiz.gameMode,
        difficulty: quiz.difficulty,
        source_type: quiz.sourceType,
        question_count: quiz.questions.length,
        entry_source: entrySource,
        signed_in: Boolean(sessionData?.user?.id),
        is_random_play: Boolean(playContext),
        player_count: playerCount,
        attempt_number: playAttemptRef.current,
        start_reason: startReason,
      });
    },
    [entrySource, playContext, quiz.difficulty, quiz.gameMode, quiz.id, quiz.questions.length, quiz.sourceType, sessionData?.user?.id],
  );

  const trackQuizCompleted = useCallback(
    (
      snapshotPlayers: string[],
      snapshotScores: number[],
      snapshotResults: PlayerResult[],
      finishedAt: Date,
    ) => {
      if (hasTrackedCompletionRef.current || !startedAtRef.current) {
        return;
      }

      hasTrackedCompletionRef.current = true;
      const totalScore = snapshotScores.reduce((sum, score) => sum + score, 0);
      const totalCorrectAnswers = snapshotResults.filter((result) => result.isCorrect).length;
      const durationMs = Math.max(0, finishedAt.getTime() - startedAtRef.current.getTime());
      const properties = {
        quiz_id: quiz.id,
        game_mode: quiz.gameMode,
        difficulty: quiz.difficulty,
        source_type: quiz.sourceType,
        question_count: totalQuestions,
        player_count: snapshotPlayers.length,
        completed_questions: snapshotResults.length,
        correct_answers: totalCorrectAnswers,
        total_score: totalScore,
        team_accuracy_percentage:
          totalQuestions > 0 ? Math.round((totalCorrectAnswers / totalQuestions) * 100) : 0,
        duration_ms: durationMs,
        entry_source: entrySource,
        signed_in: Boolean(sessionData?.user?.id),
        is_random_play: Boolean(playContext),
        attempt_number: playAttemptRef.current,
      };

      posthog.capture("quiz_completed", properties);

      if (entrySource === "share") {
        posthog.capture("play_from_shared_link_completed", properties);
      }
    },
    [entrySource, playContext, quiz.difficulty, quiz.gameMode, quiz.id, quiz.sourceType, sessionData?.user?.id, totalQuestions],
  );

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
    rememberRecentQuiz("couch_coop", quiz.id);
  }, [quiz.id]);

  useEffect(() => {
    playAttemptRef.current = 0;
    hasTrackedCompletionRef.current = false;
  }, [quiz.id]);

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
      trackQuizCompleted(snapshotPlayers, snapshotScores, snapshotResults, finishedAt);

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
    [quiz.id, sessionData?.user, trackQuizCompleted],
  );

  const pickAnotherCouchQuiz = useCallback(async () => {
    if (isLoadingNextQuiz) return;

    setIsLoadingNextQuiz(true);
    try {
      const nextQuizId = await getNextQuizIdForPlayback({
        mode: "couch_coop",
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

  const beginRound = useCallback((nextPlayerNames: string[]) => {
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
    hasTrackedCompletionRef.current = false;
    finalizedQuestionKeyRef.current = null;
    answerWindowOpenedRef.current = false;
    setAnswerWindowOpen(false);
    trackQuizStarted(
      trimmedPlayers.length,
      playerNames.length >= MIN_PLAYERS ? "rematch" : "initial",
    );
  }, [playerNames.length, quiz.questions, trackQuizStarted]);

  const startGameFromSetup = useCallback(() => {
    const normalized = normalizePlayerNames(setupNames);
    if (normalized.length < MIN_PLAYERS) {
      setSetupError("Add at least 2 players to start.");
      return;
    }

    beginRound(normalized);
  }, [beginRound, setupNames]);

  const rematch = useCallback(() => {
    if (playerNames.length < MIN_PLAYERS) {
      setPhase("setup");
      return;
    }

    beginRound(playerNames);
  }, [beginRound, playerNames]);

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
    setAnswerWindowOpen(false);
    answerWindowOpenedRef.current = false;
    finalizedQuestionKeyRef.current = null;
    setPhase("question");
  }, [currentQuestionIndex, persistCompletedSession, playerNames, results, scores, totalQuestions]);

  const finalizeAnswer = useCallback(
    (selectedIndex: number | null) => {
      if (phase !== "question" || !currentQuestion) return;

      const questionKey = `${currentQuestionIndex}:${currentQuestion.id}`;
      if (finalizedQuestionKeyRef.current === questionKey) return;
      finalizedQuestionKeyRef.current = questionKey;

      stopReadAloudRef.current();
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

  const beginAnswerWindow = useCallback(() => {
    if (phase !== "question" || answerWindowOpenedRef.current) {
      return;
    }

    answerWindowOpenedRef.current = true;
    setAnswerWindowOpen(true);
    questionStartedAtRef.current = Date.now();

    if (!timerEnabled) {
      return;
    }

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
  }, [finalizeAnswer, phase, timerEnabled]);

  const {
    activeSegmentId,
    error: readAloudPlaybackError,
    isLoading: isReadAloudLoading,
    isPlaying: isReadAloudPlaying,
    play: playReadAloud,
    stop: stopReadAloud,
  } = useQuestionReadAloud({
    segments: questionReadAloudSegments,
    playbackKey: currentQuestion ? `${currentQuestionIndex}:${currentQuestion.id}` : null,
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
    if (phase !== "setup") return;

    function onKeyDown(event: KeyboardEvent) {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter"].includes(event.key)) {
        return;
      }

      const activeElement = document.activeElement as HTMLElement | null;
      const isTextInputActive =
        activeElement && (activeElement.tagName === "INPUT" || activeElement.tagName === "TEXTAREA");

      if (isTextInputActive && event.key === "Enter") {
        return;
      }

      event.preventDefault();

      if (event.key === "Enter") {
        if (!setupFocusTarget) return;

        if (setupFocusTarget === "header-quit" || setupFocusTarget === "setup-back") {
          router.push(homePath);
          return;
        }

        if (setupFocusTarget === "header-next") {
          void pickAnotherCouchQuiz();
          return;
        }

        if (setupFocusTarget === "setup-add") {
          setSetupNames((previous) => (previous.length >= MAX_PLAYERS ? previous : [...previous, ""]));
          return;
        }

        if (setupFocusTarget === "setup-timer") {
          setTimerEnabled((previous) => !previous);
          return;
        }

        if (setupFocusTarget === "setup-start") {
          startGameFromSetup();
          return;
        }

        if (setupFocusTarget.startsWith("setup-input-")) {
          const inputIndex = Number.parseInt(setupFocusTarget.replace("setup-input-", ""), 10);
          if (Number.isNaN(inputIndex)) return;
          setupInputRefs.current[inputIndex]?.focus();
          return;
        }

        if (setupFocusTarget.startsWith("setup-remove-")) {
          const removeIndex = Number.parseInt(setupFocusTarget.replace("setup-remove-", ""), 10);
          if (Number.isNaN(removeIndex)) return;
          setSetupNames((previous) =>
            previous.length <= MIN_PLAYERS
              ? previous
              : previous.filter((_, currentIndex) => currentIndex !== removeIndex),
          );
        }
        return;
      }

      setSetupFocusTarget((previous) => {
        if (!previous) return "setup-start";

        const canRemovePlayers = setupNames.length > MIN_PLAYERS;
        const removeTargets = canRemovePlayers
          ? setupNames.map((_, index) => `setup-remove-${index}` as const)
          : [];
        const lastRemoveTarget = removeTargets.at(-1) ?? null;
        const lastInputTarget = `setup-input-${Math.max(0, setupNames.length - 1)}` as const;

        if (previous === "header-quit") {
          if (event.key === "ArrowRight") return "header-next";
          if (event.key === "ArrowDown") return "setup-input-0";
          return "header-quit";
        }

        if (previous === "header-next") {
          if (event.key === "ArrowLeft") return "header-quit";
          if (event.key === "ArrowDown") return removeTargets[0] ?? "setup-input-0";
          return "header-next";
        }

        if (previous.startsWith("setup-input-")) {
          const inputIndex = Number.parseInt(previous.replace("setup-input-", ""), 10);
          if (Number.isNaN(inputIndex)) return "setup-add";

          if (event.key === "ArrowUp") {
            return inputIndex === 0 ? "header-quit" : `setup-input-${inputIndex - 1}`;
          }

          if (event.key === "ArrowDown") {
            return inputIndex >= setupNames.length - 1 ? "setup-add" : `setup-input-${inputIndex + 1}`;
          }

          if (event.key === "ArrowRight" && canRemovePlayers) {
            return `setup-remove-${Math.min(inputIndex, setupNames.length - 1)}`;
          }

          return previous;
        }

        if (previous === "setup-add") {
          if (event.key === "ArrowUp") return lastInputTarget;
          if (event.key === "ArrowRight") return "setup-timer";
          if (event.key === "ArrowDown") return "setup-start";
          return "setup-add";
        }

        if (previous === "setup-timer") {
          if (event.key === "ArrowUp") return lastRemoveTarget ?? lastInputTarget;
          if (event.key === "ArrowLeft") return "setup-add";
          if (event.key === "ArrowDown") return "setup-back";
          return "setup-timer";
        }

        if (previous === "setup-start") {
          if (event.key === "ArrowUp") return "setup-add";
          if (event.key === "ArrowRight") return "setup-back";
          return "setup-start";
        }

        if (previous === "setup-back") {
          if (event.key === "ArrowUp") return "setup-timer";
          if (event.key === "ArrowLeft") return "setup-start";
          return "setup-back";
        }

        if (previous.startsWith("setup-remove-")) {
          const removeIndex = Number.parseInt(previous.replace("setup-remove-", ""), 10);
          if (Number.isNaN(removeIndex)) return "setup-input-0";

          if (event.key === "ArrowUp") {
            return removeIndex === 0 ? "header-next" : `setup-remove-${removeIndex - 1}`;
          }

          if (event.key === "ArrowDown") {
            return removeIndex >= removeTargets.length - 1 ? "setup-timer" : `setup-remove-${removeIndex + 1}`;
          }

          if (event.key === "ArrowLeft") {
            return `setup-input-${Math.min(removeIndex, setupNames.length - 1)}`;
          }

          return previous;
        }

        return previous;
      });
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [homePath, phase, pickAnotherCouchQuiz, router, setupFocusTarget, setupNames, startGameFromSetup]);

  useEffect(() => {
    if (phase !== "question" || !currentQuestion) {
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
  }, [beginAnswerWindow, currentQuestion, phase, readAloudPreferenceReady]);

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

          void pickAnotherCouchQuiz();
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
  }, [finalizeAnswer, focusedAnswerIndex, focusedHeaderTarget, homePath, phase, pickAnotherCouchQuiz, router]);

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
          void pickAnotherCouchQuiz();
          return;
        }

        moveToNextTurn();
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
  }, [focusedRevealTarget, homePath, moveToNextTurn, phase, pickAnotherCouchQuiz, router]);

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

        if (focusedCompleteTarget === "header-next" || focusedCompleteTarget === "complete-random") {
          void pickAnotherCouchQuiz();
          return;
        }

        if (focusedCompleteTarget === "complete-rematch") {
          rematch();
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
        }
        return;
      }

      setFocusedCompleteTarget((previous) => {
        if (!previous) return completeFocusRows[0]?.[0] ?? null;

        const rowIndex = completeFocusRows.findIndex((row) => row.includes(previous));
        if (rowIndex === -1) return completeFocusRows[0]?.[0] ?? null;

        const row = completeFocusRows[rowIndex] ?? [];
        const colIndex = row.indexOf(previous);
        const targetColumn = colIndex >= 0 ? colIndex : 0;

        if (event.key === "ArrowLeft") {
          return row[Math.max(0, targetColumn - 1)] ?? previous;
        }

        if (event.key === "ArrowRight") {
          return row[Math.min(row.length - 1, targetColumn + 1)] ?? previous;
        }

        const verticalDirection = event.key === "ArrowUp" ? -1 : 1;
        let nextRowIndex = rowIndex + verticalDirection;

        while (nextRowIndex >= 0 && nextRowIndex < completeFocusRows.length) {
          const nextRow = completeFocusRows[nextRowIndex];
          if (!nextRow || nextRow.length === 0) {
            nextRowIndex += verticalDirection;
            continue;
          }

          return nextRow[Math.min(targetColumn, nextRow.length - 1)] ?? nextRow[0] ?? previous;
        }

        return previous;
      });
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [completeFocusRows, focusedCompleteTarget, homePath, makeOneLikeThis, phase, pickAnotherCouchQuiz, rematch, router, shareQuiz, submitVote]);

  useEffect(() => {
    return () => {
      stopReadAloudRef.current();
      stopCountdown();
    };
  }, []);

  useEffect(() => {
    if (phase === "setup") {
      setFocusedHeaderTarget(null);
      setFocusedAnswerIndex(null);
      setFocusedRevealTarget(null);
      setFocusedCompleteTarget(null);
      setSetupFocusTarget((previous) => previous ?? "setup-start");
      return;
    }

    setSetupFocusTarget(null);
  }, [phase]);

  useEffect(() => {
    if (phase !== "setup") return;

    if (!setupFocusTarget) {
      setSetupFocusTarget("setup-start");
      return;
    }

    if (setupFocusTarget.startsWith("setup-input-")) {
      const inputIndex = Number.parseInt(setupFocusTarget.replace("setup-input-", ""), 10);
      if (Number.isNaN(inputIndex) || inputIndex >= setupNames.length) {
        setSetupFocusTarget(`setup-input-${Math.max(0, setupNames.length - 1)}`);
      }
      return;
    }

    if (!setupFocusTarget.startsWith("setup-remove-")) return;

    const removeIndex = Number.parseInt(setupFocusTarget.replace("setup-remove-", ""), 10);
    const canRemovePlayers = setupNames.length > MIN_PLAYERS;

    if (!canRemovePlayers) {
      setSetupFocusTarget("setup-timer");
      return;
    }

    if (Number.isNaN(removeIndex) || removeIndex >= setupNames.length) {
      setSetupFocusTarget(`setup-remove-${Math.max(0, setupNames.length - 1)}`);
    }
  }, [phase, setupFocusTarget, setupNames.length]);

  const registerSetupButtonRef = useCallback(
    (target: SetupFocusTarget) => (node: HTMLButtonElement | null) => {
      setupButtonRefs.current[target] = node;
    },
    [],
  );

  const registerSetupInputRef = useCallback(
    (index: number) => (node: HTMLInputElement | null) => {
      setupInputRefs.current[index] = node;
    },
    [],
  );

  useEffect(() => {
    if (phase !== "setup" || !setupFocusTarget) return;

    const node =
      setupFocusTarget === "header-quit" || setupFocusTarget === "header-next"
        ? headerButtonRefs.current[setupFocusTarget]
        : setupFocusTarget.startsWith("setup-input-")
          ? setupInputRefs.current[
              Number.parseInt(setupFocusTarget.replace("setup-input-", ""), 10)
            ] ?? null
          : setupButtonRefs.current[setupFocusTarget];
    if (!node) return;

    const frame = window.requestAnimationFrame(() => {
      focusRemoteControl(node);
      if (node instanceof HTMLInputElement) {
        node.click();
        const length = node.value.length;
        try {
          node.setSelectionRange(length, length);
        } catch {
          // Ignore inputs that don't support selection ranges.
        }
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [phase, setupFocusTarget]);

  useEffect(() => {
    if (phase !== "complete" || !focusedCompleteTarget) return;

    const node =
      focusedCompleteTarget === "header-quit" || focusedCompleteTarget === "header-next"
        ? headerButtonRefs.current[focusedCompleteTarget]
        : completeFocusRefs.current[focusedCompleteTarget];
    if (!node) return;

    const frame = window.requestAnimationFrame(() => {
      focusRemoteControl(node);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [focusedCompleteTarget, phase]);

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

  const registerHeaderButtonRef = useCallback(
    (target: HeaderActionTarget) => (node: HTMLButtonElement | null) => {
      headerButtonRefs.current[target] = node;
    },
    [],
  );

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
    if (phase !== "reveal") return;

    const frame = window.requestAnimationFrame(() => {
      const node =
        focusedRevealTarget === "header-quit" || focusedRevealTarget === "header-next"
          ? headerButtonRefs.current[focusedRevealTarget]
          : nextTurnButtonRef.current;
      focusRemoteControl(node);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [focusedRevealTarget, phase]);

  if (phase === "setup") {
    return (
      <div className="min-h-screen bg-[#0f1117] px-4 py-6 text-[#e4e4e9] sm:px-6 md:px-10">
        <main className="mx-auto w-full max-w-5xl space-y-7">
          <QuizPlayHeader
            title={quiz.title}
            creatorName={quiz.creatorName}
            creatorImage={quiz.creatorImage}
            leftActionLabel="Quit"
            leftActionOnClick={() => router.push(homePath)}
            leftActionButtonRef={registerHeaderButtonRef("header-quit")}
            leftActionFocused={setupFocusTarget === "header-quit"}
            leftActionIcon={<House className="size-5 md:size-6" />}
            rightActionLabel={nextHeaderLabel}
            rightActionOnClick={() => void pickAnotherCouchQuiz()}
            rightActionDisabled={isLoadingNextQuiz}
            rightActionButtonRef={registerHeaderButtonRef("header-next")}
            rightActionFocused={setupFocusTarget === "header-next"}
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
          <section className="space-y-7 rounded-3xl border border-[#252940] bg-[#1a1d2e] p-7 md:p-9">
            <div className="space-y-2 text-center">
              <h1 className="text-[clamp(3rem,4.5vw,5rem)] font-black tracking-tight">
                Who&apos;s playing?
              </h1>
              <p className="text-xl text-[#9394a5] md:text-2xl">
                Enter 2 to 6 players, then start your couch co-op round.
              </p>
            </div>

            <div className="space-y-4">
              {setupNames.map((name, index) => (
                <div key={`player-input-${index}`} className="flex items-center gap-3">
                  <label
                    htmlFor={`player-name-${index}`}
                    className="w-28 text-base font-semibold text-[#9394a5] md:text-lg"
                  >
                    Player {index + 1}
                  </label>
                  <input
                    ref={registerSetupInputRef(index)}
                    id={`player-name-${index}`}
                    type="text"
                    value={name}
                    maxLength={MAX_NAME_LENGTH}
                    onFocus={(event) => {
                      setSetupFocusTarget(`setup-input-${index}`);
                      scrollRemoteControlIntoView(event.currentTarget);
                    }}
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
                      "min-h-14 w-full rounded-2xl border border-[#252940] bg-[#0f1117] px-5 text-lg text-[#e4e4e9] md:min-h-16 md:text-xl",
                      "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#818cf8]/50",
                      setupFocusTarget === `setup-input-${index}` && "ring-4 ring-[#818cf8]/50",
                    )}
                  />
                  <GameButton
                    centered
                    iconOnly
                    aria-label={`Remove Player ${index + 1}`}
                    title={`Remove Player ${index + 1}`}
                    focused={setupFocusTarget === `setup-remove-${index}`}
                    ref={registerSetupButtonRef(`setup-remove-${index}`)}
                    disabled={setupNames.length <= MIN_PLAYERS}
                    className="min-h-14 w-14 shrink-0 px-0 md:min-h-16 md:w-16"
                    icon={<Trash2 className="h-6 w-6 md:h-7 md:w-7" />}
                    onClick={() =>
                      setSetupNames((previous) =>
                        previous.length <= MIN_PLAYERS
                          ? previous
                          : previous.filter((_, currentIndex) => currentIndex !== index),
                      )
                    }
                  />
                </div>
              ))}
            </div>

            <div className="flex flex-wrap justify-center gap-3">
              <GameButton
                centered
                focused={setupFocusTarget === "setup-add"}
                ref={registerSetupButtonRef("setup-add")}
                disabled={setupNames.length >= MAX_PLAYERS}
                className="min-h-14 max-w-52 text-base md:text-lg"
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
                focused={setupFocusTarget === "setup-timer"}
                ref={registerSetupButtonRef("setup-timer")}
                className="min-h-14 max-w-52 text-base md:text-lg"
                onClick={() => setTimerEnabled((previous) => !previous)}
              >
                Timer: {timerEnabled ? "ON" : "OFF"}
              </GameButton>
            </div>

            {setupError ? (
              <p className="rounded-2xl border border-rose-500/50 bg-rose-500/10 p-4 text-center text-base text-rose-200 md:text-lg">
                {setupError}
              </p>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <GameButton
                centered
                focused={setupFocusTarget === "setup-start"}
                ref={registerSetupButtonRef("setup-start")}
                className="min-h-16 max-w-sm border-[#6c8aff]/45 bg-[#6c8aff]/18 text-lg text-[#e4e4e9] md:text-xl"
                onClick={startGameFromSetup}
              >
                Start Couch Co-op
              </GameButton>
              <GameButton
                centered
                focused={setupFocusTarget === "setup-back"}
                ref={registerSetupButtonRef("setup-back")}
                className="min-h-16 max-w-sm text-lg md:text-xl"
                onClick={() => router.push(homePath)}
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
      <div className="flex min-h-screen items-center justify-center bg-[#0f1117] px-6 text-[#e4e4e9]">
        <div className="w-full max-w-2xl space-y-6 rounded-2xl border border-[#252940] bg-[#1a1d2e] p-8 text-center">
          <h1 className="text-3xl font-bold md:text-4xl">Quiz unavailable</h1>
          <p className="text-lg text-[#9394a5] md:text-xl">Could not load this couch co-op quiz.</p>
          <div className="flex justify-center">
            <CircularButton onClick={() => router.push(homePath)}>Home</CircularButton>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "complete") {
    return (
      <div className="min-h-screen bg-[#0f1117] px-4 py-6 text-[#e4e4e9] sm:px-6 md:px-10">
        <main className="mx-auto w-full max-w-6xl space-y-7">
          <QuizPlayHeader
            title={quiz.title}
            creatorName={quiz.creatorName}
            creatorImage={quiz.creatorImage}
            leftActionLabel="Quit"
            leftActionOnClick={() => router.push(homePath)}
            leftActionButtonRef={registerHeaderButtonRef("header-quit")}
            leftActionFocused={focusedCompleteTarget === "header-quit"}
            leftActionIcon={<House className="size-5 md:size-6" />}
            rightActionLabel={nextHeaderLabel}
            rightActionOnClick={() => void pickAnotherCouchQuiz()}
            rightActionDisabled={isLoadingNextQuiz}
            rightActionButtonRef={registerHeaderButtonRef("header-next")}
            rightActionFocused={focusedCompleteTarget === "header-next"}
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
          <section className="space-y-8 rounded-3xl border border-[#252940] bg-[#1a1d2e] p-8 md:p-12">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.85fr)]">
              <div className="rounded-3xl border border-[#252940] bg-[#0f1117]/72 p-6 md:p-8">
                <p className="text-base font-semibold uppercase tracking-[0.28em] text-[#818cf8] md:text-lg">
                  Team Result
                </p>
                <h2 className="mt-4 text-[clamp(3.4rem,5vw,6rem)] leading-[0.92] font-black tracking-tight text-[#e4e4e9]">
                  Leaderboard
                </h2>
                <p className="mt-5 text-[clamp(2.5rem,4.4vw,4.75rem)] leading-none font-black text-[#e4e4e9]">
                  {totalCorrect} / {totalQuestions}
                </p>
                <p className="mt-4 text-2xl text-[#9394a5] md:text-3xl">
                  Team accuracy landed at {teamAccuracyPercentage}%.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-3xl border border-[#252940] bg-[#0f1117]/72 p-6">
                  <p className="text-base font-semibold text-[#9394a5] md:text-lg">Players</p>
                  <p className="mt-3 text-5xl font-black text-[#e4e4e9] md:text-6xl">
                    {playerNames.length}
                  </p>
                </div>
                <div className="rounded-3xl border border-[#252940] bg-[#0f1117]/72 p-6">
                  <p className="text-base font-semibold text-[#9394a5] md:text-lg">Top Player</p>
                  <p className="mt-3 text-3xl font-black text-emerald-300 md:text-4xl">
                    {leaderboard[0]?.name ?? "Team"}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {leaderboard.map((entry, index) => (
                <div
                  key={`${entry.name}-${index}`}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[#252940] bg-[#0f1117]/82 p-6"
                >
                  <div className="flex items-center gap-3">
                    <span className="inline-flex size-14 items-center justify-center rounded-full border border-[#252940] bg-[#1a1d2e] text-xl font-bold">
                      {index + 1}
                    </span>
                    <div className="space-y-1">
                      <p className="text-3xl font-bold text-[#e4e4e9] md:text-4xl">
                        {entry.name}
                        {index < 3 ? <Medal className="ml-2 inline size-5 text-amber-300" /> : null}
                      </p>
                      <p className="text-lg text-[#9394a5] md:text-xl">
                        {entry.correctRate.toFixed(1)}% correct | Avg time {formatSecondsFromMs(entry.avgTimeMs)}
                      </p>
                    </div>
                  </div>
                  <p className="text-5xl font-black text-emerald-300">{entry.score}</p>
                </div>
              ))}

              <div className="space-y-5 rounded-3xl border border-[#252940] bg-[#0f1117]/72 p-6 md:p-7">
                <p className="text-3xl font-semibold text-[#e4e4e9] md:text-4xl">Share or spin another version</p>
                <div className="grid gap-4 md:grid-cols-2">
                  <GameButton
                    ref={(node) => {
                      completeFocusRefs.current.share = node;
                    }}
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
                    ref={(node) => {
                      completeFocusRefs.current["make-one-like-this"] = node;
                    }}
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
                <p className="text-3xl font-semibold text-[#e4e4e9] md:text-4xl">Rate this quiz</p>
                <div className="flex flex-wrap gap-3">
                  <GameButton
                    ref={(node) => {
                      completeFocusRefs.current.like = node;
                    }}
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
                    ref={(node) => {
                      completeFocusRefs.current.dislike = node;
                    }}
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
            </div>

            <div className="rounded-3xl border border-[#252940] bg-[#0f1117]/72 p-6">
              {saveStatus === "saving" ? (
                <p className="text-xl text-[#9394a5]">Saving session...</p>
              ) : null}
              {saveStatus === "saved" ? (
                <p className="text-xl text-emerald-300">Session saved!</p>
              ) : null}
              {saveStatus === "error" ? (
                <p className="text-xl text-rose-300">Could not save this session.</p>
              ) : null}
              {saveStatus === "anonymous" ? (
                <p className="text-xl text-[#9394a5]">Played in guest mode.</p>
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <GameButton
                ref={(node) => {
                  completeFocusRefs.current["complete-random"] = node;
                }}
                centered
                disabled={isLoadingNextQuiz}
                focused={focusedCompleteTarget === "complete-random"}
                className="min-h-20 border-[#6c8aff]/45 bg-[#6c8aff]/18 text-2xl text-[#e4e4e9] md:text-3xl"
                onClick={() => void pickAnotherCouchQuiz()}
              >
                {isLoadingNextQuiz ? "Loading..." : nextButtonLabel}
              </GameButton>
              <GameButton
                ref={(node) => {
                  completeFocusRefs.current["complete-rematch"] = node;
                }}
                centered
                focused={focusedCompleteTarget === "complete-rematch"}
                className="min-h-20 text-2xl md:text-3xl"
                onClick={rematch}
              >
                Play Again
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
    <div
      className={cn(
        "min-h-screen bg-[#0f1117] px-3 py-4 text-[#e4e4e9] sm:px-6 sm:py-7 md:px-10",
        compactLayout && "md:px-7 md:py-5",
      )}
    >
      <main className={cn("mx-auto w-full max-w-7xl space-y-4 md:space-y-7", compactLayout && "md:space-y-5")}>
        <QuizPlayHeader
          title={quiz.title}
          creatorName={quiz.creatorName}
          creatorImage={quiz.creatorImage}
          leftActionLabel="Quit"
          leftActionOnClick={() => router.push(homePath)}
          leftActionButtonRef={registerHeaderButtonRef("header-quit")}
          leftActionFocused={
            (phase === "question" && focusedHeaderTarget === "header-quit") ||
            (phase === "reveal" && focusedRevealTarget === "header-quit")
          }
          leftActionIcon={<House className="size-5 md:size-6" />}
          rightActionLabel={nextHeaderLabel}
          rightActionOnClick={() => void pickAnotherCouchQuiz()}
          rightActionDisabled={isLoadingNextQuiz}
          rightActionButtonRef={registerHeaderButtonRef("header-next")}
          rightActionFocused={
            (phase === "question" && focusedHeaderTarget === "header-next") ||
            (phase === "reveal" && focusedRevealTarget === "header-next")
          }
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
        <section className="overflow-hidden rounded-3xl border border-[#252940] bg-[#1a1d2e]">
          {timerEnabled ? (
            <SlantedBar
              value={timerPercentage}
              className="h-3 border-x-0 border-t-0 md:h-4"
              fillClassName={cn("bg-gradient-to-r", timerBarClass(remainingSeconds))}
            />
          ) : null}

          <div className={cn("space-y-3 p-3 md:space-y-5 md:p-8", compactLayout && "md:space-y-3 md:p-4")}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className={cn("text-sm font-semibold text-[#818cf8] md:text-2xl", compactLayout && "md:text-base")}>
                Question {currentQuestionIndex + 1} of {totalQuestions}
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <span
                  className={cn(
                    "rounded-full border border-amber-400/50 bg-amber-500/20 px-3 py-1.5 text-sm font-bold text-amber-100 md:px-5 md:py-2 md:text-lg",
                    compactLayout && "md:px-4 md:py-1.5 md:text-base",
                  )}
                >
                  {currentPlayerName}&apos;s turn
                </span>
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
                "text-[clamp(1.35rem,6.1vw,3.5rem)] leading-[1.03] font-bold",
                compactLayout && "md:text-[clamp(1.7rem,3.2vw,2.75rem)]",
                tvLikeLayout && "md:text-[clamp(2.55rem,4.8vw,4.1rem)]",
              )}
            >
              {currentQuestion.questionText}
            </h2>

            <div className={cn("grid gap-2.5 md:grid-cols-2 md:gap-4", compactLayout && "md:gap-3")}>
              {[0, 1, 2, 3].map((index) => {
                const option = currentQuestion.options[index];
                const isCorrectOption = phase === "reveal" && index === currentCorrectOptionIndex;
                const isWrongSelection =
                  phase === "reveal" && selectedAnswerIndex === index && index !== currentCorrectOptionIndex;

                return (
                  <GameButton
                    key={index}
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
              <div className="space-y-4 rounded-2xl border border-[#252940] bg-[#0f1117]/82 p-4 md:p-5">
                <p className="text-base font-semibold text-[#e4e4e9] md:text-2xl">
                  {selectedAnswerIndex === null
                    ? `${currentPlayerName} ran out of time.`
                    : selectedAnswerIndex === currentCorrectOptionIndex
                      ? `${currentPlayerName} is correct!`
                      : `${currentPlayerName} is incorrect.`}
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
                    ref={nextTurnButtonRef}
                    centered
                    className={cn(
                      "min-h-12 max-w-sm text-sm md:min-h-16 md:text-xl",
                      compactLayout && "md:min-h-14 md:text-base",
                    )}
                    onClick={moveToNextTurn}
                  >
                    {currentQuestionIndex + 1 >= totalQuestions ? "Show Leaderboard" : "Next Turn"}
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

        <section className="space-y-4 rounded-3xl border border-[#252940] bg-[#1a1d2e] p-5 md:p-7">
          <h3 className="text-2xl font-bold text-[#e4e4e9] md:text-3xl">Live Scoreboard</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {playerNames.map((name, index) => {
              const playerAnswers = results.filter((result) => result.playerIndex === index);
              const latestAnswer = playerAnswers[playerAnswers.length - 1];

              return (
                <div
                  key={`${name}-${index}`}
                  className={cn(
                    "space-y-3 rounded-2xl border bg-[#0f1117]/72 p-5",
                    index === currentPlayerIndex && phase === "question"
                      ? "border-[#818cf8]/55"
                      : "border-[#252940]",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-2xl font-bold text-[#e4e4e9] md:text-3xl">{name}</p>
                    <p className="text-4xl font-black text-emerald-300">{scores[index] ?? 0}</p>
                  </div>
                  <p className="text-base text-[#9394a5] md:text-lg">
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
                        <span className="inline-flex items-center gap-1 text-base text-emerald-300 md:text-lg">
                          <CheckCircle2 className="size-5" />
                          Last: Correct
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-base text-rose-300 md:text-lg">
                          <XCircle className="size-5" />
                          Last: Incorrect
                        </span>
                      )
                    ) : (
                      <span className="text-base text-[#6b6d7e] md:text-lg">No answers yet</span>
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
