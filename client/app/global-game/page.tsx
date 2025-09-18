"use client";

import {CountryStrips} from "@/components/CountryStrips";
import {useGame} from "@/context/GameContext";
import NicknamePrompt from "@/components/NicknamePrompt";
import {useEffect} from "react";
import {socket} from "@/socket";
import {useQuizGame} from "@/hooks/useQuizGame";
import {useGameIntro} from "@/hooks/useGameIntro";
import {
    GlobalGameStarted,
    GlobalGameOverMessage,
    GlobalGameTimerUpdateMessage,
    NextGlobalGameQuestionMessage,
    Player,
    UpdateGlobalGameScoreMessage,
    RevealGlobalGameAnswerMessage
} from "@/lib/types";
import Question from "@/components/quiz/Question";
import Explanation from "@/components/quiz/Explanation";
import Intro from "@/components/quiz/Intro";
import Leaderboard from "@/components/quiz/Leaderboard";
import Header from "@/components/quiz/Header";
import WaitingScreen from "@/components/quiz/WaitingScreen";

export default function GamePage(){
    const { state, setGameCode } = useGame()
    const game = useQuizGame();
    const intro = useGameIntro();

    useEffect(() => {
        if (!state.isRegistered) return

        setGameCode("global game")

        socket.emit("join global game")

        const handleConnect = () => {
            console.log("on connect: emitting join global game")
            if (state.isRegistered) socket.emit("join global game")
        }

        const handlePlayerJoin = (player: Player) => {
            console.log(`${player.nickname} from ${player.country} joined global game`)
        }

        const startGame = (msg: GlobalGameStarted) => {
            console.log("Global game started", msg)
            game.setTheme(msg.theme)
            game.setDifficulty(msg.difficulty)
            game.setScore(0)
            
            // Trigger intro animation
            intro.startIntro(msg.theme, msg.difficulty)
        }

        const nextQuestion = (msg: NextGlobalGameQuestionMessage) => {
            console.log("Next global game question", msg)
            game.setQuestionData(msg)
        }

        const revealAnswer = (msg: RevealGlobalGameAnswerMessage) => {
            console.log("Reveal global game answer", msg)
            game.setExplanationData(msg)
        }

        const updateScore = (msg: UpdateGlobalGameScoreMessage) => {
            console.log("Update global game score", msg)
            game.setScore(msg.score)
        }

        const timerUpdate = (msg: GlobalGameTimerUpdateMessage) => {
            console.log("Global game timer update", msg)
            game.setRemainingTime(msg.remainingTime)
        }

        const gameOver = (msg: GlobalGameOverMessage) => {
            console.log("Global game over", msg)
            game.setPhase("leaderboard")
            game.setTheme(msg.theme)
            game.setDifficulty(msg.difficulty)
            game.setLeaderBoard(msg.leaderboard)
            game.setRemainingTime(msg.remainingTime)
        }

        socket.on("connect", handleConnect)

        socket.on("global game started", startGame)
        socket.on("next global game question", nextQuestion)
        socket.on("global game timer update", timerUpdate)
        socket.on("reveal global game answer", revealAnswer)
        socket.on("update global game score", updateScore)
        socket.on("global game over", gameOver)

        socket.on("player joined global game", handlePlayerJoin)

        return () => {
            socket.emit("leave global game")

            socket.off("connect", handleConnect)

            socket.off("next global game question", nextQuestion)
            socket.off("global game timer update", timerUpdate)
            socket.off("reveal global game answer", revealAnswer)
            socket.off("update global game score", updateScore)
            socket.off("global game over", gameOver)

            socket.off("player joined global game", handlePlayerJoin)
        }
    }, [state.isRegistered])

    if (!state.isRegistered) {
        return <NicknamePrompt />
    }

    const handleAnswerSelect = (selectedIndex: number) => {
        if (game.lockAnswer) return; // Already answered or locked
        game.setAnswer(game.options[selectedIndex]);
        socket.emit("submit global game answer", selectedIndex);
    }

    return (
        <div className="p-4 sm:p-6 md:p-8 min-h-screen bg-slate-50">
            <div className="max-w-3xl mx-auto p-4">
                <div className="mb-6">
                    <CountryStrips countryData={state.players} maxStrips={3} />
                </div>

                {intro.showIntro && <Intro animationComplete={intro.introAnimationComplete} theme={intro.introTheme} difficulty={intro.introDifficulty} />}

                {game.phase && <Header
                    phase={game.phase}
                    currentQuestion={game.currentQuestion}
                    totalQuestions={game.totalQuestions}
                    theme={game.theme}
                    difficulty={game.difficulty}
                    score={game.score}
                />}

                {game.phase === "question" && <Question
                    remainingTime={game.remainingTime}
                    question={game.question}
                    options={game.options}
                    answer={game.answer}
                    handleAnswerSelect={handleAnswerSelect}
                    lockAnswer={game.lockAnswer}
                />}
                {game.phase === "explanation" && <Explanation
                    options={game.options}
                    question={game.question}
                    correctAnswerIndex={game.correctAnswerIndex}
                    answer={game.answer}
                    explanation={game.explanation}
                    remainingTime={game.remainingTime}
                />}
                {game.phase === "leaderboard" && <Leaderboard
                    leaderBoard={game.leaderBoard}
                    remainingTime={game.remainingTime}
                />}

                {!game.phase && <WaitingScreen remainingTime={game.remainingTime} />}
            </div>
        </div>
    )
}