"use client";

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
import { AnimatedScore } from "@/components/AnimatedScore";
import {
    GlobalGameStarted,
    GlobalGameLeaderboardPlayer,
    GlobalGameOverMessage,
    GlobalGameTimerUpdateMessage,
    NextGlobalGameQuestionMessage,
    Player,
    UpdateGlobalGameScoreMessage,
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
    const [score, setScore] = useState(0)

    const [showIntro, setShowIntro] = useState(false)
    const [introAnimationComplete, setIntroAnimationComplete] = useState(false)
    const [introTheme, setIntroTheme] = useState("")
    const [introDifficulty, setIntroDifficulty] = useState("")

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
            setTheme(msg.theme)
            setDifficulty(msg.difficulty)
            setScore(0)
            
            // Trigger intro animation
            setIntroTheme(msg.theme)
            setIntroDifficulty(msg.difficulty)
            setShowIntro(true)
            setIntroAnimationComplete(false)

            setTimeout(() => {
                setIntroAnimationComplete(true)

                setTimeout(() => {
                    setShowIntro(false)
                }, 1000)
            }, 2000)
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
            setAnswer("")
            setLockAnswer(false)
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
            setRemainingTime(msg.remainingTime)
            setLockAnswer(true)
        }

        const updateScore = (msg: UpdateGlobalGameScoreMessage) => {
            console.log("Update global game score", msg)
            setScore(msg.score)
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
            setRemainingTime(msg.remainingTime)
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
        if (lockAnswer) return; // Already answered or locked
        setAnswer(options[selectedIndex]);
        socket.emit("submit global game answer", selectedIndex);
    }

    const renderQuestionPhase = () => {
        return (
            <div className="space-y-6">

                <div className="relative w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                        className="absolute top-0 left-0 h-full bg-blue-500 transition-all duration-1000"
                        style={{ width: `${(remainingTime || 0) / 15 * 100}%` }}
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
                                disabled={lockAnswer}
                                className={`w-full p-4 text-left rounded-lg transition-colors ${answer === option
                                    ? 'bg-blue-100 border-2 border-blue-500'
                                    : 'bg-gray-50 hover:bg-gray-100 border border-gray-200'}
                                    ${answer !== "" && answer !== option ? 'opacity-60' : ''}`}
                            >
                                {option}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        );
    };

    const renderExplanationPhase = () => {
        const isCorrect = options[correctAnswerIndex!] === answer;

        return (
            <div className="space-y-6">

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
                        Proceeding to next question in {remainingTime}s...
                    </div>
                </div>
            </div>
        );
    };

    const renderLeaderboardPhase = () => {
        return (
            <div className="space-y-6">

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
                        Loading new game in {remainingTime}s...
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
                
                {/* Game Intro Animation */}
                {showIntro && (
                    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/50 backdrop-blur-sm">
                        <div 
                            className={`
                                flex flex-col items-center gap-5 p-10 bg-white rounded-xl shadow-xl 
                                transition-all duration-1000 ease-in-out transform
                                ${introAnimationComplete ? 'scale-0 opacity-0' : 'scale-100 opacity-100'}
                            `}
                        >
                            <h2 className="text-3xl font-bold text-gray-900">Get Ready!</h2>
                            
                            <div className="flex flex-col items-center gap-6 my-8">
                                <div className="px-6 py-3 bg-blue-100 text-blue-800 rounded-full text-2xl font-bold">
                                    {introTheme}
                                </div>
                                
                                <div className="px-6 py-3 bg-purple-100 text-purple-800 rounded-full text-2xl font-bold">
                                    {introDifficulty}
                                </div>
                            </div>
                            
                            <div className="text-lg text-gray-600 animate-pulse">
                                Game starting...
                            </div>
                        </div>
                    </div>
                )}

                {phase && (
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex items-center space-x-2">
                            {phase !== "leaderboard" && (
                                <div className="text-sm font-medium text-gray-500">
                                    Question {currentQuestion + 1}/{totalQuestions}
                                </div>
                            )}
                            {phase === "leaderboard" && (
                                <div className="text-xl font-semibold">Leaderboard</div>
                            )}
                            <div className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                                {theme}
                            </div>
                            <div className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm font-medium">
                                {difficulty}
                            </div>
                        </div>
                        <div className="flex items-center px-3 py-1 bg-amber-50 border border-amber-200 rounded-md">
                            <span className="text-xs font-medium text-amber-700 mr-2">
                                {phase === "leaderboard" ? "YOUR SCORE" : "SCORE"}
                            </span>
                            <AnimatedScore score={score} className="text-amber-600" />
                        </div>
                    </div>
                )}

                {phase === "question" && renderQuestionPhase()}
                {phase === "explanation" && renderExplanationPhase()}
                {phase === "leaderboard" && renderLeaderboardPhase()}

                {!phase && (
                    <div className="flex flex-col items-center justify-center p-8">
                        <div className="text-xl font-semibold mb-2">Waiting for game to start in {remainingTime}s...</div>
                        <div className="text-gray-600 mb-4">You&apos;ll be automatically added to the next game</div>
                    </div>
                )}
            </div>
        </div>
    )
}