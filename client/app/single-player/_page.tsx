"use client";

import {useEffect, useRef} from "react";
import {useGame} from "@/context/GameContext";
import {useSinglePlayerGame} from "@/hooks/useSinglePlayerGame";
import NicknamePrompt from "@/components/NicknamePrompt";
import Question from "@/components/quiz/Question";
import Explanation from "@/components/quiz/Explanation";
import Intro from "@/components/quiz/Intro";
import Header from "@/components/quiz/Header";

export default function SinglePlayer() {
    const { state } = useGame()
    const game = useSinglePlayerGame()
    const explanationTimerRef = useRef<NodeJS.Timeout | null>(null)
    const introTimerRef = useRef<NodeJS.Timeout | null>(null)

    useEffect(() => {
        if (!state.isRegistered) return

        // Check if we have a saved game to resume
        if (game.canResume) {
            console.log('Resuming saved game');
        } else if (!game.hasGame) {
            // No saved game, start a new one
            handleStartNewGame();
        }
    }, [state.isRegistered, game.canResume, game.hasGame])

    // Handle explanation timer
    useEffect(() => {
        if (game.phase === "explanation") {
            // Clear any existing timer
            if (explanationTimerRef.current) {
                clearTimeout(explanationTimerRef.current);
            }

            // Set timer to automatically go to next question
            explanationTimerRef.current = setTimeout(() => {
                handleNextQuestion();
            }, 5000); // 5 seconds explanation time
        }

        return () => {
            if (explanationTimerRef.current) {
                clearTimeout(explanationTimerRef.current);
                explanationTimerRef.current = null;
            }
        };
    }, [game.phase])

    // Handle intro animation
    useEffect(() => {
        if (game.showIntro && !game.introAnimationComplete) {
            introTimerRef.current = setTimeout(() => {
                handleCompleteIntroAnimation();
                // After intro animation completes, start the actual game
                setTimeout(() => {
                    handleStartGame();
                }, 1000);
            }, 3000); // 3 seconds intro animation
        }

        return () => {
            if (introTimerRef.current) {
                clearTimeout(introTimerRef.current);
                introTimerRef.current = null;
            }
        };
    }, [game.showIntro, game.introAnimationComplete])

    const handleStartNewGame = async () => {
        try {
            await game.startNewGame();
        } catch (error) {
            console.error('Failed to start new game:', error);
        }
    }

    const handleAnswerSelect = async (selectedIndex: number) => {
        if (!game.currentQuestion || game.isAnswerLocked) return;

        const selectedAnswer = game.currentQuestion.options[selectedIndex];
        game.selectAnswer(selectedAnswer);

        // Show explanation after a brief delay
        setTimeout(() => {
            game.showExplanation();
        }, 1000);
    }

    const handleNextQuestion = () => {
        game.goToNextQuestion();
    }

    const handleStartGame = () => {
        game.startGame();
    }

    const handleCompleteIntroAnimation = () => {
        game.completeIntroAnimation();
    }

    if (!state.isRegistered) {
        return <NicknamePrompt />
    }

    return (
        <div className="p-4 sm:p-6 md:p-8 min-h-screen bg-slate-50">
            <div className="max-w-3xl mx-auto p-4">
                {/* Game Intro Animation */}
                {game.showIntro && <Intro
                    animationComplete={game.introAnimationComplete}
                    theme={game.theme}
                    difficulty={game.difficulty}
                />}

                {/* Game Header */}
                {game.phase !== "waiting" && <Header
                    phase={game.phase}
                    currentQuestionIndex={game.currentQuestionIndex}
                    totalQuestions={game.totalQuestions}
                    theme={game.theme}
                    difficulty={game.difficulty}
                    score={game.score}
                />}

                {/* Question Phase */}
                {game.phase === "question" && game.currentQuestion && <Question
                    remainingTime={game.remainingTime}
                    question={game.currentQuestion.question}
                    options={game.currentQuestion.options}
                    answer={game.selectedAnswer || ""}
                    handleAnswerSelect={handleAnswerSelect}
                    lockAnswer={game.isAnswerLocked}
                />}

                {/* Explanation Phase */}
                {game.phase === "explanation" && game.currentQuestion && <Explanation
                    options={game.currentQuestion.options}
                    question={game.currentQuestion.question}
                    correctAnswerIndex={game.currentQuestion.options.findIndex(option => option === game.currentQuestion?.correctAnswer)}
                    answer={game.selectedAnswer || ""}
                    explanation={game.currentQuestion.explanations[0]}
                    remainingTime={game.remainingTime}
                />}

                {/* Game Over */}
                {game.phase === "completed" && (
                    <div className="p-6 bg-white shadow-sm rounded-lg border border-gray-100 text-center">
                        <h2 className="text-2xl font-bold mb-4">Game Over!</h2>
                        <div className="text-4xl font-bold text-blue-600 mb-2">{game.score} points</div>
                        <div className="text-gray-600 mb-6">
                            You answered {game.userAnswers.length} questions
                        </div>
                        <div className="text-gray-600 mb-6">
                            Correct: {game.userAnswers.filter(answer => answer.isCorrect).length} / {game.userAnswers.length}
                        </div>
                        <div className="flex gap-4 justify-center">
                            <button
                                onClick={handleStartNewGame}
                                className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                            >
                                Play Again
                            </button>
                            <button
                                onClick={() => game.clearSavedGame()}
                                className="px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
                            >
                                Clear Progress
                            </button>
                        </div>
                    </div>
                )}

                {/* Waiting Screen or Resume Screen */}
                {game.phase === "waiting" && (
                    <div className="flex flex-col items-center justify-center p-8">
                        {game.canResume ? (
                            <>
                                <div className="text-xl font-semibold mb-4">Resume your game?</div>
                                <div className="text-gray-600 mb-6">
                                    Progress: {game.currentQuestionIndex + 1} / {game.totalQuestions} questions
                                </div>
                                <div className="flex gap-4">
                                    <button
                                        onClick={handleStartGame}
                                        className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                                    >
                                        Resume Game
                                    </button>
                                    <button
                                        onClick={handleStartNewGame}
                                        className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                                    >
                                        Start New Game
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="text-xl font-semibold mb-4">Ready to test your knowledge?</div>
                                <button
                                    onClick={handleStartNewGame}
                                    className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                                >
                                    Start Game
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}