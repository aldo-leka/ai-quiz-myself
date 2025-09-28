import { useState, useEffect, useCallback } from 'react';
import { SinglePlayerGameState, SingleGameQuestion, SinglePlayerGamePhase } from '@/lib/types';

const STORAGE_KEY = 'singlePlayerGameState';
const GAME_EXPIRY_HOURS = 24;

const createInitialState = (): Partial<SinglePlayerGameState> => ({
    phase: "waiting",
    currentQuestionIndex: 0,
    score: 0,
    isAnswerLocked: false,
    showingExplanation: false,
    userAnswers: [],
    showIntro: false,
    introAnimationComplete: false,
});

const generateGameId = (): string => {
    return `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

const isGameExpired = (lastUpdated: number): boolean => {
    const now = Date.now();
    const expiryTime = GAME_EXPIRY_HOURS * 60 * 60 * 1000; // 24 hours in milliseconds
    return (now - lastUpdated) > expiryTime;
};

export const useSinglePlayerGame = () => {
    const [gameState, setGameState] = useState<SinglePlayerGameState | null>(null);

    // Load game state from localStorage on mount
    useEffect(() => {
        try {
            const savedState = localStorage.getItem(STORAGE_KEY);
            if (savedState) {
                const parsedState = JSON.parse(savedState) as SinglePlayerGameState;

                // Check if game is expired
                if (isGameExpired(parsedState.lastUpdated)) {
                    localStorage.removeItem(STORAGE_KEY);
                    setGameState(null);
                } else {
                    setGameState(parsedState);
                }
            }
        } catch (error) {
            console.error('Error loading saved game state:', error);
            localStorage.removeItem(STORAGE_KEY);
            setGameState(null);
        }
    }, []);

    // Save game state to localStorage whenever it changes
    useEffect(() => {
        if (gameState) {
            try {
                const stateToSave = {
                    ...gameState,
                    lastUpdated: Date.now()
                };
                localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
            } catch (error) {
                console.error('Error saving game state:', error);
            }
        }
    }, [gameState]);

    const updateGameState = useCallback((updates: Partial<SinglePlayerGameState>) => {
        setGameState(prev => prev ? { ...prev, ...updates } : null);
    }, []);

    const startNewGame = useCallback(async () => {
        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/fake-quiz`);
            const data = await response.json();

            const newGameState: SinglePlayerGameState = {
                ...createInitialState(),
                gameId: generateGameId(),
                startTime: Date.now(),
                lastUpdated: Date.now(),
                theme: data.theme,
                difficulty: data.difficulty,
                questions: data.questions,
                phase: "intro",
                showIntro: true,
            } as SinglePlayerGameState;

            setGameState(newGameState);
            return newGameState;
        } catch (error) {
            console.error('Error starting new game:', error);
            throw error;
        }
    }, []);

    const clearSavedGame = useCallback(() => {
        localStorage.removeItem(STORAGE_KEY);
        setGameState(null);
    }, []);

    const selectAnswer = useCallback((answer: string) => {
        if (!gameState || gameState.isAnswerLocked) return;

        updateGameState({
            selectedAnswer: answer,
            isAnswerLocked: true,
        });
    }, [gameState, updateGameState]);

    const goToNextQuestion = useCallback(() => {
        if (!gameState) return;

        const currentQuestion = gameState.questions[gameState.currentQuestionIndex];
        const isCorrect = gameState.selectedAnswer === currentQuestion.correctAnswer;

        // Add to user answers history
        const newUserAnswer = {
            questionIndex: gameState.currentQuestionIndex,
            selectedAnswer: gameState.selectedAnswer || "",
            isCorrect,
            timeSpent: 0, // TODO: Calculate actual time spent
        };

        const newScore = isCorrect ? gameState.score + 100 : gameState.score; // Simple scoring
        const nextQuestionIndex = gameState.currentQuestionIndex + 1;
        const isGameComplete = nextQuestionIndex >= gameState.questions.length;

        updateGameState({
            userAnswers: [...gameState.userAnswers, newUserAnswer],
            score: newScore,
            currentQuestionIndex: nextQuestionIndex,
            phase: isGameComplete ? "completed" : "question",
            selectedAnswer: undefined,
            isAnswerLocked: false,
            showingExplanation: false,
        });
    }, [gameState, updateGameState]);

    const showExplanation = useCallback(() => {
        if (!gameState) return;

        updateGameState({
            phase: "explanation",
            showingExplanation: true,
            remainingTime: 5, // 5 seconds for explanation
        });
    }, [gameState, updateGameState]);

    const startGame = useCallback(() => {
        if (!gameState) return;

        updateGameState({
            phase: "question",
            showIntro: false,
        });
    }, [gameState, updateGameState]);

    const completeIntroAnimation = useCallback(() => {
        updateGameState({
            introAnimationComplete: true,
        });
    }, [updateGameState]);

    // Computed values
    const currentQuestion = gameState?.questions[gameState.currentQuestionIndex];
    const totalQuestions = gameState?.questions.length || 0;
    const hasGame = gameState !== null;
    const canResume = hasGame && gameState.phase !== "waiting" && gameState.phase !== "completed";

    return {
        // Game state
        gameState,
        currentQuestion,
        totalQuestions,
        hasGame,
        canResume,

        // Computed values for easier access
        phase: gameState?.phase || "waiting",
        theme: gameState?.theme || "",
        difficulty: gameState?.difficulty || "",
        currentQuestionIndex: gameState?.currentQuestionIndex || 0,
        score: gameState?.score || 0,
        selectedAnswer: gameState?.selectedAnswer,
        isAnswerLocked: gameState?.isAnswerLocked || false,
        showingExplanation: gameState?.showingExplanation || false,
        userAnswers: gameState?.userAnswers || [],
        showIntro: gameState?.showIntro || false,
        introAnimationComplete: gameState?.introAnimationComplete || false,
        remainingTime: gameState?.remainingTime,

        // Actions
        startNewGame,
        clearSavedGame,
        selectAnswer,
        showExplanation,
        goToNextQuestion,
        startGame,
        completeIntroAnimation,
        updateGameState,
    };
};