"use client"

import { useEffect, useState, useRef } from "react"

type AnimationSpeed = "fast" | "medium" | "slow"

interface ChunkPart {
    type: 'text' | 'pause'
    content?: string
    speed?: AnimationSpeed
    duration?: number
}

interface AnimatedTextProps {
    chunkParts: ChunkPart[]
    onComplete?: () => void
    isWaitingForTap: boolean
    onCharProgress?: (charCount: number) => void
}

const SPEEDS = {
    fast: 20,     // ms per character
    medium: 40,
    slow: 60
}

export default function AnimatedText({
    chunkParts,
    onComplete,
    isWaitingForTap,
    onCharProgress
}: AnimatedTextProps) {
    const [displayedText, setDisplayedText] = useState("")
    const [currentPartIndex, setCurrentPartIndex] = useState(0)
    const [isComplete, setIsComplete] = useState(false)
    const [skipRequested, setSkipRequested] = useState(false)

    const intervalRef = useRef<NodeJS.Timeout | null>(null)
    const pauseTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const currentIndexRef = useRef(0)
    const baseTextRef = useRef("")
    const onCompleteRef = useRef(onComplete)
    const onCharProgressRef = useRef(onCharProgress)

    // Keep refs up to date
    useEffect(() => {
        onCompleteRef.current = onComplete
        onCharProgressRef.current = onCharProgress
    }, [onComplete, onCharProgress])

    // Reset when chunk parts change
    useEffect(() => {
        setDisplayedText("")
        setCurrentPartIndex(0)
        setIsComplete(false)
        setSkipRequested(false)
        baseTextRef.current = ""
    }, [chunkParts])

    // Handle skip during animation
    const handleSkip = () => {
        if (!isComplete && !isWaitingForTap) {
            setSkipRequested(true)
        }
    }

    // Main animation effect
    useEffect(() => {
        if (currentPartIndex >= chunkParts.length) {
            setIsComplete(true)
            if (onCompleteRef.current) {
                onCompleteRef.current()
            }
            return
        }

        const currentPart = chunkParts[currentPartIndex]

        if (currentPart.type === 'pause') {
            if (skipRequested) {
                setCurrentPartIndex(currentPartIndex + 1)
                setSkipRequested(false)
                return
            }

            // Wait for pause duration
            pauseTimeoutRef.current = setTimeout(() => {
                setCurrentPartIndex(currentPartIndex + 1)
            }, currentPart.duration || 0)

            return () => {
                if (pauseTimeoutRef.current) {
                    clearTimeout(pauseTimeoutRef.current)
                }
            }
        }

        // Text animation
        const text = currentPart.content || ''
        const speed = currentPart.speed || 'medium'
        const delay = SPEEDS[speed]

        if (skipRequested) {
            baseTextRef.current += text
            setDisplayedText(baseTextRef.current)
            setCurrentPartIndex(currentPartIndex + 1)
            setSkipRequested(false)
            return
        }

        // Typewriter animation
        currentIndexRef.current = 0
        const startBase = baseTextRef.current

        intervalRef.current = setInterval(() => {
            if (currentIndexRef.current < text.length) {
                currentIndexRef.current++
                const newDisplayText = startBase + text.slice(0, currentIndexRef.current)
                setDisplayedText(newDisplayText)
                // Report character progress
                if (onCharProgressRef.current) {
                    onCharProgressRef.current(newDisplayText.length)
                }
            } else {
                clearInterval(intervalRef.current!)
                baseTextRef.current += text
                setCurrentPartIndex(currentPartIndex + 1)
            }
        }, delay)

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current)
            }
        }
    }, [currentPartIndex, chunkParts, skipRequested])

    return (
        <span onClick={handleSkip} className="cursor-pointer">
            {displayedText}
            {!isComplete && <span className="animate-pulse">▌</span>}
        </span>
    )
}