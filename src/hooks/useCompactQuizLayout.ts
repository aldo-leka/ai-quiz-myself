"use client";

import { useEffect, useState } from "react";

const COMPACT_QUIZ_LAYOUT_QUERY = "(min-width: 768px) and (max-height: 960px)";
const TV_LIKE_QUIZ_LAYOUT_QUERY =
  "(min-width: 1200px) and (max-height: 960px) and (min-aspect-ratio: 16/9)";

function useResponsiveQuery(query: string) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia(query);
    const updateMatch = () => setMatches(mediaQuery.matches);

    updateMatch();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateMatch);
      return () => mediaQuery.removeEventListener("change", updateMatch);
    }

    mediaQuery.addListener(updateMatch);
    return () => mediaQuery.removeListener(updateMatch);
  }, [query]);

  return matches;
}

export function useCompactQuizLayout() {
  return useResponsiveQuery(COMPACT_QUIZ_LAYOUT_QUERY);
}

export function useTvLikeQuizLayout() {
  return useResponsiveQuery(TV_LIKE_QUIZ_LAYOUT_QUERY);
}
