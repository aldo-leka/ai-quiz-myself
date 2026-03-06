"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type ModerationQuiz = {
  id: string;
  title: string;
  theme: string;
  gameMode: "single" | "wwtbam" | "couch_coop";
  sourceType: "manual" | "ai_generated" | "pdf" | "url";
  language: string;
  decision: "approve" | "reject_niche" | "reject_polarizing" | "reject_unsafe" | null;
  reviewReason: string | null;
  creatorName: string | null;
  creatorEmail: string | null;
  createdAt: string;
  questionPreview: Array<{
    position: number;
    questionText: string;
  }>;
};

type AdminModerationPageClientProps = {
  initialQuizzes: ModerationQuiz[];
};

export function AdminModerationPageClient({ initialQuizzes }: AdminModerationPageClientProps) {
  const [quizzes, setQuizzes] = useState<ModerationQuiz[]>(initialQuizzes);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function approveQuiz(quizId: string) {
    const snapshot = quizzes;
    setProcessingId(quizId);
    setStatus(null);
    setQuizzes((previous) => previous.filter((quiz) => quiz.id !== quizId));

    try {
      const response = await fetch(`/api/admin/moderation/${quizId}`, {
        method: "PATCH",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to approve quiz");
      }
      setStatus("Quiz approved.");
    } catch (error) {
      setQuizzes(snapshot);
      setStatus(error instanceof Error ? error.message : "Failed to approve quiz");
    } finally {
      setProcessingId(null);
    }
  }

  async function deleteQuiz(quizId: string) {
    const confirmed = window.confirm("Delete this quiz permanently?");
    if (!confirmed) return;

    const snapshot = quizzes;
    setProcessingId(quizId);
    setStatus(null);
    setQuizzes((previous) => previous.filter((quiz) => quiz.id !== quizId));

    try {
      const response = await fetch(`/api/admin/moderation/${quizId}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to delete quiz");
      }
      setStatus("Quiz deleted.");
    } catch (error) {
      setQuizzes(snapshot);
      setStatus(error instanceof Error ? error.message : "Failed to delete quiz");
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <main className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Unsafe Hub Candidates</CardTitle>
          <CardDescription>
            Review candidate snapshots rejected as unsafe and decide whether to publish or remove them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600">
            Total flagged: <span className="font-semibold">{quizzes.length}</span>
          </p>
        </CardContent>
      </Card>

      {quizzes.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-sm text-slate-500">No flagged quizzes to review.</CardContent>
        </Card>
      ) : (
        quizzes.map((quiz) => (
          <Card key={quiz.id}>
            <CardHeader>
              <CardTitle>{quiz.title}</CardTitle>
              <CardDescription>
                Theme: {quiz.theme} | Mode: {quiz.gameMode} | Source: {quiz.sourceType} | Creator:{" "}
                {quiz.creatorName ?? quiz.creatorEmail ?? "Unknown"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <p className="font-medium">Flag Reason</p>
                <p className="mt-1">
                  {quiz.reviewReason?.trim() ? quiz.reviewReason : "No reason provided."}
                </p>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">Question Preview</p>
                {quiz.questionPreview.length === 0 ? (
                  <p className="text-sm text-slate-500">No questions found for this quiz.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {quiz.questionPreview.map((question) => (
                      <li key={`${quiz.id}-${question.position}`} className="rounded-md border p-2">
                        <span className="font-medium">Q{question.position}:</span> {question.questionText}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  disabled={processingId === quiz.id}
                  onClick={() => void approveQuiz(quiz.id)}
                >
                  Approve
                </Button>
                <Button
                  variant="destructive"
                  disabled={processingId === quiz.id}
                  onClick={() => void deleteQuiz(quiz.id)}
                >
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))
      )}

      {status ? <p className="text-sm text-slate-600">{status}</p> : null}
    </main>
  );
}
