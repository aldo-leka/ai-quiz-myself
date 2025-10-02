"use client"

import {useGame} from "@/context/GameContext";
import {useEffect, useRef, useState} from "react";
import NicknamePrompt from "@/components/NicknamePrompt";
import Button from "@/components/Button";
import CircularButton from "@/components/CircularButton";
import {User} from "lucide-react";
import {SingleGameQuestion} from "@/lib/types";
import {GAME_LENGTH, LOADING_ACTIONS, MONEY_LADDER, OPTION_REVEAL_DELAY, OPTION_CUE_FALLBACK_TIMEOUT, CHECKPOINTS} from "@/lib/constants";
import confetti from "canvas-confetti";
import {useHostCommunication} from "@/hooks/useHostCommunication";
import HostMessage from "@/components/HostMessage";

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
    const [hostMessageOnComplete, setHostMessageOnComplete] = useState<(() => void) | undefined>(undefined)
    const hostMessageTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const [visibleOptions, setVisibleOptions] = useState<number>(0)
    const optionsTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const fallbackTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const optionCuesDetectedRef = useRef<boolean>(false)
    const [usedLifelines, setUsedLifelines] = useState({
        fiftyFifty: false,
        askHost: false
    })
    const [optionsDisabled, setOptionsDisabled] = useState(true)
    const [eliminatedOptions, setEliminatedOptions] = useState<number[]>([])
    const [revealedAnswer, setRevealedAnswer] = useState(false)
    const [correctAnswerIndex, setCorrectAnswerIndex] = useState<number | null>(null)

    const { sendAction } = useHostCommunication({ conversationHistory, setConversationHistory })

    // Loading state
    const [isLoading, setIsLoading] = useState(true)
    const [loadingAction, setLoadingAction] = useState("")
    const loadingIntervalRef = useRef<NodeJS.Timeout | null>(null)
    const [confettiBtnSelected, setConfettiBtnSelected] = useState(false)
    const confettiBtnTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    // Game state
    const [gameState, setGameState] = useState<'welcome' | 'playing' | 'finished'>('welcome')

    useEffect(() => {
        startGame()
        startLoadingSequence()

        return () => {
            if (timerRef.current) clearInterval(timerRef.current)
            if (loadingIntervalRef.current) clearInterval(loadingIntervalRef.current)
            if (confettiBtnTimeoutRef.current) clearTimeout(confettiBtnTimeoutRef.current)
            if (hostMessageTimeoutRef.current) clearTimeout(hostMessageTimeoutRef.current)
            if (optionsTimeoutRef.current) clearTimeout(optionsTimeoutRef.current)
            if (fallbackTimeoutRef.current) clearTimeout(fallbackTimeoutRef.current)
        }
    }, [])

    async function startGame() {
        const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/gemini`)
        const data = await response.json()
        if (loadingIntervalRef.current) clearInterval(loadingIntervalRef.current)
        setIsLoading(false)
        setQuestions(data.questions)
        setCurrentQuestionIndex(0)
        setSelectedAnswerIndex(null)
        setFinalAnswerBtnSelected(false)
        setRevealedAnswer(false)
        setCorrectAnswerIndex(null)
        setOptionsDisabled(true)
        setVisibleOptions(0)
        optionCuesDetectedRef.current = false

        await welcomePlayer(data.questions)
    }

    async function welcomePlayer(gameQuestions: SingleGameQuestion[]) {
        const nickname = localStorage.getItem("nickname") || ""
        const hostResponse = await sendAction({
            actionType: 'WELCOME',
            action: 'Player has entered the game',
            currentQuestionIndex: 0,
            additionalData: {
                contestantName: nickname
            }
        })

        if (hostResponse) {
            setHostMessage(hostResponse)
            setHostMessageOnComplete(() => () => beginFirstQuestion(gameQuestions))
        } else {
            // Host unresponsive, proceed without welcome
            beginFirstQuestion(gameQuestions)
        }
    }

    async function beginFirstQuestion(gameQuestions: SingleGameQuestion[]) {
        setGameState('playing')
        setOptionsDisabled(true)
        setSelectedAnswerIndex(null)
        setEliminatedOptions([])
        setVisibleOptions(0)
        optionCuesDetectedRef.current = false

        const hostResponse = await sendAction({
            actionType: 'BEGIN_QUESTION',
            action: 'Presenting the first question',
            currentQuestion: gameQuestions[0],
            currentQuestionIndex: 0,
            remainingTime: 30
        })

        if (hostResponse) {
            setHostMessage(hostResponse)
            setHostMessageOnComplete(() => () => {
                // After host finishes narrating, enable options if all revealed
                if (visibleOptions >= 4) {
                    setOptionsDisabled(false)
                    countdown(GAME_LENGTH, () => console.log('countdown done'))
                }
            })

            // Start fallback timer - if no option cues detected within timeout, reveal automatically
            fallbackTimeoutRef.current = setTimeout(() => {
                if (!optionCuesDetectedRef.current) {
                    console.log('[SinglePlayer] No option cues detected, falling back to automatic reveal')
                    revealOptionsFallback()
                }
            }, OPTION_CUE_FALLBACK_TIMEOUT)
        } else {
            // Host unresponsive, proceed with fallback
            revealOptionsFallback()
        }
    }

    // Fallback: reveal options on a timer
    function revealOptionsFallback() {
        console.log('[SinglePlayer] Using fallback option reveal')
        setVisibleOptions(0)
        setOptionsDisabled(true)
        let currentOption = 0

        const revealNext = () => {
            currentOption++
            setVisibleOptions(currentOption)
            if (currentOption < 4) {
                optionsTimeoutRef.current = setTimeout(revealNext, OPTION_REVEAL_DELAY)
            } else {
                // All options revealed, enable buttons and start countdown
                setOptionsDisabled(false)
                countdown(GAME_LENGTH, () => console.log('countdown done'))
            }
        }

        optionsTimeoutRef.current = setTimeout(revealNext, OPTION_REVEAL_DELAY)
    }

    // Handle option cue from host narration
    function handleOptionCue(option: 'A' | 'B' | 'C' | 'D') {
        console.log('[SinglePlayer] Option cue received:', option)
        optionCuesDetectedRef.current = true

        // Clear fallback timer since we detected a cue
        if (fallbackTimeoutRef.current) {
            clearTimeout(fallbackTimeoutRef.current)
            fallbackTimeoutRef.current = null
        }

        const optionIndex = option.charCodeAt(0) - 'A'.charCodeAt(0) + 1
        setVisibleOptions(prev => Math.max(prev, optionIndex))

        // If all options revealed, enable buttons and start countdown
        if (optionIndex >= 4) {
            setOptionsDisabled(false)
            if (timerRef.current === null) {
                countdown(GAME_LENGTH, () => console.log('countdown done'))
            }
        }
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

    async function handleFiftyFifty() {
        setUsedLifelines(prev => ({ ...prev, fiftyFifty: true }))

        const currentQuestion = questions[currentQuestionIndex!]
        const correctAnswerIndex = currentQuestion.options.indexOf(currentQuestion.correctAnswer)

        // Get all incorrect answer indices
        const incorrectIndices = [0, 1, 2, 3].filter(i => i !== correctAnswerIndex)

        // Randomly select 2 incorrect answers to eliminate
        const shuffled = incorrectIndices.sort(() => Math.random() - 0.5)
        const toEliminate = shuffled.slice(0, 2)

        setEliminatedOptions(toEliminate)

        // Prepare remaining options for the host (correct answer + 1 wrong answer)
        const remainingIndices = [0, 1, 2, 3].filter(i => !toEliminate.includes(i))
        const remainingOptions = remainingIndices.map(i => `${String.fromCharCode(65 + i)}: ${currentQuestion.options[i]}`)

        const hostResponse = await sendAction({
            actionType: 'LIFELINE_5050',
            action: 'Player used 50:50 lifeline',
            currentQuestion,
            currentQuestionIndex: currentQuestionIndex!,
            remainingTime,
            additionalData: {
                remainingOptions
            }
        })

        if (hostResponse) {
            setHostMessage(hostResponse)
        }
    }

    async function handleAskHost() {
        setUsedLifelines(prev => ({ ...prev, askHost: true }))

        const currentQuestion = questions[currentQuestionIndex!]

        // If 50:50 was used, only show the host the remaining options
        let remainingOptionsForHost
        if (eliminatedOptions.length > 0) {
            const remainingIndices = [0, 1, 2, 3].filter(i => !eliminatedOptions.includes(i))
            remainingOptionsForHost = remainingIndices.map(i => `${String.fromCharCode(65 + i)}: ${currentQuestion.options[i]}`)
        }

        const hostResponse = await sendAction({
            actionType: 'LIFELINE_ASK_HOST',
            action: 'Player is asking the host for help',
            currentQuestion,
            currentQuestionIndex: currentQuestionIndex!,
            remainingTime,
            additionalData: remainingOptionsForHost ? {
                remainingOptions: remainingOptionsForHost
            } : undefined
        })

        if (hostResponse) {
            setHostMessage(hostResponse)
        }
    }

    async function confirmFinalAnswer() {
        setFinalAnswerBtnSelected(true)
        setOptionsDisabled(true)
        if (timerRef.current) clearInterval(timerRef.current)

        const currentQuestion = questions[currentQuestionIndex!]
        const selectedAnswer = currentQuestion.options[selectedAnswerIndex!]
        const correctAnswerIndex = currentQuestion.options.indexOf(currentQuestion.correctAnswer)

        // Prepare explanations for the AI
        const correctAnswerExplanation = currentQuestion.explanations[correctAnswerIndex]
        const selectedAnswerExplanation = currentQuestion.explanations[selectedAnswerIndex!]

        const hostResponse = await sendAction({
            actionType: 'FINAL_ANSWER_CONFIRM',
            action: `Player selected answer: ${selectedAnswer}. Final answer confirmed.`,
            currentQuestion,
            currentQuestionIndex: currentQuestionIndex!,
            remainingTime,
            additionalData: {
                selectedAnswer,
                correctAnswerExplanation,
                selectedAnswerExplanation: selectedAnswerIndex !== correctAnswerIndex ? selectedAnswerExplanation : undefined
            }
        })

        if (hostResponse) {
            setHostMessage(hostResponse)
            setHostMessageOnComplete(() => revealAnswer)
        } else {
            // Skip host talk on error, reveal answer immediately
            revealAnswer()
        }
    }

    function revealAnswer() {
        const currentQuestion = questions[currentQuestionIndex!]
        const correctIdx = currentQuestion.options.indexOf(currentQuestion.correctAnswer)

        setRevealedAnswer(true)
        setCorrectAnswerIndex(correctIdx)
    }

    async function handleNextQuestion() {
        const nextIndex = currentQuestionIndex! + 1

        if (nextIndex >= questions.length) {
            // Game over - we'll implement this next
            console.log('Game over!')
            return
        }

        // Reset state for next question
        setCurrentQuestionIndex(nextIndex)
        setSelectedAnswerIndex(null)
        setFinalAnswerBtnSelected(false)
        setRevealedAnswer(false)
        setCorrectAnswerIndex(null)
        setOptionsDisabled(true)
        setVisibleOptions(0)
        optionCuesDetectedRef.current = false

        if (timerRef.current) clearInterval(timerRef.current)
        if (optionsTimeoutRef.current) clearTimeout(optionsTimeoutRef.current)
        if (fallbackTimeoutRef.current) clearTimeout(fallbackTimeoutRef.current)

        const hostResponse = await sendAction({
            actionType: 'BEGIN_QUESTION',
            action: `Presenting question ${nextIndex + 1}`,
            currentQuestion: questions[nextIndex],
            currentQuestionIndex: nextIndex,
            remainingTime: 30
        })

        if (hostResponse) {
            setHostMessage(hostResponse)
            setHostMessageOnComplete(() => () => {
                if (visibleOptions >= 4) {
                    setOptionsDisabled(false)
                    countdown(GAME_LENGTH, () => console.log('countdown done'))
                }
            })

            fallbackTimeoutRef.current = setTimeout(() => {
                if (!optionCuesDetectedRef.current) {
                    console.log('[SinglePlayer] No option cues detected, falling back to automatic reveal')
                    revealOptionsFallback()
                }
            }, OPTION_CUE_FALLBACK_TIMEOUT)
        } else {
            revealOptionsFallback()
        }
    }

    function startLoadingSequence() {
        const getRandomAction = () => {
            const randomIndex = Math.floor(Math.random() * LOADING_ACTIONS.length)
            return LOADING_ACTIONS[randomIndex]
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
    const isDevelopment = process.env.NODE_ENV === 'development';

    return (
        <div className="min-h-screen flex select-none"
             style={isDevelopment ? {
                 backgroundImage: 'linear-gradient(rgba(0, 0, 0, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 0, 0, 0.1) 1px, transparent 1px)',
                 backgroundSize: '8px 8px'
             } : {}}>
            {/* Conversation History Sidebar */}
            {isDevelopment && <div className="w-64 border-r border-border p-4 overflow-y-auto bg-background fixed left-0 top-0 h-screen">
                <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Conversation History</h3>
                <div className="space-y-2">
                    {conversationHistory.map((msg, index) => (
                        <div key={index} className={`p-2 rounded text-xs ${
                            msg.role === 'player'
                                ? 'bg-primary/10 text-primary'
                                : 'bg-secondary text-foreground'
                        }`}>
                            <div className="font-semibold mb-1 capitalize">{msg.role}:</div>
                            <div className={`text-foreground/80 ${msg.role === 'host' ? 'line-clamp-3' : ''}`}>{msg.content}</div>
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
                    {gameState === 'playing' && questions[currentQuestionIndex!].question}
                </h2>
                <div className="grid grid-cols-2 gap-3 mb-4 sm:mb-6">
                    <Button
                        disabled={optionsDisabled || eliminatedOptions.includes(0)}
                        selected={!finalAnswerBtnSelected && selectedAnswerIndex === 0}
                        orange={finalAnswerBtnSelected && !revealedAnswer && selectedAnswerIndex === 0}
                        correct={revealedAnswer && correctAnswerIndex === 0}
                        onClick={() => handleAnswerSelect(0)}
                    >
                        {gameState === 'playing' && visibleOptions >= 1 && !eliminatedOptions.includes(0) && `A: ${questions[currentQuestionIndex!].options[0]}`}
                    </Button>
                    <Button
                        disabled={optionsDisabled || eliminatedOptions.includes(1)}
                        selected={!finalAnswerBtnSelected && selectedAnswerIndex === 1}
                        orange={finalAnswerBtnSelected && !revealedAnswer && selectedAnswerIndex === 1}
                        correct={revealedAnswer && correctAnswerIndex === 1}
                        onClick={() => handleAnswerSelect(1)}
                    >
                        {gameState === 'playing' && visibleOptions >= 2 && !eliminatedOptions.includes(1) && `B: ${questions[currentQuestionIndex!].options[1]}`}
                    </Button>
                    <Button
                        disabled={optionsDisabled || eliminatedOptions.includes(2)}
                        selected={!finalAnswerBtnSelected && selectedAnswerIndex === 2}
                        orange={finalAnswerBtnSelected && !revealedAnswer && selectedAnswerIndex === 2}
                        correct={revealedAnswer && correctAnswerIndex === 2}
                        onClick={() => handleAnswerSelect(2)}
                    >
                        {gameState === 'playing' && visibleOptions >= 3 && !eliminatedOptions.includes(2) && `C: ${questions[currentQuestionIndex!].options[2]}`}
                    </Button>
                    <Button
                        disabled={optionsDisabled || eliminatedOptions.includes(3)}
                        selected={!finalAnswerBtnSelected && selectedAnswerIndex === 3}
                        orange={finalAnswerBtnSelected && !revealedAnswer && selectedAnswerIndex === 3}
                        correct={revealedAnswer && correctAnswerIndex === 3}
                        onClick={() => handleAnswerSelect(3)}
                    >
                        {gameState === 'playing' && visibleOptions >= 4 && !eliminatedOptions.includes(3) && `D: ${questions[currentQuestionIndex!].options[3]}`}
                    </Button>
                </div>

                {selectedAnswerIndex != null && !revealedAnswer && <div className="flex items-center justify-between mb-4 sm:mb-6">
                    <div className={`px-3 py-2 text-sm font-medium ${finalAnswerBtnSelected ? 'opacity-50' : ''}`}>
                        Is this your final answer?
                    </div>
                    <CircularButton disabled={finalAnswerBtnSelected} onClick={confirmFinalAnswer} selected={finalAnswerBtnSelected}>
                        YES
                    </CircularButton>
                </div>}

                {revealedAnswer && <div className="flex items-center justify-center mb-4 sm:mb-6">
                    <CircularButton onClick={handleNextQuestion}>
                        Continue
                    </CircularButton>
                </div>}

                <div className="flex justify-between gap-2 sm:gap-4 mb-4 sm:mb-6">
                    <Button
                        className="flex-1 sm:w-32 md:w-36 mb-2"
                        disabled={optionsDisabled || usedLifelines.fiftyFifty}
                        onClick={handleFiftyFifty}
                        centered
                    >
                        50:50
                    </Button>
                    <Button
                        className="flex-1 sm:w-36 md:w-40 mb-2"
                        icon={<User size={16}/>}
                        disabled={optionsDisabled || usedLifelines.askHost}
                        onClick={handleAskHost}
                        centered
                    >
                        Ask the host
                    </Button>
                </div>

                {hostMessage && <HostMessage message={hostMessage} onComplete={hostMessageOnComplete} onOptionCue={handleOptionCue} />}

                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-1 sm:gap-2">
                    {MONEY_LADDER.map((amount, index) => {
                        const isCheckpoint = CHECKPOINTS.includes(index)
                        const isCheckpointReached = isCheckpoint && index <= currentQuestionIndex!

                        return (
                            <div
                                key={amount}
                                className={`
                                h-8 sm:h-10 md:h-12 flex items-center justify-center text-[10px] sm:text-xs md:text-sm font-medium px-1
                                ${isCheckpointReached ? 'bg-green-600 text-white' : index <= currentQuestionIndex! ? 'bg-muted-foreground text-white' : 'bg-secondary text-foreground'}
                            `}
                            >
                                {amount.toLocaleString()}
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}