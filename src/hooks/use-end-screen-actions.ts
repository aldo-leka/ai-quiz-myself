"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import {
  buildCreateQuizPath,
  buildCreateQuizSignInPath,
  buildPublicQuizPath,
  type CreateQuizDifficulty,
  type CreateQuizMode,
} from "@/lib/quiz-links";

type ShareState = "idle" | "copied" | "error";

type UseEndScreenActionsParams = {
  quizId: string;
  theme: string;
  mode: CreateQuizMode;
  difficulty: CreateQuizDifficulty;
  isSignedIn: boolean;
};

export function useEndScreenActions({
  quizId,
  theme,
  mode,
  difficulty,
  isSignedIn,
}: UseEndScreenActionsParams) {
  const router = useRouter();
  const [shareState, setShareState] = useState<ShareState>("idle");

  const shareQuiz = useCallback(async () => {
    if (typeof window === "undefined") {
      setShareState("error");
      return;
    }

    if (!navigator.clipboard) {
      setShareState("error");
      posthog.capture("quiz_share_failed", {
        quiz_id: quizId,
        mode,
        reason: "clipboard_unavailable",
      });
      return;
    }

    const shareUrl = `${window.location.origin}${buildPublicQuizPath(quizId, { ref: "share" })}`;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareState("copied");
      posthog.capture("quiz_shared", {
        quiz_id: quizId,
        mode,
        theme,
      });
    } catch {
      setShareState("error");
      posthog.capture("quiz_share_failed", {
        quiz_id: quizId,
        mode,
        reason: "clipboard_write_failed",
      });
    }
  }, [mode, quizId, theme]);

  const makeOneLikeThis = useCallback(() => {
    const href = isSignedIn
      ? buildCreateQuizPath({
          sourceType: "theme",
          theme,
          mode,
          difficulty,
        })
      : buildCreateQuizSignInPath({
          sourceType: "theme",
          theme,
          mode,
          difficulty,
        });

    posthog.capture("quiz_make_one_like_this_clicked", {
      quiz_id: quizId,
      mode,
      theme,
      signed_in: isSignedIn,
    });
    router.push(href);
  }, [difficulty, isSignedIn, mode, quizId, router, theme]);

  return {
    shareState,
    shareQuiz,
    makeOneLikeThis,
  };
}
