import { useState, useCallback } from 'react';

export const useGameIntro = () => {
  const [showIntro, setShowIntro] = useState(false);
  const [introAnimationComplete, setIntroAnimationComplete] = useState(false);
  const [introTheme, setIntroTheme] = useState("");
  const [introDifficulty, setIntroDifficulty] = useState("");

  const startIntro = useCallback((theme: string, difficulty: string) => {
    setIntroTheme(theme);
    setIntroDifficulty(difficulty);
    setShowIntro(true);
    setIntroAnimationComplete(false);

    setTimeout(() => {
      setIntroAnimationComplete(true);
      
      setTimeout(() => {
        setShowIntro(false);
      }, 1000);
    }, 2000);
  }, []);

  return {
    showIntro,
    introAnimationComplete,
    introTheme,
    introDifficulty,
    startIntro
  };
};