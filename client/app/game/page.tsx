"use client";

import {Button} from "@/components/ui/button";
import {CountryStrips} from "@/components/CountryStrips";
import {useGame} from "@/context/GameContext";
import NicknamePrompt from "@/components/NicknamePrompt";
import {useState, useEffect} from "react";
import {socket} from "@/socket";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { getCountryInfo } from "@/lib/countryFlags";
import {
    GlobalGameLeaderboardPlayer,
    GlobalGameOverMessage,
    GlobalGameTimerUpdateMessage,
    NextGlobalGameQuestionMessage,
    Player,
    RevealGlobalGameAnswerMessage
} from "@/lib/types";

export default function GamePage(){
    const { state, setGameCode } = useGame()
    const [phase, setPhase] = useState<"question" | "explanation" | "leaderboard" | null>()
    const [theme, setTheme] = useState("")
    const [difficulty, setDifficulty] = useState("")
    const [totalQuestions, setTotalQuestions] = useState(0)
    const [currentQuestion, setCurrentQuestion] = useState(0)
    const [question, setQuestion] = useState("")
    const [options, setOptions] = useState<string[]>([])
    const [remainingTime, setRemainingTime] = useState<number>()
    const [correctAnswerIndex, setCorrectAnswerIndex] = useState<number>()
    const [explanation, setExplanation] = useState("")
    const [answer, setAnswer] = useState("")
    const [lockAnswer, setLockAnswer] = useState(false)
    const [leaderBoard, setLeaderboard] = useState<GlobalGameLeaderboardPlayer[]>([])

    useEffect(() => {
        if (state.nickname) socket.emit("join global game")

        const handleConnect = () => {
            console.log("on connect: emitting join global game")
            if (state.nickname) socket.emit("join global game")
        }

        setGameCode("global game")

        const handlePlayerJoin = (player: Player) => {
            console.log(`${player.nickname} from ${player.country} joined global game`)
        }

        const nextQuestion = (msg: NextGlobalGameQuestionMessage) => {
            console.log("Next global game question", msg)
            setPhase("question")
            setTheme(msg.theme)
            setDifficulty(msg.difficulty)
            setCurrentQuestion(msg.questionIndex)
            setTotalQuestions(msg.totalQuestions)
            setQuestion(msg.question)
            setOptions(msg.options)
            setRemainingTime(msg.remainingTime)
            setAnswer("") // Reset answer for new question
            setLockAnswer(false) // Reset lock state
        }

        const revealAnswer = (msg: RevealGlobalGameAnswerMessage) => {
            console.log("Reveal global game answer", msg)
            setPhase("explanation")
            setTheme(msg.theme)
            setDifficulty(msg.difficulty)
            setCurrentQuestion(msg.questionIndex)
            setTotalQuestions(msg.totalQuestions)
            setQuestion(msg.question)
            setOptions(msg.options)
            setCorrectAnswerIndex(msg.correctAnswerIndex)
            setExplanation(msg.explanation)
            setLockAnswer(true) // Lock answer during explanation
        }

        const timerUpdate = (msg: GlobalGameTimerUpdateMessage) => {
            console.log("Global game timer update", msg)
            setRemainingTime(msg.remainingTime)
        }

        const gameOver = (msg: GlobalGameOverMessage) => {
            console.log("Global game over", msg)
            setPhase("leaderboard")
            setTheme(msg.theme)
            setDifficulty(msg.difficulty)
            setLeaderboard(msg.leaderboard)
        }

        socket.on("connect", handleConnect)

        socket.on("next global game question", nextQuestion)
        socket.on("global game timer update", timerUpdate)
        socket.on("reveal global game answer", revealAnswer)
        socket.on("global game over", gameOver)

        socket.on("player joined global game", handlePlayerJoin)

        return () => {
            socket.emit("leave global game")
            setGameCode(undefined)

            socket.off("connect", handleConnect)

            socket.off("next global game question", nextQuestion)
            socket.off("global game timer update", timerUpdate)
            socket.off("reveal global game answer", revealAnswer)
            socket.off("global game over", gameOver)

            socket.off("player joined global game", handlePlayerJoin)
        }
    }, [state.nickname])

    if (!state.nickname) {
        return <NicknamePrompt />
    }

    const handleAnswerSelect = (selectedIndex: number) => {
        if (answer !== "" || lockAnswer) return; // Already answered or locked
        setAnswer(options[selectedIndex]);
        socket.emit("submit global game answer", selectedIndex);
    };

    const handleLockAnswer = () => {
        if (answer === "" || lockAnswer) return;
        setLockAnswer(true);
    };

    const renderQuestionPhase = () => {
        return (
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <div className="text-sm font-medium text-gray-500">
                        Question {currentQuestion + 1}/{totalQuestions}
                    </div>
                    <div className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                        {theme}
                    </div>
                    <div className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm font-medium">
                        {difficulty}
                    </div>
                </div>

                <div className="relative w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                        className="absolute top-0 left-0 h-full bg-blue-500 transition-all duration-1000"
                        style={{ width: `${(remainingTime || 0) / 20 * 100}%` }}
                    ></div>
                </div>

                <div className="flex justify-between items-center">
                    <div className="text-sm font-medium text-gray-500">
                        Time remaining: {remainingTime}s
                    </div>
                </div>

                <div className="p-6 bg-white shadow-sm rounded-lg border border-gray-100">
                    <h2 className="text-xl font-semibold mb-6">{question}</h2>

                    <div className="space-y-3">
                        {options.map((option, index) => (
                            <button
                                key={index}
                                onClick={() => handleAnswerSelect(index)}
                                disabled={answer !== "" || lockAnswer}
                                className={`w-full p-4 text-left rounded-lg transition-colors ${answer === option
                                    ? 'bg-blue-100 border-2 border-blue-500'
                                    : 'bg-gray-50 hover:bg-gray-100 border border-gray-200'}
                                    ${answer !== "" && answer !== option ? 'opacity-60' : ''}`}
                            >
                                {option}
                            </button>
                        ))}
                    </div>

                    {answer && !lockAnswer && (
                        <div className="mt-4 flex justify-end">
                            <Button
                                onClick={handleLockAnswer}
                                className="bg-green-600 hover:bg-green-700 text-white"
                            >
                                Lock Answer
                            </Button>
                        </div>
                    )}

                    {lockAnswer && answer && (
                        <div className="mt-4 p-3 bg-gray-100 rounded-lg text-center text-gray-700">
                            Your answer has been locked in
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const renderExplanationPhase = () => {
        const isCorrect = options[correctAnswerIndex!] === answer;

        return (
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <div className="text-sm font-medium text-gray-500">
                        Question {currentQuestion + 1}/{totalQuestions}
                    </div>
                    <div className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                        {theme}
                    </div>
                    <div className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm font-medium">
                        {difficulty}
                    </div>
                </div>

                <div className="p-6 bg-white shadow-sm rounded-lg border border-gray-100">
                    <h2 className="text-xl font-semibold mb-4">{question}</h2>

                    <div className="space-y-3 mb-6">
                        {options.map((option, index) => (
                            <div
                                key={index}
                                className={`w-full p-4 text-left rounded-lg ${index === correctAnswerIndex
                                    ? 'bg-green-100 border-2 border-green-500'
                                    : answer === option && index !== correctAnswerIndex
                                    ? 'bg-red-100 border-2 border-red-500'
                                    : 'bg-gray-50 border border-gray-200'}`}
                            >
                                {option}
                            </div>
                        ))}
                    </div>

                    <div className={`p-4 rounded-lg mb-4 ${isCorrect ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                        <div className={`text-lg font-semibold ${isCorrect ? 'text-green-700' : 'text-red-700'}`}>
                            {isCorrect ? '✓ Correct!' : '✗ Incorrect!'}
                        </div>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                        <div className="text-sm font-semibold text-gray-700 mb-2">Explanation:</div>
                        <div className="text-gray-700">{explanation}</div>
                    </div>
                </div>

                <div className="flex justify-center mt-4">
                    <div className="text-gray-600">
                        Proceeding to next question...
                    </div>
                </div>
            </div>
        );
    };

    const renderLeaderboardPhase = () => {
        return (
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <div className="text-xl font-semibold">Leaderboard</div>
                    <div className="flex space-x-2">
                        <div className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                            {theme}
                        </div>
                        <div className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm font-medium">
                            {difficulty}
                        </div>
                    </div>
                </div>

                <div className="p-6 bg-white shadow-sm rounded-lg border border-gray-100">
                    <div className="space-y-3">
                        {leaderBoard.map((player, index) => (
                            <div key={index} className="flex items-center p-3 bg-gray-50 rounded-lg border border-gray-200">
                                <div className="flex-none w-8 h-8 flex items-center justify-center font-semibold">
                                    {index + 1}
                                </div>
                                <div className="ml-3 flex-grow flex items-center">
                                    <div className="font-medium">{player.nickname}</div>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <div className="ml-2 cursor-pointer">
                                                {getCountryInfo(player.country).flag}
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent side="top" className="bg-black/90 text-white px-3 py-1.5 rounded-md text-xs">
                                            {getCountryInfo(player.country).name}
                                        </TooltipContent>
                                    </Tooltip>
                                </div>
                                <div className="flex-none font-semibold text-blue-600">
                                    {player.score} pts
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex justify-center mt-4">
                    <div className="text-gray-600 animate-pulse">
                        Loading new game...
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="p-4 sm:p-6 md:p-8 min-h-screen bg-slate-50">
            <div className="max-w-3xl mx-auto p-4">
                <div className="mb-6">
                    <CountryStrips countryData={state.players} maxStrips={3} />
                </div>

                {phase === "question" && renderQuestionPhase()}
                {phase === "explanation" && renderExplanationPhase()}
                {phase === "leaderboard" && renderLeaderboardPhase()}

                {!phase && (
                    <div className="flex flex-col items-center justify-center p-8">
                        <div className="text-xl font-semibold mb-2">Waiting for game to start...</div>
                        <div className="text-gray-600">You&apos;ll be automatically added to the next game</div>
                    </div>
                )}
            </div>
        </div>
    )
}