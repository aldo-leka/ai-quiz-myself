import React from "react";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

const brandColors = {
  bgFrom: "#081129",
  bgTo: "#020617",
  panel: "#0f1f45",
  cyan: "#67e8f9",
  cyanStrong: "#06b6d4",
  cyanSoft: "#22d3ee",
  text: "#f8fafc",
  textMuted: "#cbd5e1",
  border: "rgba(34, 211, 238, 0.4)",
};

type BrandMarkProps = {
  size: number;
};

export function BrandMark({ size }: BrandMarkProps) {
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: size * 0.24,
        border: `2px solid ${brandColors.border}`,
        background: `linear-gradient(145deg, ${brandColors.bgFrom}, ${brandColors.bgTo})`,
        boxShadow: "0 0 48px rgba(6, 182, 212, 0.22)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: size * 0.14,
          borderRadius: size * 0.18,
          background:
            "linear-gradient(180deg, rgba(34,211,238,0.14), rgba(2,6,23,0))",
        }}
      />
      <div
        style={{
          position: "relative",
          display: "flex",
          fontSize: size * 0.68,
          lineHeight: 1,
          fontWeight: 900,
          letterSpacing: "-0.08em",
          color: brandColors.text,
          textShadow: "0 0 24px rgba(103, 232, 249, 0.18)",
        }}
      >
        Q
      </div>
      <div
        style={{
          position: "absolute",
          top: size * 0.18,
          right: size * 0.2,
          width: size * 0.16,
          height: size * 0.16,
          borderRadius: size * 0.05,
          background: "rgba(103, 232, 249, 0.18)",
          transform: "rotate(45deg)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: size * 0.16,
          right: size * 0.22,
          width: size * 0.12,
          height: size * 0.12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: brandColors.cyan,
          fontSize: size * 0.14,
          fontWeight: 800,
        }}
      >
        +
      </div>
    </div>
  );
}

type SocialCardProps = {
  accentLabel?: string;
};

type SquareSocialCardProps = {
  accentLabel?: string;
  headline?: string;
  supportingCopy?: string;
};

function SocialPill({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 999,
        border: `1px solid ${brandColors.border}`,
        background: "rgba(8, 17, 41, 0.72)",
        padding: "12px 22px",
        color: brandColors.cyan,
        fontSize: 24,
        fontWeight: 700,
      }}
    >
      {children}
    </div>
  );
}

export function SocialCard({ accentLabel = "Play smarter" }: SocialCardProps) {
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        padding: "56px",
        background: `radial-gradient(circle at top center, rgba(34, 211, 238, 0.16), transparent 34%),
          linear-gradient(145deg, ${brandColors.bgFrom}, ${brandColors.bgTo})`,
        color: brandColors.text,
      }}
    >
      <div
        style={{
          display: "flex",
          width: "100%",
          borderRadius: 42,
          border: `1px solid ${brandColors.border}`,
          background: "rgba(2, 6, 23, 0.72)",
          padding: "44px 48px",
          boxShadow: "0 18px 72px rgba(2, 6, 23, 0.32)",
        }}
      >
        <div
          style={{
            display: "flex",
            width: "100%",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 36,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
            <BrandMark size={190} />
            <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 650 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  color: brandColors.cyan,
                  fontSize: 26,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                <span>{accentLabel}</span>
              </div>
              <div
                style={{
                  display: "flex",
                  fontSize: 74,
                  fontWeight: 900,
                  letterSpacing: "-0.06em",
                  lineHeight: 0.95,
                }}
              >
                {SITE_NAME}
              </div>
              <div
                style={{
                  display: "flex",
                  fontSize: 30,
                  lineHeight: 1.35,
                  color: brandColors.textMuted,
                  maxWidth: 760,
                }}
              >
                {SITE_DESCRIPTION}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 20 }}>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "flex-end",
                gap: 14,
                maxWidth: 360,
              }}
            >
              <SocialPill>Single Player</SocialPill>
              <SocialPill>Couch Co-op</SocialPill>
              <SocialPill>WWTBAM</SocialPill>
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 28,
                fontWeight: 700,
                color: brandColors.textMuted,
              }}
            >
              quizplus.io
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SquareSocialCard({
  accentLabel = "Custom trivia night",
  headline = "Make a quiz. Play it like a game show.",
  supportingCopy = "Turn a topic, article, or PDF into instant trivia, then play solo, couch co-op, or millionaire-style.",
}: SquareSocialCardProps) {
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        padding: "64px",
        background: `radial-gradient(circle at top center, rgba(34, 211, 238, 0.22), transparent 38%),
          linear-gradient(145deg, ${brandColors.bgFrom}, ${brandColors.bgTo})`,
        color: brandColors.text,
      }}
    >
      <div
        style={{
          position: "relative",
          display: "flex",
          width: "100%",
          height: "100%",
          flexDirection: "column",
          justifyContent: "space-between",
          borderRadius: 52,
          border: `1px solid ${brandColors.border}`,
          background:
            "linear-gradient(180deg, rgba(15, 31, 69, 0.88), rgba(2, 6, 23, 0.92))",
          padding: "54px",
          boxShadow: "0 24px 88px rgba(2, 6, 23, 0.34)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -140,
            right: -110,
            width: 380,
            height: 380,
            borderRadius: "50%",
            background: "rgba(34, 211, 238, 0.08)",
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <BrandMark size={176} />
            <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 560 }}>
              <div
                style={{
                  display: "flex",
                  color: brandColors.cyan,
                  fontSize: 24,
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                {accentLabel}
              </div>
              <div
                style={{
                  display: "flex",
                  fontSize: 78,
                  fontWeight: 900,
                  letterSpacing: "-0.06em",
                  lineHeight: 0.94,
                }}
              >
                {SITE_NAME}
              </div>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 999,
              border: `1px solid ${brandColors.border}`,
              background: "rgba(8, 17, 41, 0.72)",
              padding: "14px 24px",
              color: brandColors.textMuted,
              fontSize: 26,
              fontWeight: 700,
            }}
          >
            quizplus.io
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 30 }}>
          <div
            style={{
              display: "flex",
              maxWidth: 880,
              fontSize: 88,
              fontWeight: 900,
              letterSpacing: "-0.08em",
              lineHeight: 0.94,
            }}
          >
            {headline}
          </div>
          <div
            style={{
              display: "flex",
              maxWidth: 860,
              fontSize: 34,
              lineHeight: 1.3,
              color: brandColors.textMuted,
            }}
          >
            {supportingCopy}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          <SocialPill>Topic</SocialPill>
          <SocialPill>Article</SocialPill>
          <SocialPill>PDF</SocialPill>
          <SocialPill>Single Player</SocialPill>
          <SocialPill>Couch Co-op</SocialPill>
          <SocialPill>Millionaire Mode</SocialPill>
        </div>
      </div>
    </div>
  );
}
