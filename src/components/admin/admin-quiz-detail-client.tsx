"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type EditableQuestion = {
  id: string;
  quizId: string;
  position: number;
  questionText: string;
  options: Array<{
    text: string;
    explanation: string;
  }>;
  correctOptionIndex: number;
  difficulty: "easy" | "medium" | "hard";
  subject: string | null;
};

type AdminQuizDetailClientProps = {
  quizId: string;
  title: string;
  theme: string;
  gameMode: "single" | "wwtbam" | "couch_coop";
  sourceType: "manual" | "ai_generated" | "pdf" | "url";
  questions: EditableQuestion[];
};

export function AdminQuizDetailClient({
  quizId,
  title,
  theme,
  gameMode,
  sourceType,
  questions: initialQuestions,
}: AdminQuizDetailClientProps) {
  const [questions, setQuestions] = useState<EditableQuestion[]>(initialQuestions);
  const [savedQuestions, setSavedQuestions] = useState<Record<string, EditableQuestion>>(
    Object.fromEntries(initialQuestions.map((question) => [question.id, question])),
  );
  const [savingQuestionId, setSavingQuestionId] = useState<string | null>(null);
  const [statusByQuestionId, setStatusByQuestionId] = useState<Record<string, string>>({});
  const questionCount = questions.length;

  const quizMeta = useMemo(
    () => `Theme: ${theme} | Mode: ${gameMode} | Source: ${sourceType} | Questions: ${questionCount}`,
    [gameMode, questionCount, sourceType, theme],
  );

  async function saveQuestion(questionId: string) {
    const current = questions.find((question) => question.id === questionId);
    if (!current) return;

    const previous = savedQuestions[questionId] ?? null;
    setSavingQuestionId(questionId);
    setStatusByQuestionId((previousStatus) => ({
      ...previousStatus,
      [questionId]: "Saving...",
    }));

    try {
      const response = await fetch(`/api/admin/quizzes/${quizId}/questions/${questionId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          questionText: current.questionText,
          options: current.options,
          correctOptionIndex: current.correctOptionIndex,
          difficulty: current.difficulty,
          subject: current.subject,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        question?: EditableQuestion;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to save question");
      }

      if (payload.question) {
        setQuestions((previousQuestions) => {
          return previousQuestions.map((question) =>
            question.id === questionId ? payload.question! : question,
          );
        });
        setSavedQuestions((previousSaved) => ({
          ...previousSaved,
          [questionId]: payload.question!,
        }));
      }
      setStatusByQuestionId((previousStatus) => ({
        ...previousStatus,
        [questionId]: "Saved",
      }));
    } catch (saveError) {
      if (previous) {
        setQuestions((previousQuestions) =>
          previousQuestions.map((question) => (question.id === questionId ? previous : question)),
        );
      }
      setStatusByQuestionId((previousStatus) => ({
        ...previousStatus,
        [questionId]: saveError instanceof Error ? saveError.message : "Failed to save question.",
      }));
    } finally {
      setSavingQuestionId(null);
    }
  }

  return (
    <main className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{quizMeta}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" asChild>
            <Link href="/admin/quizzes">Back to Quizzes</Link>
          </Button>
        </CardContent>
      </Card>

      {questions.map((question) => (
        <Card key={question.id}>
          <CardHeader>
            <CardTitle>Question {question.position}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={question.questionText}
              onChange={(event) =>
                setQuestions((previous) =>
                  previous.map((row) =>
                    row.id === question.id ? { ...row, questionText: event.target.value } : row,
                  ),
                )
              }
            />
            <div className="grid gap-3 md:grid-cols-3">
              <Input
                placeholder="Subject"
                value={question.subject ?? ""}
                onChange={(event) =>
                  setQuestions((previous) =>
                    previous.map((row) =>
                      row.id === question.id ? { ...row, subject: event.target.value } : row,
                    ),
                  )
                }
              />
              <Select
                value={question.difficulty}
                onValueChange={(value: EditableQuestion["difficulty"]) =>
                  setQuestions((previous) =>
                    previous.map((row) =>
                      row.id === question.id ? { ...row, difficulty: value } : row,
                    ),
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Difficulty" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="easy">Easy</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="hard">Hard</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={String(question.correctOptionIndex)}
                onValueChange={(value) =>
                  setQuestions((previous) =>
                    previous.map((row) =>
                      row.id === question.id ? { ...row, correctOptionIndex: Number(value) } : row,
                    ),
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Correct option" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Option A</SelectItem>
                  <SelectItem value="1">Option B</SelectItem>
                  <SelectItem value="2">Option C</SelectItem>
                  <SelectItem value="3">Option D</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {question.options.map((option, optionIndex) => (
                <div key={`${question.id}-option-${optionIndex}`} className="rounded-lg border p-3">
                  <p className="mb-2 text-sm font-medium">Option {String.fromCharCode(65 + optionIndex)}</p>
                  <Input
                    placeholder="Option text"
                    value={option.text}
                    onChange={(event) =>
                      setQuestions((previous) =>
                        previous.map((row) => {
                          if (row.id !== question.id) return row;
                          const nextOptions = [...row.options];
                          nextOptions[optionIndex] = {
                            ...nextOptions[optionIndex],
                            text: event.target.value,
                          };
                          return { ...row, options: nextOptions };
                        }),
                      )
                    }
                  />
                  <Textarea
                    className="mt-2"
                    placeholder="Explanation"
                    value={option.explanation}
                    onChange={(event) =>
                      setQuestions((previous) =>
                        previous.map((row) => {
                          if (row.id !== question.id) return row;
                          const nextOptions = [...row.options];
                          nextOptions[optionIndex] = {
                            ...nextOptions[optionIndex],
                            explanation: event.target.value,
                          };
                          return { ...row, options: nextOptions };
                        }),
                      )
                    }
                  />
                </div>
              ))}
            </div>

            <Button
              disabled={savingQuestionId === question.id}
              onClick={() => void saveQuestion(question.id)}
            >
              {savingQuestionId === question.id ? "Saving..." : "Save Question"}
            </Button>
            <p className="text-sm text-slate-500">{statusByQuestionId[question.id] ?? "Not saved yet"}</p>
          </CardContent>
        </Card>
      ))}
    </main>
  );
}
