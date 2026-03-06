import { ImageResponse } from "next/og";
import { SocialCard } from "@/lib/brand-assets";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export const alt = "QuizPlus social preview";

export default function OpenGraphImage() {
  return new ImageResponse(<SocialCard accentLabel="AI-generated quiz nights" />, size);
}
