"use client";

import { useState, useEffect, useRef } from 'react';

interface AnimatedScoreProps {
  score: number;
  className?: string;
}

export function AnimatedScore({ score, className = "" }: AnimatedScoreProps) {
  const [displayScore, setDisplayScore] = useState(score);
  const previousScoreRef = useRef<number | null>(null);
  const animationTimerRef = useRef<NodeJS.Timeout | null>(null);

  const duration = 2000;
  const animationSteps = 30;

  function easeOutQuint(x: number): number {
    return 1 - Math.pow(1 - x, 5);
  }

  useEffect(() => {
    if (previousScoreRef.current === null) {
      previousScoreRef.current = score;
      return;
    }

    if (score === previousScoreRef.current) {
      return;
    }

    // Cancel any existing animation
    if (animationTimerRef.current !== null) {
      clearInterval(animationTimerRef.current);
    }

    const startScore = previousScoreRef.current;
    const scoreDifference = score - startScore;
    let step = 0;

    animationTimerRef.current = setInterval(() => {
      step++;
      const progress = Math.min(step / animationSteps, 1);
      const easedProgress = easeOutQuint(progress);

      const currentValue = Math.round(startScore + scoreDifference * easedProgress);
      setDisplayScore(currentValue);

      if (progress >= 1) {
        setDisplayScore(score);
        if (animationTimerRef.current !== null) {
          clearInterval(animationTimerRef.current);
          animationTimerRef.current = null;
        }
      }
    }, duration / animationSteps);

    previousScoreRef.current = score;

    return () => {
      if (animationTimerRef.current !== null) {
        clearInterval(animationTimerRef.current);
      }
    };
  }, [score]);

  return (
    <div className={`font-semibold text-lg transition-all} ${className}`}
         style={{
           transition: 'transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275), color 0.5s ease'
         }}>
      {displayScore} pts
    </div>
  );
}