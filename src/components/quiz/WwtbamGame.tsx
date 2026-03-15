"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, House, LoaderCircle, Square, ThumbsDown, ThumbsUp, User, Volume2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { CircularButton } from "@/components/quiz/CircularButton";
import { GameButton } from "@/components/quiz/GameButton";
import { LoadingScreen } from "@/components/quiz/LoadingScreen";
import { QuizPlayHeader } from "@/components/quiz/QuizPlayHeader";
import { SlantedBar } from "@/components/quiz/SlantedBar";
import { Switch } from "@/components/ui/switch";
import { useCompactQuizLayout, useTvLikeQuizLayout } from "@/hooks/useCompactQuizLayout";
import { useReadAloudPreference } from "@/hooks/use-read-aloud-preference";
import { authClient } from "@/lib/auth-client";
import { buildQuizPlayPath, type MyQuizzesRandomContext } from "@/lib/my-quizzes-random";
import {
  getNextQuizIdForPlayback,
  setMyQuizzesRandomPlaybackContext,
} from "@/lib/my-quizzes-random-client";
import { rememberRecentQuiz } from "@/lib/recent-quiz-history";
import { focusRemoteControl } from "@/lib/remote-focus";
import {
  CHECKPOINTS,
  formatMoney,
  MONEY_LADDER,
  QUESTION_LENGTH_SECONDS,
} from "@/lib/quiz-constants";
import type {
  PlayableQuestion,
  QuizWithQuestions,
  SaveQuizSessionPayload,
} from "@/lib/quiz-types";
import { cn } from "@/lib/utils";
import {
  buildCheckpointReachedScript,
  buildCorrectRevealScript,
  buildFinalLockScript,
  buildFiftyFiftyScript,
  buildQuestionIntroScript,
  buildTimeoutScript,
  buildWelcomeScript,
  buildWrongRevealScript,
} from "@/lib/wwtbam-host";
import {
  buildStoredAskHostScript,
  hasStoredWwtbamHostHint,
} from "@/lib/wwtbam-host-hints";

type FocusControlId =
  | "header-quit"
  | "header-next"
  | `answer-${number}`
  | "final"
  | "cashout"
  | "lifeline-5050"
  | "lifeline-ask-host"
  | "gameover-like"
  | "gameover-dislike"
  | "gameover-play-next"
  | "gameover-play-again";

type WwtbamGameProps = {
  quiz: QuizWithQuestions;
  playContext?: MyQuizzesRandomContext | null;
};

type NarrationResult = "completed" | "skipped" | "interrupted";
type HostNarrationStage =
  | "welcome"
  | "question-intro"
  | "question-options"
  | "final-lock"
  | "result"
  | "timeout"
  | "manual"
  | "idle";

type WwtbamSfxKey =
  | "select"
  | "final-answer-lock"
  | "host-bed"
  | "correct-answer"
  | "wrong-answer"
  | "reveal-hit"
  | "checkpoint";

const REVEAL_FEEDBACK_MIN_MS = 1500;
const FINAL_LOCK_SUSPENSE_MIN_MS = 1000;
const MAX_HOST_SPEECH_INPUT_CHARS = 3800;
const WWTBAM_SFX_URLS: Record<WwtbamSfxKey, string> = {
  select: "/audio/elevenlabs/select.wav",
  "final-answer-lock": "/audio/elevenlabs/final-answer-lock.wav",
  "host-bed": "/audio/elevenlabs/host-bed.wav",
  "correct-answer": "/audio/elevenlabs/correct-answer.wav",
  "wrong-answer": "/audio/elevenlabs/wrong-answer.wav",
  "reveal-hit": "/audio/elevenlabs/reveal-hit.wav",
  checkpoint: "/audio/elevenlabs/checkpoint.wav",
};
const WWTBAM_SFX_VOLUMES: Record<WwtbamSfxKey, number> = {
  select: 0.45,
  "final-answer-lock": 0.72,
  "host-bed": 0.14,
  "correct-answer": 0.6,
  "wrong-answer": 0.62,
  "reveal-hit": 0.55,
  checkpoint: 0.68,
};

type VoteType = "like" | "dislike";

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function computeLikeRatioLabel(likes: number, dislikes: number) {
  const total = likes + dislikes;
  if (total === 0) return "Be the first to rate this quiz";
  return `${Math.round((likes / total) * 100)}% likes`;
}

function buildHostAudioUrl(text: string, ttsFingerprint?: string) {
  const params = new URLSearchParams({
    text,
  });

  if (ttsFingerprint) {
    params.set("tts", ttsFingerprint);
  }

  return `/api/quiz/host/audio?${params.toString()}`;
}

function normalizeHostSpeechText(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_HOST_SPEECH_INPUT_CHARS);
}

function buildQuestionAudioUrl(params: {
  quizId: string;
  questionId: string;
  position: number;
  includeQuestionNumber?: boolean;
  ttsFingerprint?: string;
}) {
  const search = new URLSearchParams({
    segment: "question",
    position: params.position.toString(),
  });

  if (params.includeQuestionNumber === false) {
    search.set("includeQuestionNumber", "false");
  }

  if (params.ttsFingerprint) {
    search.set("tts", params.ttsFingerprint);
  }

  return `/api/quiz/${params.quizId}/questions/${params.questionId}/tts?${search.toString()}`;
}

function buildOptionsAudioUrl(params: {
  quizId: string;
  questionId: string;
  position: number;
  options: string[];
  ttsFingerprint?: string;
}) {
  const search = new URLSearchParams({
    segment: "options",
    position: params.position.toString(),
  });

  for (const option of params.options) {
    search.append("option", option);
  }

  if (params.ttsFingerprint) {
    search.set("tts", params.ttsFingerprint);
  }

  return `/api/quiz/${params.quizId}/questions/${params.questionId}/tts?${search.toString()}`;
}

function toHostNarrationErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "This browser blocked audio autoplay. Tap Read aloud to start narration manually.";
  }

  if (error instanceof Error && error.message) {
    const message = error.message.trim();
    const lowerMessage = message.toLowerCase();

    if (
      lowerMessage.includes("notallowederror") ||
      lowerMessage.includes("not allowed by the user agent") ||
      lowerMessage.includes("user denied permission")
    ) {
      return "This browser blocked audio autoplay. Tap Read aloud to start narration manually.";
    }

    return message;
  }

  return "Read aloud is unavailable right now.";
}

export function WwtbamGame({ quiz, playContext = null }: WwtbamGameProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const compactLayout = useCompactQuizLayout();
  const tvLikeLayout = useTvLikeQuizLayout();
  const retryToken = searchParams.get("retry") ?? "";
  const homePath = playContext ? "/dashboard" : "/";

  const [isLoading, setIsLoading] = useState(true);

  const [selectedAnswerIndex, setSelectedAnswerIndex] = useState<number | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [finalAnswerLocked, setFinalAnswerLocked] = useState(false);
  const [visibleOptions, setVisibleOptions] = useState(0);
  const [optionsDisabled, setOptionsDisabled] = useState(true);
  const [eliminatedOptions, setEliminatedOptions] = useState<number[]>([]);
  const [revealedAnswer, setRevealedAnswer] = useState(false);
  const [correctAnswerIndex, setCorrectAnswerIndex] = useState<number | null>(null);
  const [askHostAdvice, setAskHostAdvice] = useState<string | null>(null);
  const [isAskHostThinking, setIsAskHostThinking] = useState(false);
  const [isHostNarrating, setIsHostNarrating] = useState(false);
  const [hostNarrationStage, setHostNarrationStage] = useState<HostNarrationStage>("idle");
  const [hostNarrationError, setHostNarrationError] = useState<string | null>(null);

  const [usedLifelines, setUsedLifelines] = useState({
    fiftyFifty: false,
    askHost: false,
  });

  const [remainingTime, setRemainingTime] = useState<number | null>(null);
  const [totalTime, setTotalTime] = useState<number | null>(null);

  const [gameOver, setGameOver] = useState(false);
  const [wonAmount, setWonAmount] = useState(0);
  const [isLoadingNextQuiz, setIsLoadingNextQuiz] = useState(false);
  const [likes, setLikes] = useState(quiz.likes);
  const [dislikes, setDislikes] = useState(quiz.dislikes);
  const [vote, setVote] = useState<VoteType | null>(quiz.currentVote ?? null);
  const [isVoting, setIsVoting] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);
  const nextButtonLabel = playContext ? "Next Random" : "Play Next";
  const nextHeaderLabel = playContext
    ? (isLoadingNextQuiz ? "Loading next random" : "Next Random")
    : (isLoadingNextQuiz ? "Loading next quiz" : "Next quiz");

  const [focusedControl, setFocusedControl] = useState<FocusControlId | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const focusControlRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const countdownStartedRef = useRef(false);
  const startedAtRef = useRef<Date>(new Date());
  const questionStartedAtRef = useRef<number>(Date.now());
  const answeredQuestionIdsRef = useRef(new Set<string>());
  const pendingAnswersRef = useRef<SaveQuizSessionPayload["answers"]>([]);
  const hasPersistedSessionRef = useRef(false);
  const isAdvancingRef = useRef(false);
  const questionFlowRunIdRef = useRef(0);
  const askHostRequestIdRef = useRef(0);
  const timerPausedAtRef = useRef<number | null>(null);
  const revealedAnswerRef = useRef(false);
  const questionViewportAnchorRef = useRef<HTMLDivElement | null>(null);
  const hostAudioRef = useRef<HTMLAudioElement | null>(null);
  const hostBedAudioRef = useRef<HTMLAudioElement | null>(null);
  const hostAudioPlaybackResolverRef = useRef<((played: boolean) => void) | null>(null);
  const hostNarrationRunIdRef = useRef(0);
  const hostNarrationSkipRequestedRef = useRef(false);
  const prefetchedHostAudioUrlsRef = useRef(new Set<string>());
  const preloadedSfxAudioRefs = useRef<Partial<Record<WwtbamSfxKey, HTMLAudioElement>>>({});
  const activeSfxAudioRef = useRef(new Set<HTMLAudioElement>());
  const readAloudEnabledRef = useRef(false);
  const hasStartedIntroRef = useRef(false);

  const { data: sessionData, isPending: isSessionPending } = authClient.useSession();
  const sessionUser = sessionData?.user as
    | {
        id?: string;
        readAloudEnabled?: boolean;
      }
    | undefined;

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

  const questions = quiz.questions;
  const currentQuestion = questions[currentQuestionIndex];
  const ttsFingerprint = quiz.ttsFingerprint?.trim() ?? "";
  const hasStoredAskHostHint = Boolean(
    currentQuestion &&
      hasStoredWwtbamHostHint(currentQuestion) &&
      typeof currentQuestion.hostHintDisplayedOptionIndex === "number",
  );
  const canUseAskHost = hasStoredAskHostHint;

  const ensureHostBedAudio = useCallback(() => {
    if (typeof window === "undefined") {
      return null;
    }

    const existing = hostBedAudioRef.current;
    if (existing) {
      return existing;
    }

    const audio = new Audio(WWTBAM_SFX_URLS["host-bed"]);
    audio.preload = "auto";
    audio.loop = true;
    audio.volume = WWTBAM_SFX_VOLUMES["host-bed"];
    hostBedAudioRef.current = audio;
    return audio;
  }, []);

  const stopHostBed = useCallback(() => {
    const audio = hostBedAudioRef.current;
    if (!audio) return;

    audio.pause();
    audio.currentTime = 0;
  }, []);

  const playHostBed = useCallback(async () => {
    const audio = ensureHostBedAudio();
    if (!audio) return;

    if (!audio.paused) {
      return;
    }

    try {
      audio.currentTime = 0;
      await audio.play();
    } catch {
      // Host bed is optional. Ignore autoplay or playback failures.
    }
  }, [ensureHostBedAudio]);

  const preloadWwtbamSfx = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    for (const [key, url] of Object.entries(WWTBAM_SFX_URLS) as Array<[WwtbamSfxKey, string]>) {
      if (key === "host-bed") {
        const audio = ensureHostBedAudio();
        audio?.load();
        continue;
      }

      if (preloadedSfxAudioRefs.current[key]) {
        continue;
      }

      const audio = new Audio(url);
      audio.preload = "auto";
      audio.volume = WWTBAM_SFX_VOLUMES[key];
      audio.load();
      preloadedSfxAudioRefs.current[key] = audio;
    }
  }, [ensureHostBedAudio]);

  const playSfx = useCallback(async (key: WwtbamSfxKey) => {
    if (typeof window === "undefined" || key === "host-bed") {
      return false;
    }

    const baseAudio = preloadedSfxAudioRefs.current[key];
    const audio = baseAudio ? (baseAudio.cloneNode(true) as HTMLAudioElement) : new Audio(WWTBAM_SFX_URLS[key]);
    audio.preload = "auto";
    audio.volume = WWTBAM_SFX_VOLUMES[key];
    activeSfxAudioRef.current.add(audio);

    const cleanup = () => {
      audio.onended = null;
      audio.onerror = null;
      activeSfxAudioRef.current.delete(audio);
    };

    audio.onended = cleanup;
    audio.onerror = cleanup;

    try {
      await audio.play();
      return true;
    } catch {
      cleanup();
      return false;
    }
  }, []);

  const stopHostNarration = useCallback(() => {
    hostNarrationRunIdRef.current += 1;
    stopHostBed();

    const audio = hostAudioRef.current;
    if (!audio) {
      setIsHostNarrating(false);
      setHostNarrationStage("idle");
      return;
    }

    audio.pause();
    audio.currentTime = 0;
    audio.onended = null;
    audio.onerror = null;
    const resolvePlayback = hostAudioPlaybackResolverRef.current;
    hostAudioPlaybackResolverRef.current = null;
    hostAudioRef.current = null;
    setIsHostNarrating(false);
    setHostNarrationStage("idle");
    resolvePlayback?.(false);
  }, [stopHostBed]);

  const skipHostNarration = useCallback(() => {
    hostNarrationSkipRequestedRef.current = true;
    stopHostNarration();
  }, [stopHostNarration]);

  const prefetchHostAudioUrls = useCallback((urls: string[]) => {
    if (typeof window === "undefined") return;

    const uniqueUrls = [...new Set(urls)];

    for (const url of uniqueUrls) {
      if (prefetchedHostAudioUrlsRef.current.has(url)) continue;

      void fetch(url, {
        method: "GET",
        cache: "force-cache",
      })
        .then(async (response) => {
          if (!response.ok) return;
          await response.blob();
          prefetchedHostAudioUrlsRef.current.add(url);
        })
        .catch(() => {
          // Ignore prefetch misses and fall back to live playback.
        });
    }
  }, []);

  const playHostNarration = useCallback(
    async (
      urls: string[],
      stage: HostNarrationStage = "manual",
      options?: { withHostBed?: boolean },
    ): Promise<NarrationResult> => {
      if (typeof window === "undefined" || urls.length === 0) {
        return "skipped";
      }

      setHostNarrationError(null);
      hostNarrationSkipRequestedRef.current = false;
      stopHostNarration();
      const runId = hostNarrationRunIdRef.current;
      const withHostBed = options?.withHostBed ?? true;
      prefetchHostAudioUrls(urls);
      setHostNarrationStage(stage);
      if (withHostBed) {
        void playHostBed();
      }

      try {
        for (const url of urls) {
          if (runId !== hostNarrationRunIdRef.current) {
            const wasSkipped = hostNarrationSkipRequestedRef.current;
            hostNarrationSkipRequestedRef.current = false;
            return wasSkipped ? "skipped" : "interrupted";
          }

          const audio = new Audio(url);
          audio.preload = "auto";
          hostAudioRef.current = audio;
          setIsHostNarrating(true);

          const played = await new Promise<boolean>((resolve, reject) => {
            hostAudioPlaybackResolverRef.current = resolve;
            audio.onended = () => {
              hostAudioPlaybackResolverRef.current = null;
              resolve(true);
            };
            audio.onerror = () => {
              hostAudioPlaybackResolverRef.current = null;
              reject(new Error("Could not play narration audio."));
            };
            audio
              .play()
              .then(() => {
                if (runId !== hostNarrationRunIdRef.current) {
                  audio.pause();
                  audio.currentTime = 0;
                  hostAudioPlaybackResolverRef.current = null;
                  resolve(false);
                }
              })
              .catch((error) => {
                hostAudioPlaybackResolverRef.current = null;
                reject(error);
              });
          });

          audio.onended = null;
          audio.onerror = null;

          if (hostAudioRef.current === audio) {
            hostAudioRef.current = null;
          }

          if (runId !== hostNarrationRunIdRef.current) {
            const wasSkipped = hostNarrationSkipRequestedRef.current;
            hostNarrationSkipRequestedRef.current = false;
            return wasSkipped ? "skipped" : "interrupted";
          }

          if (!played) {
            return "skipped";
          }
        }

        return "completed";
      } finally {
        if (withHostBed) {
          stopHostBed();
        }
        setIsHostNarrating(false);
        setHostNarrationStage("idle");
      }
    },
    [playHostBed, prefetchHostAudioUrls, stopHostBed, stopHostNarration],
  );

  const playOptionalHostNarration = useCallback(
    async (
      urls: string[],
      stage: HostNarrationStage,
      options?: { withHostBed?: boolean },
    ): Promise<NarrationResult> => {
      if (!readAloudEnabledRef.current) {
        return "skipped";
      }

      try {
        return await playHostNarration(urls, stage, options);
      } catch (error) {
        setHostNarrationError(toHostNarrationErrorMessage(error));
        setIsHostNarrating(false);
        setHostNarrationStage("idle");
        return "skipped";
      }
    },
    [playHostNarration],
  );

  const selectAnswer = useCallback(
    (index: number) => {
      if (optionsDisabled || revealedAnswer) {
        return;
      }

      if (visibleOptions < index + 1 || eliminatedOptions.includes(index)) {
        return;
      }

      setSelectedAnswerIndex((previous) => {
        if (previous !== index) {
          void playSfx("select");
        }

        return index;
      });
    },
    [eliminatedOptions, optionsDisabled, playSfx, revealedAnswer, visibleOptions],
  );

  const playCheckpointBeat = useCallback(async () => {
    if (!currentQuestion) {
      return "skipped" as const;
    }

    void playSfx("checkpoint");

    const checkpointText = buildCheckpointReachedScript({
      moneyValue: MONEY_LADDER[currentQuestionIndex] ?? 0,
      seed: `${quiz.id}:${currentQuestion.id}:checkpoint`,
    });

    return playOptionalHostNarration([buildHostAudioUrl(checkpointText, ttsFingerprint)], "result");
  }, [currentQuestion, currentQuestionIndex, playOptionalHostNarration, playSfx, quiz.id, ttsFingerprint]);

  const resumeQuestionBed = useCallback(() => {
    if (!currentQuestion) return;
    if (revealedAnswerRef.current || gameOver || finalAnswerLocked) return;
    if (!countdownStartedRef.current || (remainingTime ?? 0) <= 0) return;

    void playHostBed();
  }, [currentQuestion, finalAnswerLocked, gameOver, playHostBed, remainingTime]);

  const availableAnswerIndexes = useMemo(() => {
    if (optionsDisabled) return [];

    return [0, 1, 2, 3].filter(
      (index) => visibleOptions >= index + 1 && !eliminatedOptions.includes(index),
    );
  }, [eliminatedOptions, optionsDisabled, visibleOptions]);

  const focusRows = useMemo<FocusControlId[][]>(() => {
    if (gameOver) {
      return [
        ["header-quit", "header-next"],
        ["gameover-like", "gameover-dislike"],
        ["gameover-play-next", "gameover-play-again"],
      ];
    }

    const rows: FocusControlId[][] = [["header-quit", "header-next"]];

    if (availableAnswerIndexes.length > 0 && selectedAnswerIndex === null && !revealedAnswer) {
      const topRow = [0, 1]
        .filter((index) => availableAnswerIndexes.includes(index))
        .map((index) => `answer-${index}` as const);
      const bottomRow = [2, 3]
        .filter((index) => availableAnswerIndexes.includes(index))
        .map((index) => `answer-${index}` as const);

      if (topRow.length > 0) rows.push(topRow);
      if (bottomRow.length > 0) rows.push(bottomRow);
    }

    if (selectedAnswerIndex !== null && !revealedAnswer) {
      rows.push(["final"]);
    }

    if (!revealedAnswer && selectedAnswerIndex === null && currentQuestionIndex > 0) {
      rows.push(["cashout"]);
    }

    if (!revealedAnswer) {
      const lifelineRow: FocusControlId[] = [];
      if (!usedLifelines.fiftyFifty && !optionsDisabled) lifelineRow.push("lifeline-5050");
      if (!usedLifelines.askHost && !optionsDisabled) lifelineRow.push("lifeline-ask-host");
      if (lifelineRow.length > 0) rows.push(lifelineRow);
    }

    return rows;
  }, [
    availableAnswerIndexes,
    currentQuestionIndex,
    gameOver,
    optionsDisabled,
    revealedAnswer,
    selectedAnswerIndex,
    usedLifelines.askHost,
    usedLifelines.fiftyFifty,
  ]);

  const focusOrder = useMemo<FocusControlId[]>(() => focusRows.flat(), [focusRows]);

  useEffect(() => {
    rememberRecentQuiz("wwtbam", quiz.id);
  }, [quiz.id]);

  useEffect(() => {
    readAloudEnabledRef.current = readAloudEnabled;
  }, [readAloudEnabled]);

  useEffect(() => {
    preloadWwtbamSfx();
  }, [preloadWwtbamSfx]);

  useEffect(() => {
    let cancelled = false;
    const activeSfxAudioSet = activeSfxAudioRef.current;

    async function initializeGame() {
      setIsLoading(true);
      setCurrentQuestionIndex(0);
      setSelectedAnswerIndex(null);
      setFinalAnswerLocked(false);
      setVisibleOptions(4);
      setOptionsDisabled(true);
      setEliminatedOptions([]);
      setRevealedAnswer(false);
      revealedAnswerRef.current = false;
      setCorrectAnswerIndex(null);
      setAskHostAdvice(null);
      setIsAskHostThinking(false);
      setHostNarrationError(null);
      stopHostNarration();
      setUsedLifelines({ fiftyFifty: false, askHost: false });
      setGameOver(false);
      setWonAmount(0);
      pendingAnswersRef.current = [];
      answeredQuestionIdsRef.current = new Set();
      hasPersistedSessionRef.current = false;
      isAdvancingRef.current = false;
      hasStartedIntroRef.current = false;
      questionFlowRunIdRef.current = 0;
      askHostRequestIdRef.current += 1;
      startedAtRef.current = new Date();

      if (!cancelled) {
        setIsLoading(false);
        if (readAloudPreferenceReady) {
          hasStartedIntroRef.current = true;
          void welcomePlayer(quiz);
        }
      }
    }

    void initializeGame();

    return () => {
      cancelled = true;
      questionFlowRunIdRef.current += 1;
      askHostRequestIdRef.current += 1;
      timerPausedAtRef.current = null;
      if (timerRef.current) clearInterval(timerRef.current);
      stopHostNarration();
      stopHostBed();
      for (const audio of activeSfxAudioSet) {
        audio.pause();
        audio.currentTime = 0;
      }
      activeSfxAudioSet.clear();
    };
    // Game setup should rerun only when the quiz changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiz.id, readAloudPreferenceReady, retryToken, stopHostBed, stopHostNarration]);

  useEffect(() => {
    if (isLoading || hasStartedIntroRef.current || !readAloudPreferenceReady) {
      return;
    }

    hasStartedIntroRef.current = true;
    void welcomePlayer(quiz);
    // Intentionally bound to the active quiz boot lifecycle rather than function identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, quiz.id, readAloudPreferenceReady, retryToken]);

  useEffect(() => {
    if (!focusOrder.length) {
      setFocusedControl(null);
      return;
    }

    if (focusedControl && !focusOrder.includes(focusedControl)) {
      setFocusedControl(null);
    }
  }, [focusOrder, focusedControl]);

  const registerFocusControlRef = useCallback(
    (controlId: FocusControlId) => (node: HTMLButtonElement | null) => {
      focusControlRefs.current[controlId] = node;
    },
    [],
  );

  useEffect(() => {
    if (!focusedControl) return;

    const node = focusControlRefs.current[focusedControl];
    if (!node) return;

    const frame = window.requestAnimationFrame(() => {
      focusRemoteControl(node);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [focusedControl]);

  useEffect(() => {
    if (isLoading) return;

    function onKeyDown(event: KeyboardEvent) {
      if (!focusOrder.length) return;

      const key = event.key;
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter"].includes(key)) {
        return;
      }

      event.preventDefault();

      if (key === "Enter") {
        if (focusedControl) triggerControl(focusedControl);
        return;
      }

      const currentIndex = focusOrder.findIndex((id) => id === focusedControl);
      if (currentIndex === -1) {
        setFocusedControl(
          key === "ArrowLeft" || key === "ArrowUp"
            ? focusOrder[focusOrder.length - 1]
            : focusOrder[0],
        );
        return;
      }

      const currentRowIndex = focusRows.findIndex((row) => row.includes(focusedControl as FocusControlId));
      const currentRow = currentRowIndex >= 0 ? focusRows[currentRowIndex] : null;
      const currentColumnIndex = currentRow ? currentRow.findIndex((id) => id === focusedControl) : -1;

      if (!currentRow || currentColumnIndex === -1) {
        return;
      }

      if (key === "ArrowLeft" || key === "ArrowRight") {
        const delta = key === "ArrowLeft" ? -1 : 1;
        const nextColumnIndex =
          (currentColumnIndex + delta + currentRow.length) % currentRow.length;
        setFocusedControl(currentRow[nextColumnIndex] ?? null);
        return;
      }

      const rowDelta = key === "ArrowUp" ? -1 : 1;
      const nextRowIndex =
        (currentRowIndex + rowDelta + focusRows.length) % focusRows.length;
      const nextRow = focusRows[nextRowIndex];

      if (!nextRow || nextRow.length === 0) {
        return;
      }

      const nextColumnIndex = Math.min(currentColumnIndex, nextRow.length - 1);
      setFocusedControl(nextRow[nextColumnIndex] ?? nextRow[0] ?? null);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // Keyboard handler intentionally depends on current visible control state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusOrder, focusRows, focusedControl, isLoading]);

  useEffect(() => {
    if (isLoading || gameOver || visibleOptions < 4 || optionsDisabled) return;
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
  }, [currentQuestionIndex, gameOver, isLoading, optionsDisabled, visibleOptions]);

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function runCountdownInterval() {
    stopTimer();

    timerRef.current = setInterval(() => {
      setRemainingTime((previous) => {
        const next = (previous ?? 0) - 1;

        if (next <= 0) {
          stopTimer();
          void handleTimeOut();
          return 0;
        }

        return next;
      });
    }, 1000);
  }

  function pauseCountdown() {
    if (!countdownStartedRef.current || timerRef.current === null) {
      return false;
    }

    timerPausedAtRef.current = Date.now();
    stopTimer();
    return true;
  }

  function resumeCountdown() {
    if (!countdownStartedRef.current || timerRef.current !== null) {
      return;
    }

    if (revealedAnswerRef.current || finalAnswerLocked || gameOver) {
      timerPausedAtRef.current = null;
      return;
    }

    if ((remainingTime ?? 0) <= 0) {
      timerPausedAtRef.current = null;
      return;
    }

    if (timerPausedAtRef.current !== null) {
      questionStartedAtRef.current += Date.now() - timerPausedAtRef.current;
      timerPausedAtRef.current = null;
    }

    runCountdownInterval();
  }

  function startCountdown(seconds: number) {
    if (countdownStartedRef.current) return;

    countdownStartedRef.current = true;
    questionStartedAtRef.current = Date.now();
    setTotalTime(seconds);
    setRemainingTime(seconds);
    timerPausedAtRef.current = null;

    runCountdownInterval();
  }

  async function welcomePlayer(loadedQuiz: QuizWithQuestions) {
    const playerName = sessionData?.user?.name ?? "Contestant";
    const welcomeText = buildWelcomeScript({
      contestantName: playerName,
      seed: `${loadedQuiz.id}:welcome:${playerName}`,
    });
    const narrationResult = await playOptionalHostNarration(
      [buildHostAudioUrl(welcomeText, ttsFingerprint)],
      "welcome",
    );

    if (narrationResult === "interrupted") {
      return;
    }

    await beginQuestion(loadedQuiz.questions, 0);
  }

  async function beginQuestion(questionSet: PlayableQuestion[], index: number) {
    const question = questionSet[index];
    if (!question) return;
    const flowRunId = questionFlowRunIdRef.current + 1;
    questionFlowRunIdRef.current = flowRunId;

    countdownStartedRef.current = false;
    timerPausedAtRef.current = null;
    stopTimer();
    stopHostNarration();
    setSelectedAnswerIndex(null);
    setFinalAnswerLocked(false);
    setOptionsDisabled(true);
    setVisibleOptions(4);
    setEliminatedOptions([]);
    setRevealedAnswer(false);
    revealedAnswerRef.current = false;
    setCorrectAnswerIndex(null);
    setAskHostAdvice(null);
    setIsAskHostThinking(false);
    askHostRequestIdRef.current += 1;

    const introText = buildQuestionIntroScript({
      questionNumber: index + 1,
      moneyValue: MONEY_LADDER[index] ?? 0,
      seed: `${quiz.id}:${question.id}:intro`,
    });
    const introNarrationResult = await playOptionalHostNarration([
      buildHostAudioUrl(introText, ttsFingerprint),
      buildQuestionAudioUrl({
        quizId: quiz.id,
        questionId: question.id,
        position: index + 1,
        includeQuestionNumber: false,
        ttsFingerprint,
      }),
    ], "question-intro");

    if (
      introNarrationResult === "interrupted" &&
      questionFlowRunIdRef.current !== flowRunId
    ) {
      return;
    }

    if (questionFlowRunIdRef.current !== flowRunId) {
      return;
    }

    setOptionsDisabled(false);

    const optionsNarrationResult = await playOptionalHostNarration([
      buildOptionsAudioUrl({
        quizId: quiz.id,
        questionId: question.id,
        position: index + 1,
        options: question.options.map((option) => option.text),
        ttsFingerprint,
      }),
    ], "question-options");

    if (
      optionsNarrationResult === "interrupted" &&
      questionFlowRunIdRef.current !== flowRunId
    ) {
      return;
    }

    if (questionFlowRunIdRef.current !== flowRunId) {
      return;
    }

    startCountdown(QUESTION_LENGTH_SECONDS);
    resumeQuestionBed();
  }

  function trackCurrentAnswer(selectedIndex: number | null) {
    if (!currentQuestion) return;
    if (answeredQuestionIdsRef.current.has(currentQuestion.id)) return;

    const isCorrect = selectedIndex === currentQuestion.correctOptionIndex;
    const elapsed = Math.max(0, Date.now() - questionStartedAtRef.current);

    pendingAnswersRef.current.push({
      questionId: currentQuestion.id,
      selectedOptionIndex: selectedIndex,
      isCorrect,
      timeTakenMs: elapsed,
      createdAt: new Date().toISOString(),
    });
    answeredQuestionIdsRef.current.add(currentQuestion.id);
  }

  function revealAnswer(resolvedAnswerIndex: number | null = selectedAnswerIndex) {
    if (!currentQuestion || revealedAnswerRef.current) return false;

    stopTimer();
    stopHostBed();
    setOptionsDisabled(true);
    setSelectedAnswerIndex(resolvedAnswerIndex);
    revealedAnswerRef.current = true;
    setRevealedAnswer(true);
    setCorrectAnswerIndex(currentQuestion.correctOptionIndex);
    trackCurrentAnswer(resolvedAnswerIndex);

    return resolvedAnswerIndex === currentQuestion.correctOptionIndex;
  }

  async function handleTimeOut() {
    if (!currentQuestion || revealedAnswer) return;

    setOptionsDisabled(true);
    setFinalAnswerLocked(true);
    setSelectedAnswerIndex(null);
    stopTimer();

    const narrationResult = await playOptionalHostNarration([
      buildHostAudioUrl(buildTimeoutScript(`${quiz.id}:${currentQuestion.id}:timeout`), ttsFingerprint),
    ], "timeout", { withHostBed: false });

    if (narrationResult === "interrupted") {
      return;
    }

    void playSfx("reveal-hit");
    revealAnswer(null);
    void playSfx("wrong-answer");
    await wait(REVEAL_FEEDBACK_MIN_MS);
    await handleNextQuestion(false);
  }

  async function handleFiftyFifty() {
    if (!currentQuestion || usedLifelines.fiftyFifty) return;

    setUsedLifelines((previous) => ({ ...previous, fiftyFifty: true }));

    const correct = currentQuestion.correctOptionIndex;
    const incorrect = [0, 1, 2, 3].filter((idx) => idx !== correct);
    const shuffled = [...incorrect].sort(() => Math.random() - 0.5);
    const toEliminate = shuffled.slice(0, 2);

    setEliminatedOptions(toEliminate);

    const remaining = [0, 1, 2, 3]
      .filter((idx) => !toEliminate.includes(idx))
      .map((idx) => `${String.fromCharCode(65 + idx)}: ${currentQuestion.options[idx]?.text ?? ""}`);
    void playOptionalHostNarration(
      [
        buildHostAudioUrl(
          buildFiftyFiftyScript(`${quiz.id}:${currentQuestion.id}:5050:${remaining.join("|")}`),
          ttsFingerprint,
        ),
      ],
      "manual",
    ).finally(() => {
      resumeQuestionBed();
    });
  }

  async function handleAskHost() {
    if (!currentQuestion || usedLifelines.askHost || !canUseAskHost) return;

    setUsedLifelines((previous) => ({ ...previous, askHost: true }));
    setIsAskHostThinking(true);
    const requestId = askHostRequestIdRef.current + 1;
    askHostRequestIdRef.current = requestId;
    const didPauseCountdown = pauseCountdown();
    const hostAdviceText =
      hasStoredWwtbamHostHint(currentQuestion) &&
      typeof currentQuestion.hostHintDisplayedOptionIndex === "number"
        ? buildStoredAskHostScript({
            displayedOptionIndex: currentQuestion.hostHintDisplayedOptionIndex,
            reasoning: currentQuestion.hostHintReasoning ?? "",
          })
        : null;

    if (!hostAdviceText) {
      if (askHostRequestIdRef.current === requestId) {
        setIsAskHostThinking(false);
        if (didPauseCountdown) {
          resumeCountdown();
          resumeQuestionBed();
        }
      }
      return;
    }

    await wait(1000);

    if (askHostRequestIdRef.current !== requestId) {
      return;
    }

    const spokenAdviceText = normalizeHostSpeechText(hostAdviceText);
    setIsAskHostThinking(false);
    setAskHostAdvice(spokenAdviceText);
    void playOptionalHostNarration([buildHostAudioUrl(spokenAdviceText, ttsFingerprint)], "manual").finally(() => {
      if (askHostRequestIdRef.current === requestId) {
        if (didPauseCountdown) {
          resumeCountdown();
        }
        resumeQuestionBed();
      }
    });
  }

  async function confirmFinalAnswer() {
    if (!currentQuestion || selectedAnswerIndex === null || finalAnswerLocked) return;

    setFinalAnswerLocked(true);
    setOptionsDisabled(true);
    stopTimer();
    void playSfx("final-answer-lock");
    const minimumSuspenseDelay = wait(FINAL_LOCK_SUSPENSE_MIN_MS);

    const narrationResult = await playOptionalHostNarration([
      buildHostAudioUrl(
        buildFinalLockScript(`${quiz.id}:${currentQuestion.id}:lock:${selectedAnswerIndex}`),
        ttsFingerprint,
      ),
    ], "final-lock");

    if (narrationResult === "interrupted") {
      return;
    }

    await minimumSuspenseDelay;
    void playSfx("reveal-hit");
    const isCorrect = revealAnswer(selectedAnswerIndex);
    const minimumRevealDelay = wait(REVEAL_FEEDBACK_MIN_MS);

    void playSfx(isCorrect ? "correct-answer" : "wrong-answer");
    const resultText = isCorrect
      ? buildCorrectRevealScript({
          moneyValue: MONEY_LADDER[currentQuestionIndex] ?? 0,
          seed: `${quiz.id}:${currentQuestion.id}:correct`,
          includeMoney: !CHECKPOINTS.includes(
            currentQuestionIndex as (typeof CHECKPOINTS)[number],
          ),
        })
      : buildWrongRevealScript(`${quiz.id}:${currentQuestion.id}:wrong`);

    const resultNarrationResult = await playOptionalHostNarration(
      [buildHostAudioUrl(resultText, ttsFingerprint)],
      "result",
      { withHostBed: isCorrect },
    );

    if (resultNarrationResult === "interrupted") {
      return;
    }

    if (isCorrect && CHECKPOINTS.includes(currentQuestionIndex as (typeof CHECKPOINTS)[number])) {
      const checkpointNarrationResult = await playCheckpointBeat();
      if (checkpointNarrationResult === "interrupted") {
        return;
      }
    }

    await minimumRevealDelay;
    await handleNextQuestion(isCorrect);
  }

  async function persistSession(score: number) {
    if (hasPersistedSessionRef.current) return;

    hasPersistedSessionRef.current = true;

    const payload: SaveQuizSessionPayload = {
      quizId: quiz.id,
      gameMode: "wwtbam",
      score,
      startedAt: startedAtRef.current.toISOString(),
      finishedAt: new Date().toISOString(),
      answers: pendingAnswersRef.current,
    };

    try {
      await fetch("/api/quiz/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch {
      // Keep UX smooth even if persistence fails.
    }
  }

  async function endGame(finalAmount: number) {
    stopTimer();
    stopHostNarration();
    setWonAmount(finalAmount);
    setGameOver(true);
    await persistSession(finalAmount);
  }

  async function handleNextQuestion(resolvedCorrect?: boolean) {
    if (isAdvancingRef.current || !currentQuestion || !revealedAnswerRef.current) return;

    isAdvancingRef.current = true;
    try {
      const isCorrect = resolvedCorrect ?? selectedAnswerIndex === currentQuestion.correctOptionIndex;

      if (!isCorrect) {
        const lastCheckpoint = [...CHECKPOINTS].filter((checkpoint) => checkpoint < currentQuestionIndex).pop();
        const safeAmount = lastCheckpoint !== undefined ? MONEY_LADDER[lastCheckpoint] : 0;
        await endGame(safeAmount);
        return;
      }

      const nextIndex = currentQuestionIndex + 1;

      if (nextIndex >= questions.length) {
        await endGame(MONEY_LADDER[currentQuestionIndex]);
        return;
      }

      setCurrentQuestionIndex(nextIndex);
      await beginQuestion(questions, nextIndex);
    } finally {
      isAdvancingRef.current = false;
    }
  }

  function cashOut() {
    if (currentQuestionIndex <= 0) return;
    const amount = MONEY_LADDER[currentQuestionIndex - 1] ?? 0;
    void endGame(amount);
  }

  async function playCurrentPromptAloud() {
    if (!currentQuestion || revealedAnswer) {
      return;
    }

    setHostNarrationError(null);

    try {
      await playHostNarration(
        [
          buildQuestionAudioUrl({
            quizId: quiz.id,
            questionId: currentQuestion.id,
            position: currentQuestionIndex + 1,
            includeQuestionNumber: false,
            ttsFingerprint,
          }),
          buildOptionsAudioUrl({
            quizId: quiz.id,
            questionId: currentQuestion.id,
            position: currentQuestionIndex + 1,
            options: currentQuestion.options.map((option) => option.text),
            ttsFingerprint,
          }),
        ],
        "manual",
      );
      resumeQuestionBed();
    } catch (error) {
      setHostNarrationError(toHostNarrationErrorMessage(error));
    }
  }

  async function playRandomAgain() {
    if (isLoadingNextQuiz) return;

    setIsLoadingNextQuiz(true);
    try {
      const nextQuizId = await getNextQuizIdForPlayback({
        mode: "wwtbam",
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
  }

  function playAgain() {
    stopHostNarration();
    stopTimer();
    setMyQuizzesRandomPlaybackContext({
      quizId: quiz.id,
      playContext,
    });
    router.replace(
      buildQuizPlayPath({
        quizId: quiz.id,
        retryToken: Date.now(),
      }),
    );
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

  function triggerControl(controlId: FocusControlId) {
    if (controlId === "header-quit") {
      router.push(homePath);
      return;
    }

    if (controlId === "header-next") {
      void playRandomAgain();
      return;
    }

    if (controlId.startsWith("answer-")) {
      const idx = Number(controlId.replace("answer-", ""));
      if (!Number.isNaN(idx) && availableAnswerIndexes.includes(idx)) {
        selectAnswer(idx);
      }
      return;
    }

    if (controlId === "final") {
      void confirmFinalAnswer();
      return;
    }

    if (controlId === "cashout") {
      cashOut();
      return;
    }

    if (controlId === "lifeline-5050") {
      void handleFiftyFifty();
      return;
    }

    if (controlId === "lifeline-ask-host") {
      void handleAskHost();
      return;
    }

    if (controlId === "gameover-like") {
      void submitVote("like");
      return;
    }

    if (controlId === "gameover-dislike") {
      void submitVote("dislike");
      return;
    }

    if (controlId === "gameover-play-next") {
      void playRandomAgain();
      return;
    }

    if (controlId === "gameover-play-again") {
      playAgain();
    }
  }

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!currentQuestion) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0f1117] px-6 text-[#e4e4e9]">
        <div className="max-w-xl space-y-6 rounded-2xl border border-[#252940] bg-[#1a1d2e] p-8 text-center">
          <h1 className="text-3xl font-bold">Quiz unavailable</h1>
          <p className="text-lg text-[#9394a5]">Could not load this quiz.</p>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <CircularButton onClick={() => router.refresh()}>Retry</CircularButton>
            <CircularButton onClick={() => router.push(homePath)}>Home</CircularButton>
          </div>
        </div>
      </div>
    );
  }

  if (gameOver) {
    return (
      <div className="min-h-screen bg-[#0f1117] px-6 py-7 text-[#e4e4e9] md:px-10">
        <main className="mx-auto w-full max-w-6xl space-y-7">
          <QuizPlayHeader
            title={quiz.title}
            creatorName={quiz.creatorName}
            creatorImage={quiz.creatorImage}
            leftActionLabel="Quit"
            leftActionOnClick={() => router.push(homePath)}
            leftActionButtonRef={registerFocusControlRef("header-quit")}
            leftActionFocused={focusedControl === "header-quit"}
            leftActionIcon={<House className="size-5 md:size-6" />}
            rightActionLabel={nextHeaderLabel}
            rightActionOnClick={() => void playRandomAgain()}
            rightActionDisabled={isLoadingNextQuiz}
            rightActionButtonRef={registerFocusControlRef("header-next")}
            rightActionFocused={focusedControl === "header-next"}
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
              <div className="rounded-3xl border border-[#252940] bg-[#0f1117]/72 p-6 text-center md:p-8 xl:text-left">
                <p className="text-base font-semibold uppercase tracking-[0.28em] text-amber-300 md:text-lg">
                  Final Result
                </p>
                <h1 className="mt-4 text-[clamp(3.4rem,5vw,6rem)] leading-[0.92] font-black tracking-tight text-[#e4e4e9]">
                  {wonAmount > 0 ? "Round Complete" : "Game Over"}
                </h1>
                <p className="mt-5 text-[clamp(2.5rem,4.4vw,4.75rem)] leading-none font-black text-emerald-300">
                  {formatMoney(wonAmount)}
                </p>
                <p className="mt-4 text-2xl text-[#9394a5] md:text-3xl">
                  You leave the ladder with this amount secured.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-3xl border border-[#252940] bg-[#0f1117]/72 p-6">
                  <p className="text-base font-semibold text-[#9394a5] md:text-lg">
                    Questions Reached
                  </p>
                  <p className="mt-3 text-5xl font-black text-[#e4e4e9] md:text-6xl">
                    {currentQuestionIndex + 1}
                  </p>
                </div>
                <div className="rounded-3xl border border-[#252940] bg-[#0f1117]/72 p-6">
                  <p className="text-base font-semibold text-[#9394a5] md:text-lg">Status</p>
                  <p className="mt-3 text-3xl font-black text-amber-300 md:text-4xl">
                    {wonAmount > 0 ? "Cashed Out" : "Missed It"}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-5 rounded-3xl border border-[#252940] bg-[#0f1117]/72 p-6 md:col-span-2 md:p-7">
                <p className="text-3xl font-semibold text-[#e4e4e9] md:text-4xl">Rate this quiz</p>
                <div className="flex flex-wrap gap-3">
                  <GameButton
                    ref={registerFocusControlRef("gameover-like")}
                    centered
                    icon={<ThumbsUp size={20} />}
                    onClick={() => void submitVote("like")}
                    disabled={isVoting}
                    focused={focusedControl === "gameover-like"}
                    state={vote === "like" ? "selected" : "default"}
                    className="min-h-20 max-w-72 text-2xl md:text-3xl"
                  >
                    Like ({likes})
                  </GameButton>
                  <GameButton
                    ref={registerFocusControlRef("gameover-dislike")}
                    centered
                    icon={<ThumbsDown size={20} />}
                    onClick={() => void submitVote("dislike")}
                    disabled={isVoting}
                    focused={focusedControl === "gameover-dislike"}
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

              <GameButton
                ref={registerFocusControlRef("gameover-play-next")}
                centered
                disabled={isLoadingNextQuiz}
                focused={focusedControl === "gameover-play-next"}
                className="min-h-20 border-[#6c8aff]/45 bg-[#6c8aff]/18 text-2xl text-[#e4e4e9] md:text-3xl"
                onClick={() => void playRandomAgain()}
              >
                {isLoadingNextQuiz ? "Loading..." : nextButtonLabel}
              </GameButton>
              <GameButton
                ref={registerFocusControlRef("gameover-play-again")}
                centered
                focused={focusedControl === "gameover-play-again"}
                className="min-h-20 text-2xl md:text-3xl"
                onClick={playAgain}
              >
                Play Again
              </GameButton>
            </div>
          </section>
        </main>
      </div>
    );
  }

  const timerPercentage =
    remainingTime !== null && totalTime !== null && totalTime > 0
      ? (remainingTime / totalTime) * 100
      : 100;
  const moneyLadderDisplay = [...MONEY_LADDER.entries()].reverse();
  const readAloudError = readAloudPreferenceError ?? hostNarrationError;
  const showAskHostStatus = isAskHostThinking || Boolean(askHostAdvice);
  const showActionRow =
    (selectedAnswerIndex !== null && !revealedAnswer) ||
    (selectedAnswerIndex === null && !revealedAnswer && currentQuestionIndex > 0);
  const skipNarrationLabel =
    hostNarrationStage === "final-lock" || hostNarrationStage === "timeout"
        ? "Reveal now"
        : hostNarrationStage === "result"
          ? "Continue"
          : "Skip intro";
  const showSkipNarrationControl =
    isHostNarrating &&
    hostNarrationStage !== "manual" &&
    hostNarrationStage !== "idle" &&
    hostNarrationStage !== "question-options";

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
          leftActionButtonRef={registerFocusControlRef("header-quit")}
          leftActionFocused={focusedControl === "header-quit"}
          leftActionIcon={<House className="size-5 md:size-6" />}
          rightActionLabel={nextHeaderLabel}
          rightActionOnClick={() => void playRandomAgain()}
          rightActionDisabled={isLoadingNextQuiz}
          rightActionButtonRef={registerFocusControlRef("header-next")}
          rightActionFocused={focusedControl === "header-next"}
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
        <div
          className={cn(
            "grid gap-6 lg:grid-cols-[minmax(0,85%)_minmax(11rem,15%)] lg:items-stretch lg:gap-0",
            compactLayout && "lg:gap-0",
          )}
        >
          <section className="space-y-5 md:space-y-6 lg:space-y-0">
            <article className="overflow-hidden rounded-3xl border border-[#252940] bg-[#1a1d2e] lg:h-full lg:rounded-r-none lg:border-r-0">
              <SlantedBar
                value={Math.max(0, timerPercentage)}
                className="h-3 border-x-0 border-t-0 md:h-4"
                fillClassName="bg-gradient-to-r from-[#818cf8] to-[#fbbf24]"
              />

              <div className={cn("space-y-3 p-3 md:space-y-6 md:p-8", compactLayout && "md:space-y-3 md:p-4")}>
                <header className={cn("space-y-2 md:space-y-3", compactLayout && "md:space-y-2")}>
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <p
                      className={cn(
                        "text-sm font-semibold uppercase tracking-wide text-amber-300 md:text-xl",
                        compactLayout && "md:text-base",
                      )}
                    >
                      Question {currentQuestionIndex + 1} of {questions.length}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        if (isHostNarrating) {
                          skipHostNarration();
                          return;
                        }
                        void playCurrentPromptAloud();
                      }}
                      disabled={!currentQuestion}
                      className={cn(
                        "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition md:text-base",
                        isHostNarrating
                          ? "border-[#818cf8]/70 bg-[#818cf8]/18 text-[#eef1ff]"
                          : "border-[#252940] bg-[#0f1117]/72 text-[#c7cada] hover:border-[#6c8aff]/45 hover:text-[#eef1ff]",
                        !currentQuestion &&
                          "cursor-not-allowed opacity-70 hover:border-[#252940] hover:text-[#c7cada]",
                      )}
                    >
                      {isHostNarrating ? <Square className="size-4" /> : <Volume2 className="size-4" />}
                      <span>{isHostNarrating ? "Stop audio" : "Read aloud"}</span>
                    </button>

                    <label className="inline-flex min-h-11 items-center gap-3 rounded-full border border-[#252940] bg-[#0f1117]/72 px-4 py-2 text-sm font-semibold text-[#c7cada] md:text-base">
                      <Switch
                        checked={readAloudEnabled}
                        disabled={readAloudSaving}
                        onCheckedChange={(checked) => {
                          if (!checked && isHostNarrating) {
                            skipHostNarration();
                          }
                          setReadAloudPreferenceError(null);
                          void toggleReadAloud(checked);
                        }}
                        aria-label="Toggle automatic read aloud"
                      />
                      <span>{readAloudSaving ? "Saving..." : "Auto-read"}</span>
                    </label>

                    {showSkipNarrationControl ? (
                      <button
                        type="button"
                        onClick={skipHostNarration}
                        className="inline-flex min-h-11 items-center rounded-full border border-[#fbbf24]/35 bg-[#fbbf24]/10 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:border-[#fbbf24]/60 hover:bg-[#fbbf24]/16 md:text-base"
                      >
                        {skipNarrationLabel}
                      </button>
                    ) : null}
                  </div>
                  {readAloudError ? (
                    <p className="text-sm font-medium text-rose-300 md:text-base">{readAloudError}</p>
                  ) : null}
                  <h1
                    className={cn(
                      "text-[clamp(1.35rem,6.1vw,3.25rem)] leading-[1.03] font-bold",
                      compactLayout && "md:text-[clamp(1.7rem,3.1vw,2.6rem)]",
                      tvLikeLayout && "md:text-[clamp(2.55rem,4.65vw,3.9rem)]",
                    )}
                  >
                    {currentQuestion.questionText}
                  </h1>
                </header>

                <div className={cn("grid gap-2.5 md:grid-cols-2 md:gap-4", compactLayout && "md:gap-3")}>
                  {[0, 1, 2, 3].map((index) => {
                    const option = currentQuestion.options[index];
                    const isEliminated = eliminatedOptions.includes(index);
                    const isVisible = visibleOptions >= index + 1 && !isEliminated;
                    const selected = selectedAnswerIndex === index;
                    const isCorrect = revealedAnswer && correctAnswerIndex === index;
                    const isWrongSelected = revealedAnswer && selected && !isCorrect;

                    return (
                      <GameButton
                        key={index}
                        ref={registerFocusControlRef(`answer-${index}`)}
                        className={cn(
                          "min-h-20 md:min-h-32 [&>span>span]:text-[clamp(1.2rem,5.8vw,3.25rem)] [&>span>span]:leading-[1.06]",
                          compactLayout &&
                            "md:min-h-24 md:[&>span>span]:text-[clamp(1.2rem,2.25vw,1.9rem)]",
                          tvLikeLayout &&
                            "md:min-h-28 md:[&>span>span]:text-[clamp(1.8rem,3.35vw,2.85rem)]",
                        )}
                        disabled={optionsDisabled || isEliminated || !isVisible}
                        focused={focusedControl === `answer-${index}`}
                        state={
                          isCorrect
                            ? "correct"
                            : isWrongSelected
                              ? "wrong"
                              : selected && finalAnswerLocked && !revealedAnswer
                                ? "orange"
                              : selected
                                ? "selected"
                                : "default"
                        }
                        onClick={() => selectAnswer(index)}
                      >
                        {isVisible ? `${String.fromCharCode(65 + index)}: ${option?.text ?? ""}` : ""}
                      </GameButton>
                    );
                  })}
                </div>
                <div ref={questionViewportAnchorRef} className="h-px" />

                {showActionRow ? (
                  <div className="flex min-h-16 items-center justify-end">
                    {selectedAnswerIndex !== null && !revealedAnswer ? (
                      <div className="flex items-center justify-end gap-3">
                        <p
                          className={cn(
                            "text-sm font-semibold text-[#9394a5] md:text-2xl",
                            compactLayout && "md:text-base",
                          )}
                        >
                          Lock in your final answer?
                        </p>
                        <CircularButton
                          ref={registerFocusControlRef("final")}
                          focused={focusedControl === "final"}
                          selected={finalAnswerLocked}
                          disabled={finalAnswerLocked}
                          onClick={() => void confirmFinalAnswer()}
                        >
                          Final
                        </CircularButton>
                      </div>
                    ) : null}

                    {selectedAnswerIndex === null && !revealedAnswer && currentQuestionIndex > 0 ? (
                      <CircularButton
                        ref={registerFocusControlRef("cashout")}
                        focused={focusedControl === "cashout"}
                        onClick={cashOut}
                      >
                        Cash Out
                      </CircularButton>
                    ) : null}
                  </div>
                ) : null}

                <div
                  className={cn("grid gap-2.5 md:grid-cols-2 md:gap-4", compactLayout && "md:gap-3")}
                >
                  <GameButton
                    ref={registerFocusControlRef("lifeline-5050")}
                    centered
                    className={cn(
                      "min-h-12 text-sm md:min-h-16 md:text-xl",
                      compactLayout && "md:min-h-14 md:text-base",
                    )}
                    focused={focusedControl === "lifeline-5050"}
                    disabled={usedLifelines.fiftyFifty || optionsDisabled || revealedAnswer}
                    onClick={() => void handleFiftyFifty()}
                  >
                    50:50
                  </GameButton>
                  <GameButton
                    ref={registerFocusControlRef("lifeline-ask-host")}
                    centered
                    icon={<User size={20} />}
                    className={cn(
                      "min-h-12 text-sm md:min-h-16 md:text-xl",
                      compactLayout && "md:min-h-14 md:text-base",
                    )}
                    focused={focusedControl === "lifeline-ask-host"}
                    disabled={
                      usedLifelines.askHost ||
                      optionsDisabled ||
                      revealedAnswer ||
                      !canUseAskHost
                    }
                    onClick={() => void handleAskHost()}
                  >
                    Ask the Host
                  </GameButton>
                </div>

                {showAskHostStatus ? (
                  <div className="rounded-2xl border border-[#252940] bg-[#0f1117]/72 px-4 py-3 text-sm text-[#cfd1df] md:text-base">
                    {isAskHostThinking ? (
                      <span className="font-semibold text-amber-200">The host is thinking...</span>
                    ) : (
                      <span>
                        <span className="font-semibold text-amber-200">Host hint:</span> {askHostAdvice}
                      </span>
                    )}
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
                  value={((currentQuestionIndex + 1) / questions.length) * 100}
                  className={cn("h-3 md:h-4", compactLayout && "md:h-3")}
                  fillClassName="bg-gradient-to-r from-[#818cf8] to-[#6c8aff]"
                />
              </div>
            </article>
          </section>

          <aside className="rounded-3xl border border-[#252940] bg-[#1a1d2e] p-2 lg:h-full lg:rounded-l-none lg:border-l">
            <div className="grid h-full gap-1.5 content-stretch">
              {moneyLadderDisplay.map(([index, amount]) => {
                const isCheckpoint = CHECKPOINTS.includes(index as (typeof CHECKPOINTS)[number]);
                const isCurrent = index === currentQuestionIndex;
                const isPassed = index < currentQuestionIndex;

                return (
                  <div
                    key={amount}
                    className={cn(
                      "flex min-h-0 items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs font-semibold md:text-sm lg:flex-1 lg:text-xs",
                      isCurrent
                        ? "border-amber-300 bg-amber-400/20 text-amber-200"
                        : isPassed
                          ? "border-emerald-400 bg-emerald-500/20 text-emerald-200"
                          : "border-[#252940] bg-[#0f1117] text-[#e4e4e9]",
                      isCheckpoint && "shadow-[0_0_0_2px_rgba(250,204,21,0.35)]",
                    )}
                  >
                    <span className="text-[10px] uppercase tracking-[0.14em] text-[#9394a5]">
                      {index + 1}
                    </span>
                    <span>{formatMoney(amount)}</span>
                  </div>
                );
              })}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
