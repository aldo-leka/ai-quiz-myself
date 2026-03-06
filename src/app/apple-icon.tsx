import { ImageResponse } from "next/og";
import { BrandMark } from "@/lib/brand-assets";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(145deg, #081129, #020617)",
        }}
      >
        <BrandMark size={148} />
      </div>
    ),
    size,
  );
}
