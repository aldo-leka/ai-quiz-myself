"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ANIMATED_TEXT_FAST_PAUSE_MS,
  ANIMATED_TEXT_MEDIUM_PAUSE_MS,
  ANIMATED_TEXT_SLOW_PAUSE_MS,
  ANIMATED_TEXT_SPEED_MS,
} from "@/lib/quiz-constants";

type Block =
  | { type: "text"; value: string }
  | { type: "pause"; value: number }
  | { type: "reveal" }
  | { type: "option"; value: "A" | "B" | "C" | "D" };

type AnimatedTextProps = {
  text: string;
  onComplete?: () => void;
  onCue?: (type: "reveal" | "option", value?: "A" | "B" | "C" | "D") => void;
};

const CUES = [
  "|||slow|||",
  "|||medium|||",
  "|||fast|||",
  "|||reveal|||",
  "|||option:A|||",
  "|||option:B|||",
  "|||option:C|||",
  "|||option:D|||",
] as const;

function parseBlocks(input: string): Block[] {
  const blocks: Block[] = [];
  let buffer = "";

  for (let i = 0; i < input.length; i += 1) {
    const foundCue = CUES.find((cue) => input.slice(i, i + cue.length) === cue);

    if (!foundCue) {
      buffer += input[i];
      continue;
    }

    if (buffer.length > 0) {
      blocks.push({ type: "text", value: buffer });
      buffer = "";
    }

    i += foundCue.length - 1;

    if (foundCue === "|||slow|||") blocks.push({ type: "pause", value: ANIMATED_TEXT_SLOW_PAUSE_MS });
    if (foundCue === "|||medium|||") blocks.push({ type: "pause", value: ANIMATED_TEXT_MEDIUM_PAUSE_MS });
    if (foundCue === "|||fast|||") blocks.push({ type: "pause", value: ANIMATED_TEXT_FAST_PAUSE_MS });
    if (foundCue === "|||reveal|||") blocks.push({ type: "reveal" });
    if (foundCue === "|||option:A|||") blocks.push({ type: "option", value: "A" });
    if (foundCue === "|||option:B|||") blocks.push({ type: "option", value: "B" });
    if (foundCue === "|||option:C|||") blocks.push({ type: "option", value: "C" });
    if (foundCue === "|||option:D|||") blocks.push({ type: "option", value: "D" });
  }

  if (buffer.length > 0) {
    // If the stream ends on an incomplete cue token, keep it hidden until complete.
    const markerIndex = buffer.lastIndexOf("|||");
    if (markerIndex !== -1) {
      const trailing = buffer.slice(markerIndex);
      const isPartialCue =
        CUES.some((cue) => cue.startsWith(trailing)) && !CUES.includes(trailing as (typeof CUES)[number]);

      if (isPartialCue) {
        const visiblePrefix = buffer.slice(0, markerIndex);
        if (visiblePrefix.length > 0) {
          blocks.push({ type: "text", value: visiblePrefix });
        }
        return blocks;
      }
    }

    blocks.push({ type: "text", value: buffer });
  }

  return blocks;
}

export function AnimatedText({ text, onComplete, onCue }: AnimatedTextProps) {
  const [displayedText, setDisplayedText] = useState("");
  const [isComplete, setIsComplete] = useState(false);
  const skipRef = useRef(false);
  const runningRef = useRef(false);
  const resetRef = useRef(false);
  const markIncompleteRef = useRef(false);
  const textRef = useRef(text);
  const previousTextRef = useRef("");
  const cursorRef = useRef({ block: 0, char: 0 });
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const resolveRef = useRef<(() => void) | null>(null);

  const clearPending = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (resolveRef.current) {
      resolveRef.current();
      resolveRef.current = null;
    }
  }, []);

  const wait = useCallback(
    (ms: number) =>
      new Promise<void>((resolve) => {
        resolveRef.current = resolve;
        timeoutRef.current = setTimeout(() => {
          timeoutRef.current = null;
          resolveRef.current = null;
          resolve();
        }, ms);
      }),
    [],
  );

  const runLoop = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;

    while (true) {
      if (resetRef.current) {
        resetRef.current = false;
        setDisplayedText("");
      }
      if (markIncompleteRef.current) {
        markIncompleteRef.current = false;
        setIsComplete(false);
      }

      const blocks = parseBlocks(textRef.current);

      if (skipRef.current) {
        const cursor = cursorRef.current;
        let appended = "";

        for (let index = cursor.block; index < blocks.length; index += 1) {
          const block = blocks[index];
          if (block.type === "text") {
            if (index === cursor.block) {
              appended += block.value.slice(cursor.char);
            } else {
              appended += block.value;
            }
          } else if (block.type === "reveal") {
            onCue?.("reveal");
          } else if (block.type === "option") {
            onCue?.("option", block.value);
          }
        }

        if (appended.length > 0) {
          setDisplayedText((previous) => previous + appended);
        }

        cursorRef.current = { block: blocks.length, char: 0 };
        skipRef.current = false;
        setIsComplete(true);
        runningRef.current = false;
        return;
      }

      const cursor = cursorRef.current;
      if (cursor.block >= blocks.length) {
        setIsComplete(true);
        runningRef.current = false;
        return;
      }

      const block = blocks[cursor.block];

      if (block.type === "text") {
        if (cursor.char >= block.value.length) {
          cursorRef.current = { block: cursor.block + 1, char: 0 };
          continue;
        }

        setDisplayedText((previous) => previous + block.value[cursor.char]);
        cursorRef.current = { block: cursor.block, char: cursor.char + 1 };
        await wait(ANIMATED_TEXT_SPEED_MS);
        continue;
      }

      if (block.type === "pause") {
        cursorRef.current = { block: cursor.block + 1, char: 0 };
        await wait(block.value);
        continue;
      }

      if (block.type === "reveal") {
        onCue?.("reveal");
        cursorRef.current = { block: cursor.block + 1, char: 0 };
        continue;
      }

      onCue?.("option", block.value);
      cursorRef.current = { block: cursor.block + 1, char: 0 };
    }
  }, [onCue, wait]);

  useEffect(() => {
    const isAppend = text.startsWith(previousTextRef.current);
    textRef.current = text;

    if (!isAppend) {
      clearPending();
      skipRef.current = false;
      cursorRef.current = { block: 0, char: 0 };
      resetRef.current = true;
    }

    previousTextRef.current = text;
    markIncompleteRef.current = true;
    const timeoutId = setTimeout(() => {
      void runLoop();
    }, 0);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [clearPending, runLoop, text]);

  useEffect(() => {
    return () => {
      clearPending();
      runningRef.current = false;
    };
  }, [clearPending]);

  function onTap() {
    clearPending();

    if (isComplete) {
      onComplete?.();
      return;
    }

    skipRef.current = true;
  }

  return (
    <button
      type="button"
      onClick={onTap}
      className="w-full rounded-xl border border-slate-700 bg-slate-900/70 p-4 text-left text-base leading-relaxed text-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300"
    >
      <span className="font-bold text-amber-300">Host:</span>{" "}
      <span>
        {displayedText}
        {!isComplete ? <span className="animate-pulse">▌</span> : null}
      </span>
      <span className="mt-2 block text-sm text-slate-400">
        Press to {isComplete ? "continue" : "skip"}
      </span>
    </button>
  );
}
