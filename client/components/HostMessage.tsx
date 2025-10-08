"use client"

import { useState, useEffect, useRef } from "react"
import AnimatedText from "./AnimatedText"

type SuspenseSpeed = "fast" | "medium" | "slow"

interface Segment {
    text: string
    speed: SuspenseSpeed
}

interface ChunkPart {
    type: 'text' | 'pause'
    content?: string
    speed?: SuspenseSpeed
    duration?: number
}

interface Chunk {
    parts: ChunkPart[]
}

interface HostMessageProps {
    message: string
    onComplete?: () => void
    onOptionCue?: (option: 'A' | 'B' | 'C' | 'D') => void
}

// Parse message with speed delimiters like "text|||fast|||more text|||slow|||end"
// Also extracts option cues like |||option:A|||
function parseMessage(message: string): { segments: Segment[], optionCues: Map<number, 'A' | 'B' | 'C' | 'D'> } {
    const parts = message.split('|||')
    const segments: Segment[] = []
    const optionCues = new Map<number, 'A' | 'B' | 'C' | 'D'>()
    let characterCount = 0

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i].trim()
        if (!part) continue

        // Check if this part is an option cue
        const optionMatch = part.match(/^option:([A-D])$/i)
        if (optionMatch) {
            const option = optionMatch[1].toUpperCase() as 'A' | 'B' | 'C' | 'D'
            optionCues.set(characterCount, option)
            continue
        }

        // Check if this part is a speed indicator
        if (part === 'fast' || part === 'medium' || part === 'slow') {
            continue
        }

        // Check if next part is a speed indicator
        const nextPart = i + 1 < parts.length ? parts[i + 1].trim() : null
        const speed: SuspenseSpeed =
            (nextPart === 'fast' || nextPart === 'medium' || nextPart === 'slow')
                ? nextPart
                : 'medium'

        segments.push({ text: part, speed })
        characterCount += part.length
    }

    return { segments, optionCues }
}

function getSuspenseDelay(speed: SuspenseSpeed): number {
    switch (speed) {
        case 'fast': return 500
        case 'medium': return 1500
        case 'slow': return 3000
        default: return 1500
    }
}

// Chunk segments into 4-line blocks while preserving speed info and pauses
function chunkSegmentsWithPauses(segments: Segment[], charsPerLine = 90): Chunk[] {
    const chunks: Chunk[] = []
    let currentChunkParts: ChunkPart[] = []
    let currentLineLength = 0
    let linesInChunk = 0

    for (let segIdx = 0; segIdx < segments.length; segIdx++) {
        const segment = segments[segIdx]
        const words = segment.text.split(' ')
        let currentTextPart = ''

        for (const word of words) {
            const wordLength = word.length + 1

            if (currentLineLength + wordLength > charsPerLine) {
                // Word would overflow current line
                linesInChunk++
                currentLineLength = wordLength

                if (linesInChunk >= 4) {
                    // We've filled 4 lines, save current chunk
                    if (currentTextPart.trim()) {
                        currentChunkParts.push({
                            type: 'text',
                            content: currentTextPart.trim(),
                            speed: segment.speed
                        })
                    }
                    chunks.push({ parts: currentChunkParts })

                    // Start new chunk with this word
                    currentChunkParts = []
                    currentTextPart = word + ' '
                    linesInChunk = 0
                    currentLineLength = wordLength
                } else {
                    currentTextPart += word + ' '
                }
            } else {
                currentTextPart += word + ' '
                currentLineLength += wordLength
            }
        }

        // Add remaining text from this segment
        if (currentTextPart.trim()) {
            currentChunkParts.push({
                type: 'text',
                content: currentTextPart.trim(),
                speed: segment.speed
            })
        }

        // Add pause after this segment (if not the last segment)
        if (segIdx < segments.length - 1) {
            currentChunkParts.push({
                type: 'pause',
                duration: getSuspenseDelay(segment.speed)
            })
        }
    }

    // Add final chunk if there's remaining content
    if (currentChunkParts.length > 0) {
        chunks.push({ parts: currentChunkParts })
    }

    return chunks.length > 0 ? chunks : [{ parts: [] }]
}

export default function HostMessage({ message, onComplete, onOptionCue }: HostMessageProps) {
    const [currentChunkIndex, setCurrentChunkIndex] = useState(0)
    const [waitingForTap, setWaitingForTap] = useState(false)
    const [currentCharCount, setCurrentCharCount] = useState(0)
    const [completedCharsCount, setCompletedCharsCount] = useState(0)

    const chunksRef = useRef<Chunk[]>([])
    const optionCuesRef = useRef<Map<number, 'A' | 'B' | 'C' | 'D'>>(new Map())
    const firedCuesRef = useRef<Set<'A' | 'B' | 'C' | 'D'>>(new Set())

    useEffect(() => {
        const { segments, optionCues } = parseMessage(message)
        const chunks = chunkSegmentsWithPauses(segments)

        chunksRef.current = chunks
        optionCuesRef.current = optionCues
        firedCuesRef.current = new Set()
        setCurrentChunkIndex(0)
        setWaitingForTap(false)
        setCurrentCharCount(0)
        setCompletedCharsCount(0)
    }, [message])

    // Check for option cues as character count increases
    useEffect(() => {
        if (!onOptionCue) return

        // Check all cues at or before current character count
        for (const [charPosition, option] of optionCuesRef.current.entries()) {
            if (charPosition <= currentCharCount && !firedCuesRef.current.has(option)) {
                firedCuesRef.current.add(option)
                onOptionCue(option)
            }
        }
    }, [currentCharCount, onOptionCue])

    const handleChunkComplete = () => {
        setWaitingForTap(true)
    }

    const handleTap = () => {
        if (!waitingForTap) {
            // Tap during animation - let it bubble to AnimatedText for skip handling
            return
        }

        // Player finished reading - calculate completed chars and move to next chunk
        const currentChunk = chunksRef.current[currentChunkIndex]
        const chunkTextLength = currentChunk.parts
            .filter(part => part.type === 'text')
            .reduce((sum, part) => sum + (part.content?.length || 0), 0)

        const newCompletedCount = completedCharsCount + chunkTextLength
        setCompletedCharsCount(newCompletedCount)

        setWaitingForTap(false)
        const nextIndex = currentChunkIndex + 1

        if (nextIndex < chunksRef.current.length) {
            setCurrentChunkIndex(nextIndex)
        } else {
            if (onComplete) {
                onComplete()
            }
        }
    }

    const currentChunk = chunksRef.current[currentChunkIndex]

    if (!currentChunk || currentChunk.parts.length === 0) {
        return null
    }

    const handleCharProgress = (charCount: number) => {
        // Add completed chars from previous chunks to current animation progress
        setCurrentCharCount(completedCharsCount + charCount)
    }

    return (
        <div
            className="mb-4 sm:mb-6 text-xs sm:text-sm text-foreground relative group cursor-pointer"
            onClick={handleTap}
        >
            <span className="font-semibold">Host:</span>{' '}
            <AnimatedText
                key={currentChunkIndex}
                chunkParts={currentChunk.parts}
                onComplete={handleChunkComplete}
                isWaitingForTap={waitingForTap}
                onCharProgress={handleCharProgress}
            />
            <span className="ml-2 text-xs text-muted-foreground">
                (tap to {waitingForTap ? 'continue' : 'skip'})
            </span>
        </div>
    )
}