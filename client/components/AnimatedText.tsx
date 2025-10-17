import {useEffect, useRef, useState} from "react";
import {
    ANIMATED_TEXT_FAST_PAUSE,
    ANIMATED_TEXT_MEDIUM_PAUSE,
    ANIMATED_TEXT_SLOW_PAUSE,
    ANIMATED_TEXT_SPEED
} from "@/lib/constants";

type Block =
    | { type: 'text'; value: string }
    | { type: 'suspense'; value: number }
    | { type: 'reveal-cue' }
    | { type: 'option-cue'; value: string }

interface AnimatedText2Props {
    text: string
    onComplete?: () => void
    onCue?: (type: string, value?: string) => void
}

/*
* AnimatedText component to show the given text character by character line like in a terminal.
* Features:
* 1) It will start animating the moment it notices a changed text prop.
* 2) If it's animating (not complete), you can tap to skip.
* 3) Even if animation is complete, you need to tap to continue (the game). */
export default function AnimatedText({text, onComplete, onCue}: AnimatedText2Props) {
    const [displayedText, setDisplayedText] = useState("")
    const [isComplete, setIsComplete] = useState(false)
    const intervalRef = useRef<NodeJS.Timeout | null>(null)
    const shouldSkipRef = useRef(false)
    const timeoutRef = useRef<NodeJS.Timeout | null>(null)
    const resolveRef = useRef<((value: unknown) => void) | null>(null)

    useEffect(() => {
        return () => {
            safeClearInterval()
            safeClearTimeout()
        }
    }, [])

    useEffect(() => {
        setDisplayedText("")
        setIsComplete(false)
        safeClearInterval()
        safeClearTimeout()
        shouldSkipRef.current = false

        animateBlocks(parseBlocks(text))
    }, [text])

    function parseBlocks(text: string) {
        const cues = [
            "|||slow|||",
            "|||medium|||",
            "|||fast|||",
            "|||reveal|||",
            "|||option:A|||",
            "|||option:B|||",
            "|||option:C|||",
            "|||option:D|||"
        ]
        const blocks: Block[] = []
        let buffer = ""
        for (let i = 0; i < text.length; i++) {
            let foundCue = ""
            for (const cue of cues) {
                if (text.length - i >= cue.length) {
                    const slidingWindow = text.slice(i, i + cue.length)
                    if (slidingWindow === cue)
                        foundCue = cue
                }
            }

            if (foundCue) {
                // add the text at start, or inbetween cues as a block
                if (buffer.length)
                    blocks.push({type: "text", value: buffer})

                buffer = ""
                i += foundCue.length - 1 // will increment on the loop (probably should have used a while loop)
            }
            else
                buffer += text[i]

            switch (foundCue) {
                case "|||slow|||":
                    blocks.push({type: "suspense", value: ANIMATED_TEXT_SLOW_PAUSE})
                    break
                case "|||medium|||":
                    blocks.push({type: "suspense", value: ANIMATED_TEXT_MEDIUM_PAUSE})
                    break
                case "|||fast|||":
                    blocks.push({type: "suspense", value: ANIMATED_TEXT_FAST_PAUSE})
                    break
                case "|||reveal|||":
                    blocks.push({type: "reveal-cue"})
                    break
                case "|||option:A|||":
                    blocks.push({type: "option-cue", value: "A"})
                    break
                case "|||option:B|||":
                    blocks.push({type: "option-cue", value: "B"})
                    break
                case "|||option:C|||":
                    blocks.push({type: "option-cue", value: "C"})
                    break
                case "|||option:D|||":
                    blocks.push({type: "option-cue", value: "D"})
                    break
            }
        }

        // add the text at end of cues or when no cues as a block
        if (buffer.length)
            blocks.push({type: "text", value: buffer})

        return blocks
    }

    async function animateBlocks(blocks: Block[]) {
        let accumulator = ""
        for (const block of blocks) {
            if (shouldSkipRef.current) {
                skipToEnd(blocks)
                return
            }

            switch (block.type) {
                case "text":
                    await animateText(block.value, accumulator)
                    accumulator += `${block.value} `
                    break
                case "suspense":
                    await new Promise(resolve => {
                        resolveRef.current = resolve
                        timeoutRef.current = setTimeout(resolve, block.value)
                    })
                    break
                case "reveal-cue":
                    onCue?.("reveal")
                    break
                case "option-cue":
                    onCue?.("option", block.value)
                    break
            }
        }

        setIsComplete(true)
    }

    function skipToEnd(blocks: Block[]) {
        let finalText = ""
        for (const block of blocks) {
            if (block.type === "text") {
                finalText += `${block.value} `
            } else if (block.type === "reveal-cue") {
                onCue?.("reveal")
            } else if (block.type === "option-cue") {
                onCue?.("option", block.value)
            }
        }

        setDisplayedText(finalText)
        setIsComplete(true)
        shouldSkipRef.current = false
    }

    function animateText(newText: string, current: string) {
        safeClearInterval()

        return new Promise((resolve) => {
            resolveRef.current = resolve
            let i = 0
            intervalRef.current = setInterval(() => {
                setDisplayedText(current + newText.slice(0, i + 1))
                i++
                if (i >= newText.length) {
                    safeClearInterval()
                    resolve(undefined)
                }
            }, ANIMATED_TEXT_SPEED)
        })
    }

    function handleTap() {
        safeClearInterval()
        safeClearTimeout()

        if (isComplete) {
            onComplete?.()
            return
        }

        shouldSkipRef.current = true
    }

    function safeClearInterval() {
        if (intervalRef.current) {
            clearInterval(intervalRef.current)
            intervalRef.current = null
        }
    }

    function safeClearTimeout() {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current)
            timeoutRef.current = null
        }

        resolveRef.current?.(undefined)
        resolveRef.current = null
    }

    return (
        <div
            className="mb-4 sm:mb-6 text-xs sm:text-sm text-foreground relative group cursor-pointer"
            onClick={handleTap}
        >
            <span className="font-semibold">Host:</span>{' '}
            <span className="cursor-pointer">
                {displayedText}
                {!isComplete && <span className="animate-pulse">▌</span>}
            </span>
            <span className="ml-2 text-xs text-muted-foreground">
                (tap to {isComplete ? 'continue' : 'skip'})
            </span>
        </div>
    )
}