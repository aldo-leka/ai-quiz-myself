"use client";

import {useEffect} from "react";
import {useGame} from "@/context/GameContext";
import {useQuizGame} from "@/hooks/useQuizGame";
import {useGameIntro} from "@/hooks/useGameIntro";
import NicknamePrompt from "@/components/NicknamePrompt";
import Question from "@/components/quiz/Question";
import Explanation from "@/components/quiz/Explanation";
import Intro from "@/components/quiz/Intro";
import Header from "@/components/quiz/Header";

export default function SinglePlayer() {
    const { state } = useGame()
    const game = useQuizGame();
    const intro = useGameIntro();

    useEffect(() => {
        if (!state.isRegistered) return

        // TODO: Start single player game
        // This is where you'll call your backend endpoint to start the game
        startSinglePlayerGame();
    }, [state.isRegistered])

    // Placeholder function - you'll implement the actual API call
    const startSinglePlayerGame = async () => {
        // Example of how you might start the game
        // const response = await fetch('/api/single-player/start');
        // const data = await response.json();
        // 
        // Expected response format:
        // {
        //   theme: "Geography",
        //   difficulty: "Medium", 
        //   totalQuestions: 10,
        //   firstQuestion: {
        //     questionIndex: 0,
        //     question: "What is the capital of France?",
        //     options: ["London", "Berlin", "Paris", "Madrid"],
        //     remainingTime: 15
        //   }
        // }
        //
        // game.setTheme(data.theme);
        // game.setDifficulty(data.difficulty);
        // game.setTotalQuestions(data.totalQuestions);
        // intro.startIntro(data.theme, data.difficulty);
        //
        // After intro animation completes (3s), set the first question:
        // setTimeout(() => {
        //   game.setQuestionData(data.firstQuestion);
        // }, 3000);
        
        // For now, just simulate starting a game
        game.setTheme("Geography");
        game.setDifficulty("Medium");
        intro.startIntro("Geography", "Medium");
    }

    // Placeholder for answer submission - you'll implement the actual API call
    const handleAnswerSelect = async (selectedIndex: number) => {
        if (game.lockAnswer) return;
        game.setAnswer(game.options[selectedIndex]);
        game.setLockAnswer(true);
        
        // TODO: Submit answer to backend
        // const response = await fetch('/api/single-player/answer', {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify({ 
        //         questionIndex: game.currentQuestion,
        //         answerIndex: selectedIndex 
        //     })
        // });
        // const data = await response.json();
        //
        // Expected response format:
        // {
        //   correct: true/false,
        //   score: 100,
        //   correctAnswerIndex: 2,
        //   explanation: "Paris is the capital of France...",
        //   remainingTime: 5
        // }
        //
        // game.setScore(data.score);
        // game.setExplanationData({
        //   ...game,  // spread current game state
        //   correctAnswerIndex: data.correctAnswerIndex,
        //   explanation: data.explanation,
        //   remainingTime: data.remainingTime
        // });
        //
        // After explanation timer, get next question:
        // setTimeout(async () => {
        //   const nextResponse = await fetch('/api/single-player/next');
        //   const nextData = await nextResponse.json();
        //   if (nextData.gameOver) {
        //     game.setPhase("leaderboard");
        //   } else {
        //     game.setQuestionData(nextData);
        //   }
        // }, data.remainingTime * 1000);
    }

    if (!state.isRegistered) {
        return <NicknamePrompt />
    }

    return (
        <div className="p-4 sm:p-6 md:p-8 min-h-screen bg-slate-50">
            <div className="max-w-3xl mx-auto p-4">
                {/* Game Intro Animation */}
                {intro.showIntro && <Intro 
                    animationComplete={intro.introAnimationComplete} 
                    theme={intro.introTheme} 
                    difficulty={intro.introDifficulty} 
                />}

                {/* Game Header */}
                {game.phase && <Header
                    phase={game.phase}
                    currentQuestion={game.currentQuestion}
                    totalQuestions={game.totalQuestions}
                    theme={game.theme}
                    difficulty={game.difficulty}
                    score={game.score}
                />}

                {/* Question Phase */}
                {game.phase === "question" && <Question
                    remainingTime={game.remainingTime}
                    question={game.question}
                    options={game.options}
                    answer={game.answer}
                    handleAnswerSelect={handleAnswerSelect}
                    lockAnswer={game.lockAnswer}
                />}
                
                {/* Explanation Phase */}
                {game.phase === "explanation" && <Explanation
                    options={game.options}
                    question={game.question}
                    correctAnswerIndex={game.correctAnswerIndex}
                    answer={game.answer}
                    explanation={game.explanation}
                    remainingTime={game.remainingTime}
                />}
                
                {/* Game Over - Single Player doesn't have leaderboard, so show final score */}
                {game.phase === "leaderboard" && (
                    <div className="p-6 bg-white shadow-sm rounded-lg border border-gray-100 text-center">
                        <h2 className="text-2xl font-bold mb-4">Game Over!</h2>
                        <div className="text-4xl font-bold text-blue-600 mb-2">{game.score} points</div>
                        <div className="text-gray-600 mb-6">
                            You answered {game.currentQuestion + 1} questions
                        </div>
                        <button
                            onClick={startSinglePlayerGame}
                            className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                        >
                            Play Again
                        </button>
                    </div>
                )}

                {/* Waiting Screen */}
                {!game.phase && !intro.showIntro && (
                    <div className="flex flex-col items-center justify-center p-8">
                        <div className="text-xl font-semibold mb-4">Ready to test your knowledge?</div>
                        <button
                            onClick={startSinglePlayerGame}
                            className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                        >
                            Start Game
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}