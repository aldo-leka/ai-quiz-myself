"use client";

import { useEffect, useRef, useState } from "react";
import { CircularButton } from "@/components/quiz/CircularButton";
import { LOADING_ACTIONS } from "@/lib/quiz-constants";

function pickRandomAction() {
  const idx = Math.floor(Math.random() * LOADING_ACTIONS.length);
  return LOADING_ACTIONS[idx];
}

export function LoadingScreen() {
  const [loadingAction, setLoadingAction] = useState<string>(LOADING_ACTIONS[0]);
  const [isPulseOn, setIsPulseOn] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setLoadingAction(pickRandomAction());
    }, 2200);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  function onPulse() {
    setIsPulseOn(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setIsPulseOn(false), 500);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
      <div className="flex max-w-xl flex-col items-center gap-8 text-center">
        <h2 className="text-3xl font-bold tracking-wide md:text-4xl">Preparing the Studio</h2>
        <p className="min-h-8 text-lg text-slate-300 md:text-xl">{loadingAction}</p>
        <CircularButton selected={isPulseOn} onClick={onPulse} aria-label="Pulse button">
          Pulse
        </CircularButton>
      </div>
    </div>
  );
}
