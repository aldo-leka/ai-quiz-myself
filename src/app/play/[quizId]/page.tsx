import type { Metadata } from "next";
import { PlayQuizPageClient } from "@/components/quiz/play-quiz-page-client";
import { buildQuizMetadataDescription, getPublicQuizMetadataSummary } from "@/lib/public-quizzes";
import { SITE_NAME } from "@/lib/site";

type PageProps = {
  params: Promise<{ quizId: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { quizId } = await params;
  const quiz = await getPublicQuizMetadataSummary(quizId);

  if (!quiz) {
    return {
      title: `Quiz | ${SITE_NAME}`,
      description: "Play a public quiz on QuizPlus.",
    };
  }

  const description = buildQuizMetadataDescription(quiz);

  return {
    title: `${quiz.title} | ${SITE_NAME}`,
    description,
    alternates: {
      canonical: `/play/${quiz.id}`,
    },
    openGraph: {
      title: quiz.title,
      description,
      url: `/play/${quiz.id}`,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: quiz.title,
      description,
    },
  };
}

export default async function PlayQuizPage({ params }: PageProps) {
  const { quizId } = await params;

  return <PlayQuizPageClient quizId={quizId} />;
}
