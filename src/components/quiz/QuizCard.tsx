"use client";

import { Clock3, Gamepad2, ThumbsUp, Trophy, Tv, UserRound, Users } from "lucide-react";
import { QuizCreatorAttribution } from "@/components/quiz/QuizCreatorAttribution";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type QuizCardDifficulty = "easy" | "medium" | "hard" | "mixed" | "escalating";
export type QuizCardMode = "single" | "wwtbam" | "couch_coop";
export type QuizCardStatusTone = "ready" | "generating" | "failed" | "neutral";

type QuizCardProps = {
  title: string;
  theme: string;
  difficulty: QuizCardDifficulty;
  gameMode: QuizCardMode;
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
};

function formatLikeRatio(likeRatio: number | null | undefined): string {
  if (likeRatio === null || likeRatio === undefined) return "No votes";
  return `${Math.round(likeRatio * 100)}% likes`;
}

function difficultyBadgeClass(difficulty: QuizCardDifficulty): string {
  if (difficulty === "easy") return "border-emerald-500/50 bg-emerald-500/20 text-emerald-200";
  if (difficulty === "medium") return "border-amber-500/50 bg-amber-500/20 text-amber-200";
  if (difficulty === "hard") return "border-rose-500/50 bg-rose-500/20 text-rose-200";
  if (difficulty === "escalating") return "border-violet-500/50 bg-violet-500/20 text-violet-200";
  return "border-cyan-500/50 bg-cyan-500/20 text-cyan-200";
}

function statusTextClass(tone: QuizCardStatusTone): string {
  if (tone === "ready") return "text-cyan-200";
  if (tone === "generating") return "text-amber-200";
  if (tone === "failed") return "text-rose-200";
  return "text-slate-200";
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

function QuizCardBody({
  title,
  theme,
  difficulty,
  gameMode,
  questionCount,
  playCount,
  likeRatio,
  creatorName,
  creatorImage,
  statusLabel,
  statusTone,
  showRating,
  children,
}: Omit<QuizCardProps, "interactive" | "onClick" | "onKeyDown" | "cardRef" | "className">) {
  const modeMeta = gameModeMeta(gameMode);

  return (
    <>
      <h3 className="line-clamp-2 text-2xl font-bold text-slate-100">{title}</h3>

      <div className="mt-4 flex flex-wrap gap-2">
        <QuizCreatorAttribution creatorName={creatorName} creatorImage={creatorImage} />
        <Badge
          variant="outline"
          className="min-h-8 border-cyan-500/40 bg-cyan-500/10 px-3 text-sm text-cyan-100"
        >
          {theme}
        </Badge>
        <Badge
          variant="outline"
          className={cn("min-h-8 px-3 text-sm", difficultyBadgeClass(difficulty))}
        >
          {difficulty === "escalating" ? "Escalating" : difficulty}
        </Badge>
      </div>

      <div className="mt-5 flex items-center gap-2 text-lg text-slate-200">
        <span className="text-cyan-300">{modeMeta.icon}</span>
        <span>{modeMeta.label}</span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 text-base text-slate-300">
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
          <div className="flex items-center gap-2 text-slate-400">
            <Gamepad2 className="size-4" />
            Questions
          </div>
          <div className="mt-1 text-2xl font-bold text-slate-100">{questionCount}</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
          <div className="flex items-center gap-2 text-slate-400">
            <Trophy className="size-4" />
            Plays
          </div>
          <div className="mt-1 text-2xl font-bold text-slate-100">{playCount}</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
          <div className="flex items-center gap-2 text-slate-400">
            <ThumbsUp className="size-4" />
            Rating
          </div>
          <div className="mt-1 text-xl font-bold text-slate-100">
            {showRating ? formatLikeRatio(likeRatio) : "—"}
          </div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
          <div className="flex items-center gap-2 text-slate-400">
            <Clock3 className="size-4" />
            Status
          </div>
          <div className={cn("mt-1 text-xl font-bold", statusTextClass(statusTone ?? "ready"))}>
            {statusLabel ?? "Ready"}
          </div>
        </div>
      </div>

      {children ? <div className="mt-4">{children}</div> : null}
    </>
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
    "min-h-[320px] rounded-2xl border border-slate-700 bg-slate-900/90 p-5 text-left transition",
    interactive &&
      "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
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
