"use client"

import {useGame} from "@/context/GameContext";
import {useEffect, useRef, useState} from "react";
import NicknamePrompt from "@/components/NicknamePrompt";
import Button from "@/components/Button";
import CircularButton from "@/components/CircularButton";
import {User} from "lucide-react";
import {SingleGameQuestion} from "@/lib/types";
import {loadingActions} from "@/lib/constants";
import confetti from "canvas-confetti";
import {useHostCommunication} from "@/hooks/useHostCommunication";

export default function SinglePlayer() {
    const {state} = useGame()
    const [selectedAnswerIndex, setSelectedAnswerIndex] = useState<number | null>(null)
    const [questions, setQuestions] = useState<SingleGameQuestion[]>([])
    const [totalTime, setTotalTime] = useState<number | null>(null)
    const [remainingTime, setRemainingTime] = useState<number | null>(null)
    const timerRef = useRef<NodeJS.Timeout | null>(null)
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number | null>(null)
    const [finalAnswerBtnSelected, setFinalAnswerBtnSelected] = useState(false)
    const [conversationHistory, setConversationHistory] = useState<{role: string, content: string}[]>([])
    const [hostMessage, setHostMessage] = useState<string>("")
    const hostMessageTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    const { sendAction } = useHostCommunication({ conversationHistory, setConversationHistory })

    // Loading state
    const [isLoading, setIsLoading] = useState(true)
    const [loadingAction, setLoadingAction] = useState("")
    const loadingIntervalRef = useRef<NodeJS.Timeout | null>(null)
    const [confettiBtnSelected, setConfettiBtnSelected] = useState(false)
    const confettiBtnTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    useEffect(() => {
        startGame()
        startLoadingSequence()

        return () => {
            if (timerRef.current) clearInterval(timerRef.current)
            if (loadingIntervalRef.current) clearInterval(loadingIntervalRef.current)
            if (confettiBtnTimeoutRef.current) clearTimeout(confettiBtnTimeoutRef.current)
            if (hostMessageTimeoutRef.current) clearTimeout(hostMessageTimeoutRef.current)
        }
    }, [])

    async function startGame() {
        const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/gemini`)
        const data = await response.json()
        if (loadingIntervalRef.current) clearInterval(loadingIntervalRef.current)
        setIsLoading(false)
        setQuestions(data.questions)
        setCurrentQuestionIndex(0)
        countdown(30, () => console.log('countdown done'))
    }

    function countdown(seconds: number, callback: () => void){
        if (timerRef.current) {
            clearInterval(timerRef.current)
        }

        setTotalTime(seconds)
        setRemainingTime(seconds)
        timerRef.current = setInterval(() => {
            setRemainingTime(prev => {
                const newTime = prev! - 1
                if (newTime < 0) {
                    if (timerRef.current) clearInterval(timerRef.current)
                    callback()
                    return 0
                }
                return newTime
            })
        }, 1000)
    }

    function handleAnswerSelect(selectedIndex: number) {
        setSelectedAnswerIndex(selectedIndex)
    }

    async function confirmFinalAnswer() {
        setFinalAnswerBtnSelected(true)
        if (timerRef.current) clearInterval(timerRef.current)

        const currentQuestion = questions[currentQuestionIndex!]
        const selectedAnswer = currentQuestion.options[selectedAnswerIndex!]

        const hostResponse = await sendAction(
            `Player selected answer: ${selectedAnswer}. Final answer confirmed.`,
            currentQuestion,
            currentQuestionIndex!,
            remainingTime
        )

        if (hostResponse) {
            // Split by delimiter and display segments with pauses
            const segments = hostResponse.split('|||').map(s => s.trim())
            displayHostMessageSegments(segments)
        } else {
            // Skip host talk on error, reveal answer immediately
            revealAnswer()
        }
    }

    function displayHostMessageSegments(segments: string[]) {
        let index = 0
        setHostMessage(segments[0])

        const displayNext = () => {
            index++
            if (index < segments.length) {
                setHostMessage(prev => prev + ' ' + segments[index])
                hostMessageTimeoutRef.current = setTimeout(displayNext, 1500)
            } else {
                // All segments displayed, now reveal answer
                hostMessageTimeoutRef.current = setTimeout(revealAnswer, 2000)
            }
        }

        if (segments.length > 1) {
            hostMessageTimeoutRef.current = setTimeout(displayNext, 1500)
        } else {
            // Only one segment, reveal answer after short delay
            hostMessageTimeoutRef.current = setTimeout(revealAnswer, 2000)
        }
    }

    function revealAnswer() {
        // TODO: Implement answer reveal logic
        console.log('Revealing answer...')
    }

    function startLoadingSequence() {
        const getRandomAction = () => {
            const randomIndex = Math.floor(Math.random() * loadingActions.length)
            return loadingActions[randomIndex]
        }

        setLoadingAction(getRandomAction())

        loadingIntervalRef.current = setInterval(() => {
            setLoadingAction(getRandomAction())
        }, Math.random() * 2000 + 3000)
    }

    function triggerConfetti() {
        if (confettiBtnTimeoutRef.current)
            clearInterval(confettiBtnTimeoutRef.current)

        setConfettiBtnSelected(true)
        confetti({
            particleCount: 100,
            spread: 70
        })
        confettiBtnTimeoutRef.current = setTimeout(() => {
            if (confettiBtnTimeoutRef.current)
                clearInterval(confettiBtnTimeoutRef.current)
            setConfettiBtnSelected(false)
        }, 500)
    }

    if (!state.isRegistered) {
        return <NicknamePrompt/>
    }

    if (isLoading) {
        return (
            <div className="min-h-screen grid grid-cols-3 grid-rows-3">
                <div className="col-start-2 row-start-1 flex flex-col items-center justify-end">
                    <h2 className=" text-lg sm:text-xl md:text-2xl font-semibold text-center">
                        Loading...
                    </h2>
                    <div className="text-sm text-center min-h-[60px] flex items-center">
                        {loadingAction}
                    </div>
                </div>

                <div className="col-start-2 row-start-2 flex items-center justify-center">
                    <CircularButton onClick={triggerConfetti} selected={confettiBtnSelected}>
                        Confetti!
                    </CircularButton>
                </div>
            </div>
        )
    }

    const timerPercentage = remainingTime !== null && totalTime !== null ? (remainingTime / totalTime) * 100 : 100
    const showGrid = false
    const showConversationHistory = false

    return (
        <div className="min-h-screen flex"
             style={showGrid ? {
                 backgroundImage: 'linear-gradient(rgba(0, 0, 0, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 0, 0, 0.1) 1px, transparent 1px)',
                 backgroundSize: '8px 8px'
             } : {}}>
            {/* Conversation History Sidebar */}
            {showConversationHistory && <div className="w-64 border-r border-border p-4 overflow-y-auto bg-background">
                <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Conversation History</h3>
                <div className="space-y-2">
                    {conversationHistory.map((msg, index) => (
                        <div key={index} className={`p-2 rounded text-xs ${
                            msg.role === 'player'
                                ? 'bg-primary/10 text-primary'
                                : 'bg-secondary text-foreground'
                        }`}>
                            <div className="font-semibold mb-1 capitalize">{msg.role}:</div>
                            <div className="text-foreground/80">{msg.content}</div>
                        </div>
                    ))}
                    {conversationHistory.length === 0 && (
                        <div className="text-xs text-muted-foreground italic">No messages yet</div>
                    )}
                </div>
            </div>}

            {/* Main Game Area */}
            <div className="flex-1 p-3 sm:p-4 md:p-6 lg:p-8 mx-auto w-full max-w-sm sm:max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl">
                <div className="w-full h-2 bg-secondary relative">
                    <div
                        className="h-full bg-primary transition-all duration-1000 ease-linear"
                        style={{width: `${timerPercentage}%`}}
                    />
                </div>
                <h2 className="py-3 sm:py-4 text-lg sm:text-xl md:text-2xl font-semibold">
                    {questions[currentQuestionIndex!].question}
                </h2>
                <div className="grid grid-cols-2 gap-3 mb-4 sm:mb-6">
                    <Button
                        selected={selectedAnswerIndex === 0}
                        onClick={() => handleAnswerSelect(0)}
                    >
                        A: {questions[currentQuestionIndex!].options[0]}
                    </Button>
                    <Button
                        selected={selectedAnswerIndex === 1}
                        onClick={() => handleAnswerSelect(1)}
                    >
                        B: {questions[currentQuestionIndex!].options[1]}
                    </Button>
                    <Button
                        selected={selectedAnswerIndex === 2}
                        onClick={() => handleAnswerSelect(2)}
                    >
                        C: {questions[currentQuestionIndex!].options[2]}
                    </Button>
                    <Button
                        selected={selectedAnswerIndex === 3}
                        onClick={() => handleAnswerSelect(3)}
                    >
                        D: {questions[currentQuestionIndex!].options[3]}
                    </Button>
                </div>

                {selectedAnswerIndex != null && <div className="flex items-center justify-between mb-4 sm:mb-6">
                    <div className="px-3 py-2 text-sm font-medium">
                        Is this your final answer?
                    </div>
                    <CircularButton onClick={confirmFinalAnswer} selected={finalAnswerBtnSelected}>
                        YES
                    </CircularButton>
                </div>}

                <div className="flex justify-between gap-2 sm:gap-4 mb-4 sm:mb-6">
                    <Button
                        className="flex-1 sm:w-32 md:w-36 mb-2"
                        onClick={() => {
                        }}
                    >
                        50:50
                    </Button>
                    <Button
                        className="flex-1 sm:w-36 md:w-40 mb-2"
                        icon={<User size={16}/>}
                        onClick={() => {
                        }}
                    >
                        Ask the host
                    </Button>
                </div>

                {hostMessage && <div className="mb-4 sm:mb-6 text-xs sm:text-sm text-foreground">
                    <span className="font-semibold">Host:</span> {hostMessage}
                </div>}

                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-1 sm:gap-2">
                    {[500, 1000, 2000, 3000, 5000, 7000, 10000, 20000, 30000, 50000, 100000, 250000, 500000, 1000000].map((amount, index) => (
                        <div
                            key={amount}
                            className={`
                            h-8 sm:h-10 md:h-12 flex items-center justify-center text-[10px] sm:text-xs md:text-sm font-medium px-1
                            ${index < 2 ? 'bg-muted-foreground text-white' : 'bg-secondary text-foreground'}
                        `}
                        >
                            {amount.toLocaleString()}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}