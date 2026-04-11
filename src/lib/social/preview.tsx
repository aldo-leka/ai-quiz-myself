import React from "react";
import { CHECKPOINTS, formatMoney, MONEY_LADDER } from "@/lib/quiz-constants";
import { SOCIAL_FRAME_VARIANTS, type SocialFrameKind, type SocialFrameVariant, type SocialQuizSnapshot } from "@/lib/social/types";

const singleColors = {
  pageBg: "#0f1117",
  panelBg: "#1a1d2e",
  panelMuted: "#11141f",
  border: "#252940",
  primary: "#818cf8",
  primarySoft: "rgba(129, 140, 248, 0.18)",
  text: "#e4e4e9",
  muted: "#9394a5",
  emerald: "#34d399",
  emeraldSoft: "rgba(52, 211, 153, 0.22)",
  accent: "#6c8aff",
};

const wwtbamColors = {
  pageBg: "#040816",
  pageBgAlt: "#0a1433",
  panelBg: "#08142f",
  panelMuted: "#091120",
  border: "rgba(99, 179, 237, 0.2)",
  gold: "#f7c86a",
  goldSoft: "rgba(247, 200, 106, 0.2)",
  blue: "#7dd3fc",
  blueSoft: "rgba(125, 211, 252, 0.18)",
  text: "#ecf6ff",
  muted: "#9eb7d7",
  emerald: "#4ade80",
};

const brandUrl = "quizplus.io";
const familyNightStickerText = `Especially designed for "family nights" on TV`;

function getQuestionForFrame(snapshot: SocialQuizSnapshot, questionPosition: number | null) {
  if (questionPosition === null) {
    return null;
  }

  return snapshot.questions.find((question) => question.position === questionPosition) ?? null;
}

function getFrameKind(snapshot: SocialQuizSnapshot, frameIndex: number): {
  kind: SocialFrameKind;
  questionPosition: number | null;
} {
  if (frameIndex >= snapshot.questions.length) {
    return {
      kind: "cta",
      questionPosition: null,
    };
  }

  const question = snapshot.questions[frameIndex];
  const isLastSelectedQuestion = frameIndex === snapshot.questions.length - 1;
  const kind =
    snapshot.gameMode === "wwtbam"
      ? isLastSelectedQuestion
        ? "wwtbam-question-unanswered"
        : "wwtbam-question-reveal"
      : isLastSelectedQuestion
        ? "single-question-unanswered"
        : "single-question-reveal";

  return {
    kind,
    questionPosition: question.position,
  };
}

function buildSharedRootStyle(variant: SocialFrameVariant, mode: SocialQuizSnapshot["gameMode"]) {
  const palette = mode === "wwtbam" ? wwtbamColors : singleColors;

  return {
    display: "flex",
    position: "relative" as const,
    width: "100%",
    height: "100%",
    overflow: "hidden",
    background:
      mode === "wwtbam"
        ? `radial-gradient(circle at top left, rgba(247, 200, 106, 0.16), transparent 28%), radial-gradient(circle at bottom right, rgba(125, 211, 252, 0.16), transparent 26%), linear-gradient(180deg, ${wwtbamColors.pageBg}, ${wwtbamColors.pageBgAlt})`
        : `radial-gradient(circle at top left, rgba(129, 140, 248, 0.18), transparent 30%), radial-gradient(circle at bottom right, rgba(108, 138, 255, 0.16), transparent 28%), linear-gradient(180deg, ${palette.pageBg}, #121724)`,
    color: palette.text,
    fontFamily: "system-ui, sans-serif",
  };
}

function buildPhoneShellStyle(variant: SocialFrameVariant) {
  const isStory = variant === "story";

  return {
    display: "flex",
    flexDirection: "column" as const,
    width: "100%",
    height: "100%",
    padding: isStory ? "28px 24px 30px" : "18px 16px 20px",
  };
}

function Badge({
  children,
  tone = "primary",
  variant = "feed",
  size = "normal",
}: {
  children: React.ReactNode;
  tone?: "primary" | "muted" | "success" | "gold";
  variant?: SocialFrameVariant;
  size?: "normal" | "large";
}) {
  const isStory = variant === "story";
  const isLarge = size === "large";
  const background =
    tone === "primary"
      ? singleColors.primarySoft
      : tone === "success"
        ? singleColors.emeraldSoft
        : tone === "gold"
          ? wwtbamColors.goldSoft
          : "rgba(255,255,255,0.08)";
  const color =
    tone === "primary"
      ? singleColors.primary
      : tone === "success"
        ? singleColors.emerald
        : tone === "gold"
          ? wwtbamColors.gold
          : "#c9cede";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 999,
        padding: isLarge ? (isStory ? "14px 24px" : "12px 22px") : "8px 14px",
        background,
        color,
        fontSize: isLarge ? (isStory ? 36 : 32) : isStory ? 18 : 16,
        fontWeight: 700,
        letterSpacing: "0.01em",
      }}
    >
      {children}
    </div>
  );
}

function FamilyNightSticker({
  variant,
  mode,
}: {
  variant: SocialFrameVariant;
  mode: SocialQuizSnapshot["gameMode"];
}) {
  const isStory = variant === "story";
  const isWwtbam = mode === "wwtbam";
  const color = isWwtbam ? wwtbamColors.gold : singleColors.emerald;

  return (
    <div
      style={{
        display: "flex",
        position: "absolute" as const,
        right: isStory ? 28 : 22,
        bottom: isStory ? -48 : -40,
        transform: "rotate(-7deg)",
        maxWidth: isStory ? 760 : 640,
        padding: isStory ? "28px 40px" : "24px 36px",
        borderRadius: 28,
        border: `5px solid ${color}`,
        background: isWwtbam ? "rgba(4, 8, 22, 0.92)" : "rgba(15, 17, 23, 0.92)",
        color,
        fontSize: isStory ? 48 : 40,
        fontWeight: 950,
        letterSpacing: "0.04em",
        lineHeight: 1.08,
        textTransform: "uppercase" as const,
        textAlign: "center" as const,
        boxShadow: isWwtbam
          ? "0 0 0 6px rgba(247, 200, 106, 0.12)"
          : "0 0 0 6px rgba(52, 211, 153, 0.12)",
      }}
    >
      {familyNightStickerText}
    </div>
  );
}

function SocialHeader({
  snapshot,
  variant,
  modeLabel,
}: {
  snapshot: SocialQuizSnapshot;
  variant: SocialFrameVariant;
  modeLabel: string;
}) {
  const isStory = variant === "story";
  const isSingle = snapshot.gameMode === "single";
  const logoSize = isStory ? 96 : 84;
  const logoFontSize = isStory ? 52 : 44;
  const brandFontSize = isStory ? 44 : 36;
  const modeFontSize = isStory ? 36 : 28;
  const titleFontSize = isSingle && !isStory ? 48 : isStory ? 44 : 32;
  const creatorFontSize = isStory ? (isSingle ? 30 : 40) : 24;
  const headerPrompt =
    snapshot.gameMode === "wwtbam"
      ? "Can you climb the ladder?"
      : "How many can you get right?";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: isStory ? 18 : 14,
        marginBottom: isStory ? 26 : 18,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: isStory ? 22 : 18,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: logoSize,
              height: logoSize,
              borderRadius: isStory ? 28 : 24,
              background: "linear-gradient(145deg, #0b1736, #020617)",
              border: "1px solid rgba(129, 140, 248, 0.28)",
              fontSize: logoFontSize,
              fontWeight: 900,
              color: "#f8fafc",
            }}
          >
            Q+
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: isStory ? 8 : 6,
            }}
          >
            <div
              style={{
                fontSize: brandFontSize,
                fontWeight: 800,
                color: "#f8fafc",
              }}
            >
              QuizPlus
            </div>
            <div
              style={{
                fontSize: modeFontSize,
                color: modeLabel === "Millionaire Mode" ? wwtbamColors.muted : singleColors.muted,
              }}
            >
              {modeLabel}
            </div>
          </div>
        </div>

        <Badge tone={snapshot.gameMode === "wwtbam" ? "gold" : "primary"} variant={variant} size="large">
          {headerPrompt}
        </Badge>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div
          style={{
            fontSize: titleFontSize,
            lineHeight: 1.02,
            fontWeight: 900,
            letterSpacing: "-0.04em",
            color: snapshot.gameMode === "wwtbam" ? wwtbamColors.text : singleColors.text,
          }}
        >
          {snapshot.title}
        </div>
        {snapshot.creatorName ? (
          <div
            style={{
              display: "flex",
              fontSize: creatorFontSize,
              color: snapshot.gameMode === "wwtbam" ? wwtbamColors.muted : singleColors.muted,
            }}
          >
            {`Created by ${snapshot.creatorName}`}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SingleAnswerCard({
  label,
  text,
  isCorrect,
  variant,
}: {
  label: string;
  text: string;
  isCorrect: boolean;
  variant: SocialFrameVariant;
}) {
  const isStory = variant === "story";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: isStory ? 18 : 16,
        minHeight: isStory ? 108 : 88,
        borderRadius: 28,
        padding: isStory ? "16px 18px" : "14px 16px",
        border: `1px solid ${isCorrect ? "rgba(52, 211, 153, 0.44)" : singleColors.border}`,
        background: isCorrect
          ? "linear-gradient(180deg, rgba(52, 211, 153, 0.26), rgba(15, 17, 23, 0.94))"
          : "linear-gradient(180deg, rgba(15, 17, 23, 0.84), rgba(11, 14, 22, 0.98))",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: isStory ? 56 : 52,
          height: isStory ? 56 : 52,
          borderRadius: 999,
          background: isCorrect ? "rgba(52, 211, 153, 0.24)" : "rgba(129, 140, 248, 0.18)",
          color: isCorrect ? singleColors.emerald : singleColors.primary,
          fontSize: isStory ? 26 : 24,
          fontWeight: 900,
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flex: 1,
          fontSize: isStory ? 48 : 36,
          lineHeight: 1.08,
          fontWeight: 700,
          color: singleColors.text,
        }}
      >
        {text}
      </div>
    </div>
  );
}

function SingleQuestionFrame({
  snapshot,
  questionPosition,
  variant,
  revealed,
}: {
  snapshot: SocialQuizSnapshot;
  questionPosition: number;
  variant: SocialFrameVariant;
  revealed: boolean;
}) {
  const isStory = variant === "story";
  const question = getQuestionForFrame(snapshot, questionPosition);
  if (!question) {
    return null;
  }

  const correctOption = question.options[question.correctOptionIndex];

  return (
    <div
      style={{
        display: "flex",
        flex: 1,
        flexDirection: "column",
        gap: isStory ? 18 : 14,
        position: "relative" as const,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <Badge tone="primary" variant={variant} size="large">
          Question {question.position}
        </Badge>
        <Badge tone={revealed ? "success" : "muted"} variant={variant} size="large">
          {revealed ? "Answer revealed" : "Your turn"}
        </Badge>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          padding: isStory ? "18px 18px 16px" : "16px 16px 14px",
          borderRadius: 26,
          border: `1px solid ${singleColors.border}`,
          background: "linear-gradient(180deg, rgba(15, 17, 23, 0.88), rgba(13, 15, 22, 0.98))",
        }}
      >
        <div
          style={{
            fontSize: isStory ? 60 : 39,
            lineHeight: 1.06,
            fontWeight: 900,
            letterSpacing: "-0.03em",
            color: singleColors.text,
          }}
        >
          {question.questionText}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {question.options.map((option, index) => (
            <SingleAnswerCard
              key={`${question.id}-${index}`}
              label={String.fromCharCode(65 + index)}
              text={option.text}
              isCorrect={revealed && index === question.correctOptionIndex}
              variant={variant}
            />
          ))}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          position: "relative" as const,
          gap: 6,
          padding: isStory ? "16px 18px" : "14px 16px",
          borderRadius: 24,
          border: `1px solid ${singleColors.border}`,
          background: "rgba(15, 17, 23, 0.78)",
        }}
      >
        <div
          style={{
            fontSize: isStory ? 40 : 32,
            fontWeight: 800,
            textTransform: "uppercase" as const,
            letterSpacing: "0.08em",
            color: revealed ? singleColors.emerald : singleColors.primary,
          }}
        >
          {revealed ? "Correct answer" : "Think you know it?"}
        </div>
        <div
          style={{
            fontSize: isStory ? 40 : 32,
            lineHeight: 1.3,
            color: singleColors.muted,
          }}
        >
          {revealed
            ? (correctOption?.explanation || "The full explanation appears in the live quiz.")
            : "Take your shot, then open the full quiz to see if you can finish the round."}
        </div>
        {revealed ? <FamilyNightSticker variant={variant} mode={snapshot.gameMode} /> : null}
      </div>
    </div>
  );
}

function WwtbamChoiceCard({
  label,
  text,
  isCorrect,
  variant,
}: {
  label: string;
  text: string;
  isCorrect: boolean;
  variant: SocialFrameVariant;
}) {
  const isStory = variant === "story";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: isStory ? 18 : 14,
        minHeight: isStory ? 92 : 76,
        borderRadius: 999,
        padding: isStory ? "14px 18px" : "12px 16px",
        border: `1px solid ${isCorrect ? "rgba(247, 200, 106, 0.5)" : wwtbamColors.border}`,
        background: isCorrect
          ? "linear-gradient(90deg, rgba(247, 200, 106, 0.24), rgba(14, 25, 54, 0.98))"
          : "linear-gradient(90deg, rgba(10, 19, 43, 0.96), rgba(9, 17, 32, 0.96))",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: isStory ? 52 : 46,
          height: isStory ? 52 : 46,
          borderRadius: 999,
          background: isCorrect ? "rgba(247, 200, 106, 0.18)" : "rgba(125, 211, 252, 0.16)",
          color: isCorrect ? wwtbamColors.gold : wwtbamColors.blue,
          fontSize: isStory ? 24 : 22,
          fontWeight: 900,
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flex: 1,
          fontSize: isStory ? 44 : 34,
          lineHeight: 1.08,
          fontWeight: 700,
          color: wwtbamColors.text,
        }}
      >
        {text}
      </div>
    </div>
  );
}

function WwtbamMoneyLadder({
  questionPosition,
  variant,
}: {
  questionPosition: number;
  variant: SocialFrameVariant;
}) {
  const isStory = variant === "story";
  const millionPosition = MONEY_LADDER.length;
  const millionValue = MONEY_LADDER[MONEY_LADDER.length - 1];
  const ladderEntries = isStory
    ? [
        {
          value: millionValue,
          position: millionPosition,
          isStoryJackpot: true,
        },
        ...MONEY_LADDER.slice(0, Math.max(questionPosition + 1, 5))
          .map((value, index) => ({
            value,
            position: index + 1,
            isStoryJackpot: false,
          }))
          .reverse()
          .filter((entry) => entry.value !== millionValue),
      ]
    : [...MONEY_LADDER.entries()].reverse().map(([index, value]) => ({
        value,
        position: index + 1,
        isStoryJackpot: false,
      }));

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: isStory ? "16px" : "12px",
        borderRadius: 24,
        border: `1px solid ${wwtbamColors.border}`,
        background: "rgba(6, 11, 26, 0.82)",
        minWidth: isStory ? 208 : 204,
      }}
    >
      <div
        style={{
          fontSize: isStory ? 16 : 14,
          color: wwtbamColors.muted,
          textTransform: "uppercase" as const,
          letterSpacing: "0.12em",
          fontWeight: 700,
        }}
      >
        Money Ladder
      </div>
      {ladderEntries.map((entry) => {
          const isCurrent = entry.position === questionPosition;
          const isCheckpoint = CHECKPOINTS.includes((entry.position - 1) as (typeof CHECKPOINTS)[number]);
          const isPassed = entry.position < questionPosition;

          return (
            <div
              key={entry.position}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                borderRadius: entry.isStoryJackpot ? 18 : 14,
                padding: isStory ? "10px 12px" : "8px 10px",
                background: entry.isStoryJackpot
                  ? "linear-gradient(90deg, rgba(247, 200, 106, 0.28), rgba(125, 211, 252, 0.18))"
                  : isCurrent
                    ? "linear-gradient(90deg, rgba(247, 200, 106, 0.24), rgba(125, 211, 252, 0.14))"
                    : isPassed
                      ? "rgba(52, 211, 153, 0.18)"
                      : isCheckpoint
                        ? "rgba(247, 200, 106, 0.08)"
                        : "rgba(15, 17, 23, 0.96)",
                border: `1px solid ${
                  entry.isStoryJackpot
                    ? "rgba(247, 200, 106, 0.72)"
                    : isCurrent
                      ? "rgba(247, 200, 106, 0.5)"
                      : isPassed
                        ? "rgba(52, 211, 153, 0.56)"
                        : "rgba(37, 41, 64, 0.98)"
                }`,
                boxShadow:
                  entry.isStoryJackpot || isCheckpoint
                    ? "0 0 0 2px rgba(250, 204, 21, 0.35)"
                    : "none",
              }}
            >
              <span
                style={{
                  fontSize: isStory ? 18 : 14,
                  fontWeight: 800,
                  color: isCurrent || entry.isStoryJackpot ? wwtbamColors.gold : wwtbamColors.muted,
                  letterSpacing: "0.12em",
                }}
              >
                {entry.position}
              </span>
              <span
                style={{
                  fontSize: isStory ? 20 : 15,
                  fontWeight: 800,
                  color:
                    isCurrent || isCheckpoint || isPassed || entry.isStoryJackpot
                      ? wwtbamColors.text
                      : wwtbamColors.muted,
                }}
              >
                {formatMoney(entry.value)}
              </span>
            </div>
          );
        })}
    </div>
  );
}

function WwtbamQuestionFrame({
  snapshot,
  questionPosition,
  variant,
  revealed,
}: {
  snapshot: SocialQuizSnapshot;
  questionPosition: number;
  variant: SocialFrameVariant;
  revealed: boolean;
}) {
  const isStory = variant === "story";
  const question = getQuestionForFrame(snapshot, questionPosition);
  if (!question) {
    return null;
  }

  const correctOption = question.options[question.correctOptionIndex];

  return (
    <div
      style={{
        display: "flex",
        flex: 1,
        flexDirection: isStory ? "column" : "row",
        gap: isStory ? 16 : 12,
        position: "relative" as const,
      }}
    >
      <div
        style={{
          display: "flex",
          flex: 1,
          flexDirection: "column",
          gap: isStory ? 18 : 14,
        }}
      >
        <div
          style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
        >
          <Badge tone="gold" variant={variant} size="large">
            {formatMoney(MONEY_LADDER[Math.max(0, question.position - 1)] ?? 0)}
          </Badge>
          <Badge tone={revealed ? "gold" : "muted"} variant={variant} size="large">
            {revealed ? "Final answer locked in" : "What would you lock in?"}
          </Badge>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            padding: isStory ? "18px 18px 16px" : "16px 16px 14px",
            borderRadius: 24,
            border: `1px solid ${wwtbamColors.border}`,
            background:
              "radial-gradient(circle at top center, rgba(125, 211, 252, 0.12), transparent 40%), linear-gradient(180deg, rgba(8, 20, 47, 0.96), rgba(9, 17, 32, 0.98))",
          }}
        >
          <div
            style={{
              fontSize: isStory ? 57 : 36,
              lineHeight: 1.06,
              fontWeight: 900,
              letterSpacing: "-0.03em",
              color: wwtbamColors.text,
            }}
          >
            {question.questionText}
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {question.options.map((option, index) => (
              <WwtbamChoiceCard
                key={`${question.id}-${index}`}
                label={String.fromCharCode(65 + index)}
                text={option.text}
                isCorrect={revealed && index === question.correctOptionIndex}
                variant={variant}
              />
            ))}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            position: "relative" as const,
            gap: 6,
            padding: isStory ? "14px 16px" : "12px 14px",
            borderRadius: 22,
            border: `1px solid ${wwtbamColors.border}`,
            background: "rgba(6, 11, 26, 0.75)",
          }}
        >
          <div
            style={{
              fontSize: isStory ? 40 : 30,
              fontWeight: 800,
              textTransform: "uppercase" as const,
              letterSpacing: "0.12em",
              color: revealed ? wwtbamColors.gold : wwtbamColors.blue,
            }}
          >
            {revealed ? "Voice-enabled" : "What would you pick?"}
          </div>
          <div
            style={{
              fontSize: isStory ? 38 : 30,
              lineHeight: 1.32,
              color: wwtbamColors.muted,
            }}
          >
            {revealed
              ? (correctOption?.explanation || "The live game explains the reasoning after the reveal.")
              : "Would you lock it in? Open the full game and see how far you can go."}
          </div>
          {revealed ? <FamilyNightSticker variant={variant} mode={snapshot.gameMode} /> : null}
        </div>
      </div>

      <WwtbamMoneyLadder questionPosition={question.position} variant={variant} />
    </div>
  );
}

function CtaFrame({
  snapshot,
  variant,
}: {
  snapshot: SocialQuizSnapshot;
  variant: SocialFrameVariant;
}) {
  const isStory = variant === "story";
  const palette = snapshot.gameMode === "wwtbam" ? wwtbamColors : singleColors;

  return (
    <div
      style={{
        display: "flex",
        flex: 1,
        flexDirection: "column",
        justifyContent: "space-between",
        gap: isStory ? 18 : 14,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 14,
          padding: isStory ? "18px 18px 16px" : "16px 16px 14px",
          borderRadius: 24,
          border: `1px solid ${palette.border}`,
          background:
            snapshot.gameMode === "wwtbam"
              ? "radial-gradient(circle at top center, rgba(247, 200, 106, 0.16), transparent 42%), linear-gradient(180deg, rgba(8, 20, 47, 0.96), rgba(9, 17, 32, 0.98))"
              : "radial-gradient(circle at top center, rgba(129, 140, 248, 0.16), transparent 40%), linear-gradient(180deg, rgba(26, 29, 46, 0.96), rgba(15, 17, 23, 0.98))",
        }}
      >
        <Badge tone={snapshot.gameMode === "wwtbam" ? "gold" : "primary"} variant={variant}>
          {snapshot.gameMode === "wwtbam" ? "Ready for the hot seat?" : "Ready for the full round?"}
        </Badge>
        <div
          style={{
            fontSize: isStory ? 44 : 34,
            lineHeight: 1,
            fontWeight: 900,
            letterSpacing: "-0.05em",
            color: palette.text,
          }}
        >
          {snapshot.gameMode === "wwtbam"
            ? "Think you can reach the top?"
            : "Think you can finish this quiz?"}
        </div>
        <div
          style={{
            fontSize: isStory ? 22 : 18,
            lineHeight: 1.24,
            color: palette.muted,
          }}
        >
          {snapshot.gameMode === "wwtbam"
            ? "Play the full QuizPlus challenge and see whether you can survive the whole ladder."
            : "Jump into the full QuizPlus game and see whether you can clear every question."}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: isStory ? "column" : "row",
          flexWrap: "wrap",
          gap: 14,
        }}
      >
        {[
          snapshot.gameMode === "wwtbam" ? "Millionaire-style suspense" : "Fast mobile trivia",
          snapshot.gameMode === "wwtbam" ? "One question at a time" : "Play in seconds",
          snapshot.gameMode === "wwtbam" ? "See how far you get" : "Beat the full round",
        ].map((item) => (
          <div
            key={item}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: isStory ? 86 : 98,
              padding: "16px 18px",
              borderRadius: 22,
              border: `1px solid ${palette.border}`,
              background: "rgba(10, 14, 24, 0.78)",
              fontSize: isStory ? 20 : 17,
              fontWeight: 700,
              lineHeight: 1.15,
              color: palette.text,
              textAlign: "center" as const,
              flex: isStory ? "0 0 auto" : "1 1 0%",
            }}
          >
            {item}
          </div>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          padding: isStory ? "16px 18px" : "14px 16px",
          borderRadius: 24,
          border: `1px solid ${palette.border}`,
          background: "rgba(255,255,255,0.04)",
        }}
      >
        <div
          style={{
            fontSize: isStory ? 18 : 16,
            textTransform: "uppercase" as const,
            letterSpacing: "0.12em",
            fontWeight: 800,
            color: snapshot.gameMode === "wwtbam" ? wwtbamColors.gold : singleColors.primary,
          }}
        >
          Play at
        </div>
        <div
          style={{
            fontSize: isStory ? 34 : 28,
            lineHeight: 1.06,
            fontWeight: 900,
            letterSpacing: "-0.04em",
            color: palette.text,
          }}
        >
          {brandUrl}
        </div>
        <div
          style={{
            fontSize: isStory ? 19 : 16,
            lineHeight: 1.25,
            color: palette.muted,
          }}
        >
          Open the full QuizPlus game and play this exact quiz for yourself.
        </div>
      </div>
    </div>
  );
}

export function SocialCarouselFrameImage({
  snapshot,
  frameIndex,
  variant,
}: {
  snapshot: SocialQuizSnapshot;
  frameIndex: number;
  variant: SocialFrameVariant;
}) {
  const frame = getFrameKind(snapshot, frameIndex);
  const modeLabel =
    snapshot.gameMode === "wwtbam" ? "Millionaire Mode" : "Single Player";

  return (
    <div style={buildSharedRootStyle(variant, snapshot.gameMode)}>
      <div style={buildPhoneShellStyle(variant)}>
        <SocialHeader snapshot={snapshot} variant={variant} modeLabel={modeLabel} />
        {frame.kind === "cta" ? (
          <CtaFrame snapshot={snapshot} variant={variant} />
        ) : snapshot.gameMode === "wwtbam" ? (
          <WwtbamQuestionFrame
            snapshot={snapshot}
            questionPosition={frame.questionPosition ?? 1}
            variant={variant}
            revealed={frame.kind === "wwtbam-question-reveal"}
          />
        ) : (
          <SingleQuestionFrame
            snapshot={snapshot}
            questionPosition={frame.questionPosition ?? 1}
            variant={variant}
            revealed={frame.kind === "single-question-reveal"}
          />
        )}
      </div>
    </div>
  );
}

export function getSocialFrameDimensions(variant: SocialFrameVariant) {
  return SOCIAL_FRAME_VARIANTS[variant];
}
