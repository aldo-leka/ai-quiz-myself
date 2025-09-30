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
import {clearTimeout} from "node:timers";

export default function SinglePlayer() {
    const {state} = useGame()
    const [selectedAnswerIndex, setSelectedAnswerIndex] = useState<number | null>(null)
    const [questions, setQuestions] = useState<SingleGameQuestion[]>([])
    const [totalTime, setTotalTime] = useState<number | null>(null)
    const [remainingTime, setRemainingTime] = useState<number | null>(null)
    const intervalRef = useRef<NodeJS.Timeout | null>(null)
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number | null>(null)

    // Loading state
    const [isLoading, setIsLoading] = useState(true)
    const [loadingAction, setLoadingAction] = useState("")
    const loadingIntervalRef = useRef<NodeJS.Timeout | null>(null)
    const [confettiBtnSelected, setConfettiBtnSelected] = useState(false)
    const confettiBtnTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    useEffect(() => {
        startGame()
        startLoadingActions()

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current)
            if (loadingIntervalRef.current) clearInterval(loadingIntervalRef.current)
            if (confettiBtnTimeoutRef.current) clearTimeout(confettiBtnTimeoutRef.current)
        }
    }, [])

    function startLoadingActions() {
        const getRandomAction = () => {
            const randomIndex = Math.floor(Math.random() * loadingActions.length)
            return loadingActions[randomIndex]
        }

        setLoadingAction(getRandomAction())

        loadingIntervalRef.current = setInterval(() => {
            setLoadingAction(getRandomAction())
        }, Math.random() * 2000 + 3000)
    }

    async function startGame() {
        const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/gemini`)
        const data = await response.json()
        if (loadingIntervalRef.current) clearInterval(loadingIntervalRef.current)
        setIsLoading(false)
        setQuestions(data.questions)
        setCurrentQuestionIndex(0)
        countdown(30, () => console.log('countdown done'))
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

    function countdown(seconds: number, callback: () => void){
        if (intervalRef.current) {
            clearInterval(intervalRef.current)
        }

        setTotalTime(seconds)
        setRemainingTime(seconds)
        intervalRef.current = setInterval(() => {
            setRemainingTime(prev => {
                const newTime = prev! - 1
                if (newTime < 0) {
                    if (intervalRef.current) clearInterval(intervalRef.current)
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

    return (
        <div className="min-h-screen"
             style={showGrid ? {
                 backgroundImage: 'linear-gradient(rgba(0, 0, 0, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 0, 0, 0.1) 1px, transparent 1px)',
                 backgroundSize: '8px 8px'
             } : {}}>
            <div className="p-3 sm:p-4 md:p-6 lg:p-8 mx-auto w-full max-w-sm sm:max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl">
                <div className="w-full h-2 bg-secondary relative">
                    <div
                        className="h-full bg-primary transition-all duration-1000 ease-linear"
                        style={{width: `${timerPercentage}%`}}
                    />
                </div>
                <h2 className="py-3 sm:py-4 text-lg sm:text-xl md:text-2xl font-semibold">
                    {questions[currentQuestionIndex!].question}
                </h2>
                <Button
                    className="w-full mb-1 sm:mb-2"
                    selected={selectedAnswerIndex === 0}
                    onClick={() => handleAnswerSelect(0)}
                >
                    A: It is a mutable, ordered collection.
                </Button>
                <Button
                    className="w-full mb-1 sm:mb-2"
                    selected={selectedAnswerIndex === 1}
                    onClick={() => handleAnswerSelect(1)}
                >
                    B: It is an immutable, unordered collection.
                </Button>
                <Button
                    className="w-full mb-1 sm:mb-2"
                    selected={selectedAnswerIndex === 2}
                    onClick={() => handleAnswerSelect(2)}
                >
                    C: It is a key-value mapping.
                </Button>
                <Button
                    className="w-full mb-4 sm:mb-6"
                    selected={selectedAnswerIndex === 3}
                    onClick={() => handleAnswerSelect(3)}
                >
                    D: It is a sequence of characters only.
                </Button>

                <div className="flex items-center justify-between mb-4 sm:mb-6">
                    <div className="px-3 py-2 text-sm font-medium">
                        Is this your final answer?
                    </div>
                    <CircularButton selected>
                        YES
                    </CircularButton>
                </div>

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

                <div className="mb-4 sm:mb-6 text-xs sm:text-sm text-foreground">
                    <span className="font-semibold">Host:</span> So, you&apos;re going with D... Since it&apos;s in the
                    easy category, I must tell you that lists can...
                </div>

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