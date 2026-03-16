import type { Metadata } from "next";
import { HubPageClient } from "@/components/quiz/hub-page-client";

export const metadata: Metadata = {
  title: "Quiz Hub",
  description:
    "Browse public QuizPlus games by mode, theme, difficulty, and popularity, then jump straight into play.",
  alternates: {
    canonical: "/hub",
  },
};

export default function HubPage() {
  return <HubPageClient />;
}
