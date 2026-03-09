"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { User } from "lucide-react";
import { useRouter } from "next/navigation";
import { AnimatedText } from "@/components/quiz/AnimatedText";
import { CircularButton } from "@/components/quiz/CircularButton";
import { GameButton } from "@/components/quiz/GameButton";
import { LoadingScreen } from "@/components/quiz/LoadingScreen";
import { QuizPlayHeader } from "@/components/quiz/QuizPlayHeader";
import { SlantedBar } from "@/components/quiz/SlantedBar";
import { useCompactQuizLayout, useTvLikeQuizLayout } from "@/hooks/useCompactQuizLayout";
import { useHostCommunication } from "@/hooks/useHostCommunication";
import { authClient } from "@/lib/auth-client";
import { getNextRandomQuizId, rememberRecentQuiz } from "@/lib/recent-quiz-history";
import {
  ASK_HOST_FALLBACK_MESSAGES,
  CHECKPOINTS,
  formatMoney,
  LIFELINE_5050_MESSAGES,
  MONEY_LADDER,
  NEXT_QUESTION_MESSAGES,
  QUESTION_LENGTH_SECONDS,
  WELCOME_MESSAGES,
} from "@/lib/quiz-constants";
import type {
  HostMessage,
  PlayableQuestion,
  QuizWithQuestions,
  SaveQuizSessionPayload,
} from "@/lib/quiz-types";

type FocusControlId =
  | `answer-${number}`
  | "final"
  | "continue"
  | "cashout"
  | "lifeline-5050"
  | "lifeline-ask-host";

type WwtbamGameProps = {
  quiz: QuizWithQuestions;
};

export function WwtbamGame({ quiz }: WwtbamGameProps) {
  const router = useRouter();
  const compactLayout = useCompactQuizLayout();
  const tvLikeLayout = useTvLikeQuizLayout();

  const [isLoading, setIsLoading] = useState(true);

  const [selectedAnswerIndex, setSelectedAnswerIndex] = useState<number | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [finalAnswerLocked, setFinalAnswerLocked] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<HostMessage[]>([]);
  const [hostMessage, setHostMessage] = useState("");
  const [hostMessageOnComplete, setHostMessageOnComplete] = useState<(() => void) | undefined>();
  const [visibleOptions, setVisibleOptions] = useState(0);
  const [optionsDisabled, setOptionsDisabled] = useState(true);
  const [eliminatedOptions, setEliminatedOptions] = useState<number[]>([]);
  const [revealedAnswer, setRevealedAnswer] = useState(false);
  const [correctAnswerIndex, setCorrectAnswerIndex] = useState<number | null>(null);

  const [usedLifelines, setUsedLifelines] = useState({
    fiftyFifty: false,
    askHost: false,
  });

  const [remainingTime, setRemainingTime] = useState<number | null>(null);
  const [totalTime, setTotalTime] = useState<number | null>(null);

  const [gameOver, setGameOver] = useState(false);
  const [wonAmount, setWonAmount] = useState(0);

  const [focusedControl, setFocusedControl] = useState<FocusControlId | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownStartedRef = useRef(false);
  const startedAtRef = useRef<Date>(new Date());
  const questionStartedAtRef = useRef<number>(Date.now());
  const answeredQuestionIdsRef = useRef(new Set<string>());
  const pendingAnswersRef = useRef<SaveQuizSessionPayload["answers"]>([]);
  const hasPersistedSessionRef = useRef(false);
  const isAdvancingRef = useRef(false);
  const revealedAnswerRef = useRef(false);
  const questionViewportAnchorRef = useRef<HTMLDivElement | null>(null);

  const { data: sessionData } = authClient.useSession();

  const { sendAction } = useHostCommunication({
    conversationHistory,
    setConversationHistory,
  });

  const questions = quiz.questions;
  const currentQuestion = questions[currentQuestionIndex];
  const shouldAttemptAiHost = Boolean(sessionData?.user);

  const availableAnswerIndexes = useMemo(() => {
    if (optionsDisabled) return [];

    return [0, 1, 2, 3].filter(
      (index) => visibleOptions >= index + 1 && !eliminatedOptions.includes(index),
    );
  }, [eliminatedOptions, optionsDisabled, visibleOptions]);

  const focusOrder = useMemo<FocusControlId[]>(() => {
    const controls: FocusControlId[] = [];

    if (availableAnswerIndexes.length > 0 && selectedAnswerIndex === null && !revealedAnswer) {
      controls.push(...availableAnswerIndexes.map((index) => `answer-${index}` as const));
    }

    if (selectedAnswerIndex !== null && !revealedAnswer) {
      controls.push("final");
    }

    if (revealedAnswer) {
      controls.push("continue");
    }

    if (!revealedAnswer && selectedAnswerIndex === null && currentQuestionIndex > 0) {
      controls.push("cashout");
    }

    if (!revealedAnswer) {
      if (!usedLifelines.fiftyFifty && !optionsDisabled) controls.push("lifeline-5050");
      if (!usedLifelines.askHost && !optionsDisabled) controls.push("lifeline-ask-host");
    }

    return controls;
  }, [
    availableAnswerIndexes,
    currentQuestionIndex,
    optionsDisabled,
    revealedAnswer,
    selectedAnswerIndex,
    usedLifelines.askHost,
    usedLifelines.fiftyFifty,
  ]);

  useEffect(() => {
    rememberRecentQuiz("wwtbam", quiz.id);
  }, [quiz.id]);

  useEffect(() => {
    let cancelled = false;

    async function initializeGame() {
      setIsLoading(true);
      setCurrentQuestionIndex(0);
      setSelectedAnswerIndex(null);
      setFinalAnswerLocked(false);
      setHostMessage("");
      setConversationHistory([]);
      setVisibleOptions(0);
      setOptionsDisabled(true);
      setEliminatedOptions([]);
      setRevealedAnswer(false);
      revealedAnswerRef.current = false;
      setCorrectAnswerIndex(null);
      setUsedLifelines({ fiftyFifty: false, askHost: false });
      setGameOver(false);
      setWonAmount(0);
      pendingAnswersRef.current = [];
      answeredQuestionIdsRef.current = new Set();
      hasPersistedSessionRef.current = false;
      isAdvancingRef.current = false;
      startedAtRef.current = new Date();

      await welcomePlayer(quiz);
      if (!cancelled) {
        setIsLoading(false);
      }
    }

    void initializeGame();

    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // Game setup should rerun only when the quiz changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiz.id]);

  useEffect(() => {
    if (!focusOrder.length) {
      setFocusedControl(null);
      return;
    }

    if (focusedControl && !focusOrder.includes(focusedControl)) {
      setFocusedControl(null);
    }
  }, [focusOrder, focusedControl]);

  useEffect(() => {
    if (isLoading || gameOver) return;

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

      const baseIndex = currentIndex;
      const delta = key === "ArrowLeft" || key === "ArrowUp" ? -1 : 1;
      const nextIndex = (baseIndex + delta + focusOrder.length) % focusOrder.length;

      setFocusedControl(focusOrder[nextIndex]);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // Keyboard handler intentionally depends on current visible control state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusOrder, focusedControl, gameOver, isLoading]);

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

  function startCountdown(seconds: number) {
    if (countdownStartedRef.current) return;

    countdownStartedRef.current = true;
    questionStartedAtRef.current = Date.now();
    setTotalTime(seconds);
    setRemainingTime(seconds);

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

  function setHostCompletionOnce(onComplete: () => void | Promise<void>) {
    let completed = false;
    setHostMessageOnComplete(() => () => {
      if (completed) return;
      completed = true;
      setHostMessageOnComplete(undefined);
      void onComplete();
    });
  }

  async function welcomePlayer(loadedQuiz: QuizWithQuestions) {
    const playerName = sessionData?.user?.name ?? "Contestant";

    const aiWelcome = await sendAction({
      actionType: "WELCOME",
      action: "The contestant entered the stage. Welcome them.",
      currentSetting: { moneyValue: MONEY_LADDER[0] },
      additionalData: { contestantName: playerName },
      useAiHost: shouldAttemptAiHost,
      onStreamChunk: (text) => setHostMessage(text),
    });

    if (!aiWelcome) {
      const fallback = WELCOME_MESSAGES[Math.floor(Math.random() * WELCOME_MESSAGES.length)]
        .replace("{{name}}", playerName);
      setHostMessage(fallback);
    }

    setHostCompletionOnce(() => beginQuestion(loadedQuiz.questions, 0));
  }

  async function beginQuestion(questionSet: PlayableQuestion[], index: number) {
    const question = questionSet[index];
    if (!question) return;

    countdownStartedRef.current = false;
    setSelectedAnswerIndex(null);
    setFinalAnswerLocked(false);
    setOptionsDisabled(true);
    setVisibleOptions(0);
    setEliminatedOptions([]);
    setRevealedAnswer(false);
    revealedAnswerRef.current = false;
    setCorrectAnswerIndex(null);

    const aiIntro = await sendAction({
      actionType: "BEGIN_QUESTION",
      action: `Present question ${index + 1}.`,
      currentSetting: {
        moneyValue: MONEY_LADDER[index],
        difficulty: question.difficulty,
        question: question.questionText,
        options: question.options.map((option) => option.text),
      },
      useAiHost: shouldAttemptAiHost,
      onStreamChunk: (text) => setHostMessage(text),
    });

    if (!aiIntro) {
      const fallback = NEXT_QUESTION_MESSAGES[Math.floor(Math.random() * NEXT_QUESTION_MESSAGES.length)]
        .replace("{{moneyValue}}", MONEY_LADDER[index].toLocaleString())
        .replace("{{question}}", question.questionText)
        .replace("{{optionA}}", question.options[0]?.text ?? "")
        .replace("{{optionB}}", question.options[1]?.text ?? "")
        .replace("{{optionC}}", question.options[2]?.text ?? "")
        .replace("{{optionD}}", question.options[3]?.text ?? "");

      setHostMessage(fallback);
    }

    setHostCompletionOnce(() => revealAllOptions());
  }

  function revealAllOptions() {
    setVisibleOptions(4);
    setOptionsDisabled(false);
    startCountdown(QUESTION_LENGTH_SECONDS);
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

  function revealAnswer() {
    if (!currentQuestion || revealedAnswerRef.current) return;

    stopTimer();
    setOptionsDisabled(true);
    revealedAnswerRef.current = true;
    setRevealedAnswer(true);
    setCorrectAnswerIndex(currentQuestion.correctOptionIndex);
    trackCurrentAnswer(selectedAnswerIndex);
    setHostCompletionOnce(() => handleNextQuestion());
  }

  function onHostCue(type: "reveal" | "option", value?: "A" | "B" | "C" | "D") {
    if (type === "option" && value) {
      const optionIndex = value.charCodeAt(0) - "A".charCodeAt(0) + 1;
      setVisibleOptions((previous) => Math.max(previous, optionIndex));

      if (optionIndex >= 4) {
        setOptionsDisabled(false);
        startCountdown(QUESTION_LENGTH_SECONDS);
      }
      return;
    }

    // Ignore accidental/early reveal cues unless we're in an answer-locked path
    // (final answer confirmation or timeout flow).
    if (!finalAnswerLocked) return;
    revealAnswer();
  }

  async function handleTimeOut() {
    if (!currentQuestion || revealedAnswer) return;

    setOptionsDisabled(true);
    setFinalAnswerLocked(true);
    setSelectedAnswerIndex(null);
    setHostMessage("|||slow|||Time is up.|||medium|||Let's reveal the correct answer.|||reveal|||");
    setHostMessageOnComplete(undefined);
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

    const aiResponse = await sendAction({
      actionType: "LIFELINE_5050",
      action: "The player used 50:50.",
      currentSetting: {
        moneyValue: MONEY_LADDER[currentQuestionIndex],
        remainingTime,
        difficulty: currentQuestion.difficulty,
        question: currentQuestion.questionText,
        options: currentQuestion.options.map((option) => option.text),
      },
      additionalData: { remainingOptions: remaining },
      useAiHost: shouldAttemptAiHost,
      onStreamChunk: (text) => setHostMessage(text),
    });

    if (!aiResponse) {
      const fallback = LIFELINE_5050_MESSAGES[Math.floor(Math.random() * LIFELINE_5050_MESSAGES.length)]
        .replace("{{option1}}", remaining[0] ?? "")
        .replace("{{option2}}", remaining[1] ?? "");

      setHostMessage(fallback);
    }

    setHostMessageOnComplete(undefined);
  }

  async function handleAskHost() {
    if (!currentQuestion || usedLifelines.askHost) return;

    setUsedLifelines((previous) => ({ ...previous, askHost: true }));

    const remainingIndexes = [0, 1, 2, 3].filter((idx) => !eliminatedOptions.includes(idx));
    const remainingOptions = remainingIndexes.map(
      (idx) => `${String.fromCharCode(65 + idx)}: ${currentQuestion.options[idx]?.text ?? ""}`,
    );

    const aiResponse = await sendAction({
      actionType: "LIFELINE_ASK_HOST",
      action: "The player asks the host for advice.",
      currentSetting: {
        moneyValue: MONEY_LADDER[currentQuestionIndex],
        remainingTime,
        difficulty: currentQuestion.difficulty,
        question: currentQuestion.questionText,
        options: currentQuestion.options.map((option) => option.text),
      },
      additionalData: {
        remainingOptions,
      },
      useAiHost: shouldAttemptAiHost,
      onStreamChunk: (text) => setHostMessage(text),
    });

    if (!aiResponse) {
      const guessIndex = remainingIndexes[Math.floor(Math.random() * remainingIndexes.length)] ?? 0;
      const guess = `${String.fromCharCode(65 + guessIndex)}: ${currentQuestion.options[guessIndex]?.text ?? ""}`;
      const fallback = ASK_HOST_FALLBACK_MESSAGES[
        Math.floor(Math.random() * ASK_HOST_FALLBACK_MESSAGES.length)
      ].replace("{{guess}}", guess);
      setHostMessage(fallback);
    }

    setHostMessageOnComplete(undefined);
  }

  async function confirmFinalAnswer() {
    if (!currentQuestion || selectedAnswerIndex === null || finalAnswerLocked) return;

    setFinalAnswerLocked(true);
    setOptionsDisabled(true);
    stopTimer();

    const selectedOption = currentQuestion.options[selectedAnswerIndex];
    const correctOption = currentQuestion.options[currentQuestion.correctOptionIndex];
    const isCorrect = selectedAnswerIndex === currentQuestion.correctOptionIndex;

    const fallbackFinalMessage = isCorrect
      ? `You lock in ${selectedOption?.text ?? "that answer"}.|||slow|||That is correct!|||reveal||||||medium|||${correctOption?.explanation ?? "Excellent call."}`
      : `You lock in ${selectedOption?.text ?? "that answer"}.|||slow|||I'm sorry, that's not correct.|||reveal||||||medium|||${selectedOption?.explanation ?? "It sounded plausible, but missed a key detail."}|||medium|||The correct answer was ${correctOption?.text ?? "the correct option"}. ${correctOption?.explanation ?? ""}`;

    const aiResponse = await sendAction({
      actionType: "FINAL_ANSWER_CONFIRM",
      action: `The player locks ${selectedOption?.text ?? ""} as the final answer.`,
      currentSetting: {
        moneyValue: MONEY_LADDER[currentQuestionIndex],
        remainingTime,
        difficulty: currentQuestion.difficulty,
        question: currentQuestion.questionText,
        options: currentQuestion.options.map((option) => option.text),
        correctAnswer: correctOption?.text,
      },
      additionalData: {
        selectedAnswer: selectedOption?.text,
        selectedAnswerExplanation:
          selectedAnswerIndex === currentQuestion.correctOptionIndex
            ? undefined
            : selectedOption?.explanation,
        correctAnswerExplanation: correctOption?.explanation,
      },
      useAiHost: shouldAttemptAiHost,
      onStreamChunk: (text) => setHostMessage(text),
    });

    if (!aiResponse) {
      setHostMessage(fallbackFinalMessage);
      setHostMessageOnComplete(undefined);
      return;
    }

    // Ensure the reveal always happens even if the model forgot the cue token.
    const normalizedResponse = aiResponse.includes("|||reveal|||")
      ? aiResponse
      : `${aiResponse}|||medium||||||reveal|||`;

    setHostMessage(normalizedResponse);
    setHostMessageOnComplete(undefined);
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
    setWonAmount(finalAmount);
    setGameOver(true);
    await persistSession(finalAmount);
  }

  async function handleNextQuestion() {
    if (isAdvancingRef.current || !currentQuestion || !revealedAnswerRef.current) return;

    isAdvancingRef.current = true;
    try {
      if (selectedAnswerIndex !== currentQuestion.correctOptionIndex) {
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

  function continueAfterReveal() {
    setHostMessageOnComplete(undefined);
    void handleNextQuestion();
  }

  function cashOut() {
    if (currentQuestionIndex <= 0) return;
    const amount = MONEY_LADDER[currentQuestionIndex - 1] ?? 0;
    void endGame(amount);
  }

  async function playRandomAgain() {
    try {
      const nextQuizId = await getNextRandomQuizId({
        mode: "wwtbam",
        currentQuizId: quiz.id,
      });

      if (!nextQuizId) {
        router.push("/");
        return;
      }

      router.push(`/play/${nextQuizId}`);
    } catch {
      router.push("/");
    }
  }

  function triggerControl(controlId: FocusControlId) {
    if (controlId.startsWith("answer-")) {
      const idx = Number(controlId.replace("answer-", ""));
      if (!Number.isNaN(idx) && availableAnswerIndexes.includes(idx)) {
        setSelectedAnswerIndex(idx);
      }
      return;
    }

    if (controlId === "final") {
      void confirmFinalAnswer();
      return;
    }

    if (controlId === "continue") {
      continueAfterReveal();
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
            <CircularButton onClick={() => router.push("/")}>Home</CircularButton>
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
              <GameButton
                centered
                className="min-h-20 text-2xl md:text-3xl"
                onClick={() => router.push("/")}
              >
                Back to Hub
              </GameButton>
              <GameButton
                centered
                className="min-h-20 border-[#6c8aff]/45 bg-[#6c8aff]/12 text-2xl text-[#e4e4e9] md:text-3xl"
                onClick={() => void playRandomAgain()}
              >
                Play Random Quiz
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
        />
        <div className={cn("grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]", compactLayout && "lg:grid-cols-1")}>
          <section className="space-y-5 md:space-y-6">
            <article className="overflow-hidden rounded-3xl border border-[#252940] bg-[#1a1d2e]">
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
                            : isWrongSelected || (selected && finalAnswerLocked && !revealedAnswer)
                              ? "orange"
                              : selected
                                ? "selected"
                                : "default"
                        }
                        onClick={() => setSelectedAnswerIndex(index)}
                      >
                        {isVisible ? `${String.fromCharCode(65 + index)}: ${option?.text ?? ""}` : ""}
                      </GameButton>
                    );
                  })}
                </div>
                <div ref={questionViewportAnchorRef} className="h-px" />

                {selectedAnswerIndex !== null && !revealedAnswer ? (
                  <div className="flex items-center justify-between gap-4">
                    <p className={cn("text-sm font-semibold text-[#9394a5] md:text-2xl", compactLayout && "md:text-base")}>
                      Lock in your final answer?
                    </p>
                    <CircularButton
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
                  <div className="flex items-center justify-end">
                    <CircularButton focused={focusedControl === "cashout"} onClick={cashOut}>
                      Cash Out
                    </CircularButton>
                  </div>
                ) : null}

                {revealedAnswer ? (
                  <div className="flex items-center justify-center">
                    <CircularButton focused={focusedControl === "continue"} onClick={continueAfterReveal}>
                      Continue
                    </CircularButton>
                  </div>
                ) : null}

                <div className="grid gap-3 md:grid-cols-2">
                  <GameButton
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
                    centered
                    icon={<User size={20} />}
                    className={cn(
                      "min-h-12 text-sm md:min-h-16 md:text-xl",
                      compactLayout && "md:min-h-14 md:text-base",
                    )}
                    focused={focusedControl === "lifeline-ask-host"}
                    disabled={usedLifelines.askHost || optionsDisabled || revealedAnswer}
                    onClick={() => void handleAskHost()}
                  >
                    Ask the Host
                  </GameButton>
                </div>
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

            {hostMessage ? (
              <AnimatedText text={hostMessage} onCue={onHostCue} onComplete={hostMessageOnComplete} />
            ) : null}
          </section>

          <aside className="space-y-3 rounded-3xl border border-[#252940] bg-[#1a1d2e] p-4 md:p-5">
          <h2 className="mb-3 text-xl font-bold text-amber-300 md:text-2xl">Money Ladder</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            {MONEY_LADDER.map((amount, index) => {
              const isCheckpoint = CHECKPOINTS.includes(index as (typeof CHECKPOINTS)[number]);
              const isCurrent = index === currentQuestionIndex;
              const isPassed = index < currentQuestionIndex;

              return (
                <div
                  key={amount}
                  className={[
                    "min-h-14 rounded-xl border px-4 py-3 text-base font-semibold md:min-h-20 md:text-lg",
                    isCurrent
                      ? "border-amber-300 bg-amber-400/20 text-amber-200"
                      : isPassed
                        ? "border-emerald-400 bg-emerald-500/20 text-emerald-200"
                        : "border-[#252940] bg-[#0f1117] text-[#e4e4e9]",
                    isCheckpoint ? "shadow-[0_0_0_2px_rgba(250,204,21,0.35)]" : "",
                  ].join(" ")}
                >
                  {formatMoney(amount)}
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
