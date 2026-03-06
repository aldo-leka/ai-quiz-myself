import { ImageResponse } from "next/og";
import { SocialCard } from "@/lib/brand-assets";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export const alt = "QuizPlus Twitter card";

export default function TwitterImage() {
  return new ImageResponse(<SocialCard accentLabel="Create, play, repeat" />, size);
}
