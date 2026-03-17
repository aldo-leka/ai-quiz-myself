import React from "react";
import { ImageResponse } from "next/og";
import { BrandMark } from "@/lib/brand-assets";

export async function GET() {
  return new ImageResponse(
    React.createElement(
      "div",
      {
        style: {
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(circle at top center, rgba(34, 211, 238, 0.22), transparent 36%), linear-gradient(145deg, #081129, #020617)",
        },
      },
      React.createElement(BrandMark, { size: 820 }),
    ),
    {
      width: 1024,
      height: 1024,
    },
  );
}
