import React from "react";
import { ImageResponse } from "next/og";
import { SquareSocialCard } from "@/lib/brand-assets";

export async function GET() {
  return new ImageResponse(
    React.createElement(SquareSocialCard, {
      accentLabel: "Game night, upgraded",
      headline: "Turn any topic into a playable trivia night.",
      supportingCopy:
        "Make instant custom trivia from a topic, article, or PDF, then play solo, couch co-op, or a millionaire-style quiz show.",
    }),
    {
      width: 1080,
      height: 1080,
    },
  );
}
