"use client";

import { Clock3, Gamepad2, ThumbsUp, Trophy, Tv, UserRound, Users } from "lucide-react";
import { QuizCreatorAttribution } from "@/components/quiz/QuizCreatorAttribution";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type QuizCardDifficulty = "easy" | "medium" | "hard" | "mixed" | "escalating";
export type QuizCardMode = "single" | "wwtbam" | "couch_coop";
export type QuizCardStatusTone = "ready" | "generating" | "failed" | "neutral";
export type QuizCardSize = "default" | "large";
export type QuizCardGenerationProvider = "openai" | "anthropic" | "google";

type QuizCardProps = {
  title: string;
  theme: string;
  difficulty: QuizCardDifficulty;
  gameMode: QuizCardMode;
  generationProvider?: QuizCardGenerationProvider | null;
  questionCount: number;
  playCount: number;
  likeRatio?: number | null;
  creatorName?: string | null;
  creatorImage?: string | null;
  statusLabel?: string;
  statusTone?: QuizCardStatusTone;
  interactive?: boolean;
  onClick?: () => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  cardRef?: React.Ref<HTMLButtonElement>;
  className?: string;
  children?: React.ReactNode;
  showRating?: boolean;
  size?: QuizCardSize;
};

function formatLikeRatio(likeRatio: number | null | undefined): string {
  if (likeRatio === null || likeRatio === undefined) return "—";
  return `${Math.round(likeRatio * 100)}%`;
}

function difficultyBadgeClass(difficulty: QuizCardDifficulty): string {
  if (difficulty === "easy") return "border-emerald-500/50 bg-emerald-500/20 text-emerald-200";
  if (difficulty === "medium") return "border-amber-500/50 bg-amber-500/20 text-amber-200";
  if (difficulty === "hard") return "border-rose-500/50 bg-rose-500/20 text-rose-200";
  if (difficulty === "escalating") return "border-violet-500/50 bg-violet-500/20 text-violet-200";
  return "border-[#6c8aff]/45 bg-[#6c8aff]/18 text-[#818cf8]";
}

function statusTextClass(tone: QuizCardStatusTone): string {
  if (tone === "ready") return "text-[#4ade80]";
  if (tone === "generating") return "text-amber-200";
  if (tone === "failed") return "text-rose-200";
  return "text-[#e4e4e9]";
}

function gameModeMeta(mode: QuizCardMode): {
  label: string;
  icon: React.ReactNode;
} {
  if (mode === "single") {
    return { label: "Single Player", icon: <UserRound className="size-5" /> };
  }
  if (mode === "couch_coop") {
    return { label: "Couch Co-op", icon: <Users className="size-5" /> };
  }
  return { label: "WWTBAM", icon: <Tv className="size-5" /> };
}

function providerMeta(provider: QuizCardGenerationProvider): {
  label: string;
  className: string;
} {
  if (provider === "openai") {
    return {
      label: "OpenAI",
      className: "border-emerald-500/35 bg-emerald-500/12 text-emerald-200",
    };
  }

  if (provider === "anthropic") {
    return {
      label: "Anthropic",
      className: "border-amber-500/35 bg-amber-500/12 text-amber-200",
    };
  }

  return {
    label: "Google",
    className: "border-sky-500/35 bg-sky-500/12 text-sky-200",
  };
}

function QuizCardBody({
  title,
  difficulty,
  gameMode,
  generationProvider,
  questionCount,
  playCount,
  likeRatio,
  creatorName,
  creatorImage,
  statusLabel,
  statusTone,
  showRating = true,
  size = "default",
  children,
}: Omit<QuizCardProps, "interactive" | "onClick" | "onKeyDown" | "cardRef" | "className">) {
  const modeMeta = gameModeMeta(gameMode);
  const isLarge = size === "large";
  const provider = generationProvider ? providerMeta(generationProvider) : null;

  return (
    <div className="flex flex-1 flex-col">
      <h3
        className={cn(
          "line-clamp-2 font-bold text-[#e4e4e9]",
          isLarge ? "text-4xl leading-[0.95] md:text-5xl" : "text-2xl",
        )}
      >
        {title}
      </h3>

      <div className={cn("mt-4 flex flex-wrap gap-2", isLarge ? "gap-3" : "")}>
        <QuizCreatorAttribution
          creatorName={creatorName}
          creatorImage={creatorImage}
          size={isLarge ? "md" : "sm"}
        />
        <Badge
          variant="outline"
          className={cn(
            difficultyBadgeClass(difficulty),
            isLarge ? "min-h-10 px-4 text-base md:text-lg" : "min-h-8 px-3 text-sm",
          )}
        >
          {difficulty === "escalating" ? "Escalating" : difficulty}
        </Badge>
        {provider ? (
          <Badge
            variant="outline"
            className={cn(
              provider.className,
              isLarge ? "min-h-10 px-4 text-base md:text-lg" : "min-h-8 px-3 text-sm",
            )}
          >
            {provider.label}
          </Badge>
        ) : null}
      </div>

      <div className={cn("mt-auto space-y-4 pt-5", isLarge ? "space-y-5 pt-7" : "")}>
        <div
          className={cn(
            "flex items-center gap-2 text-[#e4e4e9]",
            isLarge ? "text-2xl md:text-4xl" : "text-lg",
          )}
        >
          <span className="text-[#818cf8]">{modeMeta.icon}</span>
          <span>{modeMeta.label}</span>
        </div>

        <div className={cn("grid grid-cols-2 gap-3 text-[#9394a5]", isLarge ? "gap-4" : "text-base")}>
          <div className={cn("rounded-lg border border-[#252940] bg-[#0f1117]/82", isLarge ? "p-4" : "p-3")}>
            <div
              className={cn(
                "flex items-center gap-2 text-[#9394a5]",
                isLarge ? "text-lg md:text-xl" : "",
              )}
            >
              <Gamepad2 className={cn(isLarge ? "size-5 md:size-6" : "size-4")} />
              Questions
            </div>
            <div className={cn("mt-1 font-bold text-[#e4e4e9]", isLarge ? "text-4xl md:text-5xl" : "text-2xl")}>
              {questionCount}
            </div>
          </div>
          <div className={cn("rounded-lg border border-[#252940] bg-[#0f1117]/82", isLarge ? "p-4" : "p-3")}>
            <div
              className={cn(
                "flex items-center gap-2 text-[#9394a5]",
                isLarge ? "text-lg md:text-xl" : "",
              )}
            >
              <Trophy className={cn(isLarge ? "size-5 md:size-6" : "size-4")} />
              Plays
            </div>
            <div className={cn("mt-1 font-bold text-[#e4e4e9]", isLarge ? "text-4xl md:text-5xl" : "text-2xl")}>
              {playCount}
            </div>
          </div>
          <div className={cn("rounded-lg border border-[#252940] bg-[#0f1117]/82", isLarge ? "p-4" : "p-3")}>
            <div
              className={cn(
                "flex items-center gap-2 text-[#9394a5]",
                isLarge ? "text-lg md:text-xl" : "",
              )}
            >
              <ThumbsUp className={cn(isLarge ? "size-5 md:size-6" : "size-4")} />
              Rating
            </div>
            <div className={cn("mt-1 font-bold text-[#e4e4e9]", isLarge ? "text-3xl md:text-4xl" : "text-xl")}>
              {showRating ? formatLikeRatio(likeRatio) : "—"}
            </div>
          </div>
          <div className={cn("rounded-lg border border-[#252940] bg-[#0f1117]/82", isLarge ? "p-4" : "p-3")}>
            <div
              className={cn(
                "flex items-center gap-2 text-[#9394a5]",
                isLarge ? "text-lg md:text-xl" : "",
              )}
            >
              <Clock3 className={cn(isLarge ? "size-5 md:size-6" : "size-4")} />
              Status
            </div>
            <div
              className={cn(
                "mt-1 font-bold",
                statusTextClass(statusTone ?? "ready"),
                isLarge ? "text-3xl md:text-4xl" : "text-xl",
              )}
            >
              {statusLabel ?? "Ready"}
            </div>
          </div>
        </div>

        {children ? <div>{children}</div> : null}
      </div>
    </div>
  );
}

export function QuizCard({
  interactive = false,
  onClick,
  onKeyDown,
  cardRef,
  className,
  ...props
}: QuizCardProps) {
  const classes = cn(
    "flex min-h-[320px] flex-col rounded-2xl border border-[#252940] bg-[#1a1d2e]/92 p-5 text-left transition",
    props.size === "large" ? "min-h-[460px] p-6 md:min-h-[520px] md:p-7" : "",
    interactive &&
      "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#818cf8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f1117]",
    className,
  );

  if (interactive) {
    return (
      <button
        ref={cardRef}
        type="button"
        onClick={onClick}
        onKeyDown={onKeyDown}
        className={classes}
      >
        <QuizCardBody {...props} />
      </button>
    );
  }

  return (
    <div className={classes}>
      <QuizCardBody {...props} />
    </div>
  );
}
