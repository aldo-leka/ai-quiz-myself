"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, PencilLine, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PlayerSelect } from "@/components/dashboard/player-select";
import { cn } from "@/lib/utils";

type EditableQuestion = {
  id: string;
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

type DashboardQuizDetailClientProps = {
  quizId: string;
  title: string;
  theme: string;
  language: string;
  gameMode: "single" | "wwtbam" | "couch_coop";
  difficulty: "easy" | "medium" | "hard" | "mixed" | "escalating";
  isPublishedToHub: boolean;
  hubReviewStatus: "pending" | "processing" | "approved" | "rejected" | "failed" | null;
  hubReviewReason: string | null;
  questions: EditableQuestion[];
};

const pillClassName =
  "inline-flex min-h-14 items-center gap-2 rounded-full border px-5 py-2.5 text-base font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#818cf8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f1117] md:px-6 md:text-lg";

const fieldClassName =
  "rounded-2xl border-[#252940] bg-[#0f1117]/88 px-5 py-4 text-lg text-[#e4e4e9] caret-[#818cf8] shadow-[0_0_0_1px_rgba(108,138,255,0.14)] placeholder:text-[#6b6d7e] selection:bg-[#818cf8] selection:text-[#0f1117] focus-visible:border-[#818cf8]/55 focus-visible:ring-[#818cf8]/55 md:text-xl";

const selectOptions = [
  { value: "0", label: "Option A" },
  { value: "1", label: "Option B" },
  { value: "2", label: "Option C" },
  { value: "3", label: "Option D" },
] as const;

export function DashboardQuizDetailClient({
  quizId,
  title,
  theme,
  language,
  gameMode,
  difficulty,
  isPublishedToHub,
  hubReviewStatus,
  hubReviewReason,
  questions: initialQuestions,
}: DashboardQuizDetailClientProps) {
  const [editMode, setEditMode] = useState(false);
  const [quizTitle, setQuizTitle] = useState(title);
  const [savedTitle, setSavedTitle] = useState(title);
  const [titleStatus, setTitleStatus] = useState("");
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const [questions, setQuestions] = useState<EditableQuestion[]>(initialQuestions);
  const [savedQuestions, setSavedQuestions] = useState<Record<string, EditableQuestion>>(
    Object.fromEntries(initialQuestions.map((question) => [question.id, question])),
  );
  const [savingQuestionId, setSavingQuestionId] = useState<string | null>(null);
  const [statusByQuestionId, setStatusByQuestionId] = useState<Record<string, string>>({});

  const metaText = useMemo(
    () => `Theme: ${theme} · Mode: ${gameMode} · Difficulty: ${difficulty} · Language: ${language}`,
    [difficulty, gameMode, language, theme],
  );

  function resetDrafts() {
    setQuizTitle(savedTitle);
    setQuestions((previousQuestions) =>
      previousQuestions.map((question) => savedQuestions[question.id] ?? question),
    );
    setTitleStatus("");
    setStatusByQuestionId({});
  }

  function handleCancelEditing() {
    resetDrafts();
    setEditMode(false);
  }

  async function saveTitle() {
    const nextTitle = quizTitle.trim();
    if (!nextTitle) {
      setQuizTitle(savedTitle);
      setTitleStatus("Title cannot be empty.");
      return;
    }

    setIsSavingTitle(true);
    setTitleStatus("Saving...");

    try {
      const response = await fetch(`/api/dashboard/quizzes/${quizId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: nextTitle,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        quiz?: { title: string };
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to save title");
      }

      const updatedTitle = payload.quiz?.title ?? nextTitle;
      setQuizTitle(updatedTitle);
      setSavedTitle(updatedTitle);
      setTitleStatus("Saved");
    } catch (error) {
      setQuizTitle(savedTitle);
      setTitleStatus(error instanceof Error ? error.message : "Failed to save title.");
    } finally {
      setIsSavingTitle(false);
    }
  }

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
      const response = await fetch(`/api/dashboard/quizzes/${quizId}/questions/${questionId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          questionText: current.questionText,
          options: current.options,
          correctOptionIndex: current.correctOptionIndex,
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
        setQuestions((previousQuestions) =>
          previousQuestions.map((question) =>
            question.id === questionId ? payload.question! : question,
          ),
        );
        setSavedQuestions((previousSaved) => ({
          ...previousSaved,
          [questionId]: payload.question!,
        }));
      }

      setStatusByQuestionId((previousStatus) => ({
        ...previousStatus,
        [questionId]: "Saved",
      }));
    } catch (error) {
      if (previous) {
        setQuestions((previousQuestions) =>
          previousQuestions.map((question) => (question.id === questionId ? previous : question)),
        );
      }
      setStatusByQuestionId((previousStatus) => ({
        ...previousStatus,
        [questionId]: error instanceof Error ? error.message : "Failed to save question.",
      }));
    } finally {
      setSavingQuestionId(null);
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-[#252940] bg-[#1a1d2e]/78 p-7 md:p-9">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            {editMode ? (
              <div className="space-y-3">
                <label className="block text-base font-semibold uppercase tracking-[0.24em] text-[#818cf8]/75">
                  Quiz Title
                </label>
                <Input
                  value={quizTitle}
                  onChange={(event) => setQuizTitle(event.target.value)}
                  className={cn("h-16 text-3xl font-black md:h-20 md:text-5xl", fieldClassName)}
                  placeholder="Quiz title"
                />
              </div>
            ) : (
              <h2 className="text-[clamp(2.6rem,4vw,4.4rem)] font-black leading-[0.95] text-[#e4e4e9]">
                {quizTitle}
              </h2>
            )}

            <p className="mt-4 text-lg text-[#9394a5] md:text-2xl">{metaText}</p>
            <p className="mt-3 text-base text-[#9394a5] md:text-lg">
              Hub Submission: {isPublishedToHub ? "Approved" : hubReviewStatus ?? "Not submitted"}
            </p>
            {hubReviewReason ? (
              <p className="mt-1 text-base text-[#9394a5] md:text-lg">Reason: {hubReviewReason}</p>
            ) : null}
            {editMode ? (
              <p className="mt-2 text-base text-[#9394a5] md:text-lg">
                {titleStatus || "Change the title or any question, then save the parts you updated."}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/dashboard"
              className={cn(
                pillClassName,
                "border-[#6c8aff]/45 bg-[#6c8aff]/12 text-[#e4e4e9] hover:bg-[#6c8aff]/18",
              )}
            >
              <ArrowLeft className="size-4" />
              Back to Dashboard
            </Link>

            {editMode ? (
              <>
                <button
                  type="button"
                  onClick={() => void saveTitle()}
                  disabled={isSavingTitle || quizTitle.trim() === savedTitle}
                  className={cn(
                    pillClassName,
                    "border-[#6c8aff]/45 bg-[#6c8aff]/14 text-[#e4e4e9] hover:bg-[#6c8aff]/22 disabled:cursor-not-allowed disabled:opacity-60",
                  )}
                >
                  {isSavingTitle ? "Saving..." : "Save Title"}
                </button>
                <button
                  type="button"
                  onClick={handleCancelEditing}
                  className={cn(
                    pillClassName,
                    "border-[#252940] bg-[#1a1d2e] text-[#e4e4e9] hover:bg-[#252940]",
                  )}
                >
                  <X className="size-4" />
                  Cancel Editing
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setEditMode(true)}
                className={cn(
                  pillClassName,
                  "border-[#6c8aff]/45 bg-[#6c8aff]/14 text-[#e4e4e9] hover:bg-[#6c8aff]/22",
                )}
              >
                <PencilLine className="size-4" />
                Edit Quiz
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        {questions.map((question) => (
          <article
            key={question.id}
            className="rounded-3xl border border-[#252940] bg-[#1a1d2e]/78 p-6 md:p-7"
          >
            <p className="text-base text-[#9394a5] md:text-lg">
              Question {question.position} · {question.difficulty}
            </p>

            {editMode ? (
              <div className="mt-3 space-y-4">
                <Textarea
                  value={question.questionText}
                  onChange={(event) =>
                    setQuestions((previousQuestions) =>
                      previousQuestions.map((row) =>
                        row.id === question.id
                          ? { ...row, questionText: event.target.value }
                          : row,
                      ),
                    )
                  }
                  className={cn("min-h-36 text-lg text-[#e4e4e9] md:text-2xl", fieldClassName)}
                  placeholder="Question text"
                />

                <div className="grid gap-3 md:grid-cols-2">
                  {question.options.map((option, optionIndex) => (
                    <div
                      key={`${question.id}-option-${optionIndex}`}
                      className="rounded-2xl border border-[#252940] bg-[#0f1117]/72 p-4"
                    >
                      <p className="mb-3 text-base font-semibold uppercase tracking-[0.2em] text-[#818cf8]/75">
                        Option {String.fromCharCode(65 + optionIndex)}
                      </p>
                      <Input
                        value={option.text}
                        onChange={(event) =>
                          setQuestions((previousQuestions) =>
                            previousQuestions.map((row) => {
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
                        className={cn("h-14 text-base text-[#e4e4e9] md:h-16 md:text-xl", fieldClassName)}
                        placeholder="Option text"
                      />
                      <Textarea
                        value={option.explanation}
                        onChange={(event) =>
                          setQuestions((previousQuestions) =>
                            previousQuestions.map((row) => {
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
                        className={cn("mt-3 min-h-28 text-base text-[#e4e4e9] md:text-lg", fieldClassName)}
                        placeholder="Explanation"
                      />
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <PlayerSelect
                    value={String(question.correctOptionIndex)}
                    onValueChange={(value) =>
                      setQuestions((previousQuestions) =>
                        previousQuestions.map((row) =>
                          row.id === question.id
                            ? { ...row, correctOptionIndex: Number(value) }
                            : row,
                        ),
                      )
                    }
                    options={[...selectOptions]}
                    placeholder="Correct option"
                    widthClassName="w-full sm:w-56"
                  />
                  <div className="flex items-center gap-3">
                    <p className="text-base text-[#9394a5] md:text-lg">
                      {statusByQuestionId[question.id] ?? "Not saved yet"}
                    </p>
                    <button
                      type="button"
                      disabled={savingQuestionId === question.id}
                      onClick={() => void saveQuestion(question.id)}
                      className={cn(
                        pillClassName,
                        "border-[#6c8aff]/45 bg-[#6c8aff]/14 text-[#e4e4e9] hover:bg-[#6c8aff]/22 disabled:cursor-not-allowed disabled:opacity-60",
                      )}
                    >
                      {savingQuestionId === question.id ? "Saving..." : "Save Question"}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <h3 className="mt-3 text-2xl font-semibold text-[#e4e4e9] md:text-4xl">
                  {question.questionText}
                </h3>
                {question.subject ? (
                  <p className="mt-2 text-base text-[#9394a5] md:text-lg">Subject: {question.subject}</p>
                ) : null}
                <ul className="mt-4 space-y-2">
                  {question.options.map((option, index) => (
                    <li
                      key={`${question.id}-${index}`}
                      className={cn(
                        "rounded-2xl border p-4",
                        index === question.correctOptionIndex
                          ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-100"
                          : "border-[#252940] bg-[#0f1117]/72 text-[#e4e4e9]",
                      )}
                    >
                      <p className="text-lg font-medium md:text-xl">{option.text}</p>
                      <p className="mt-2 text-base opacity-90 md:text-lg">{option.explanation}</p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
