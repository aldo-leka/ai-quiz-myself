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
}

// Parse message with speed delimiters like "text|||fast|||more text|||slow|||end"
function parseMessage(message: string): Segment[] {
    const parts = message.split('|||')
    const segments: Segment[] = []

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i].trim()
        if (!part) continue

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
    }

    return segments
}

function getSuspenseDelay(speed: SuspenseSpeed): number {
    switch (speed) {
        case 'fast': return 500
        case 'medium': return 1500
        case 'slow': return 3000
        default: return 1500
    }
}

// Chunk segments into 2-line blocks while preserving speed info and pauses
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

                if (linesInChunk >= 2) {
                    // We've filled 2 lines, save current chunk
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

export default function HostMessage({ message, onComplete }: HostMessageProps) {
    const [currentChunkIndex, setCurrentChunkIndex] = useState(0)
    const [waitingForTap, setWaitingForTap] = useState(false)

    const chunksRef = useRef<Chunk[]>([])

    useEffect(() => {
        console.log('[HostMessage] New message received')
        const segments = parseMessage(message)
        const chunks = chunkSegmentsWithPauses(segments)

        console.log('[HostMessage] Total chunks:', chunks.length)
        console.log('[HostMessage] Chunks:', chunks)

        chunksRef.current = chunks
        setCurrentChunkIndex(0)
        setWaitingForTap(false)
    }, [message])

    const handleChunkComplete = () => {
        console.log('[HostMessage] Chunk animation complete, waiting for tap')
        setWaitingForTap(true)
    }

    const handleTap = () => {
        console.log('[HostMessage] Tap:', { waitingForTap, currentChunkIndex })

        if (!waitingForTap) {
            // Tap during animation - pass it down to AnimatedText
            return
        }

        // Player finished reading - move to next chunk
        setWaitingForTap(false)
        const nextIndex = currentChunkIndex + 1

        if (nextIndex < chunksRef.current.length) {
            console.log('[HostMessage] Starting next chunk immediately')
            setCurrentChunkIndex(nextIndex)
        } else {
            console.log('[HostMessage] All chunks done')
            if (onComplete) {
                onComplete()
            }
        }
    }

    const currentChunk = chunksRef.current[currentChunkIndex]

    if (!currentChunk || currentChunk.parts.length === 0) {
        return null
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
            />
            <span className="ml-2 text-xs text-muted-foreground">
                {waitingForTap ? '(tap to continue)' : '(tap to skip)'}
            </span>
        </div>
    )
}