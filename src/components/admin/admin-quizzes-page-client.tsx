"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type QuizListItem = {
  id: string;
  title: string;
  theme: string;
  language: string;
  difficulty: "easy" | "medium" | "hard" | "mixed" | "escalating";
  gameMode: "single" | "wwtbam" | "couch_coop";
  sourceType: "ai_generated" | "pdf" | "url" | "manual";
  isHub: boolean;
  isPublic: boolean;
  questionCount: number;
  playCount: number;
  creatorName: string | null;
  creatorEmail: string | null;
  createdAt: string;
};

type QuestionDraft = {
  questionText: string;
  difficulty: "easy" | "medium" | "hard";
  subject: string;
  correctOptionIndex: number;
  options: Array<{
    text: string;
    explanation: string;
  }>;
};

type QuizDraft = {
  title: string;
  description: string;
  theme: string;
  language: string;
  difficulty: "easy" | "medium" | "hard" | "mixed" | "escalating";
  gameMode: "single" | "wwtbam" | "couch_coop";
  sourceType: "manual" | "ai_generated" | "pdf" | "url";
  isHub: boolean;
  isPublic: boolean;
  questions: QuestionDraft[];
};

type ListResponse = {
  quizzes: QuizListItem[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};

function createEmptyQuestion(): QuestionDraft {
  return {
    questionText: "",
    difficulty: "medium",
    subject: "",
    correctOptionIndex: 0,
    options: [
      { text: "", explanation: "" },
      { text: "", explanation: "" },
      { text: "", explanation: "" },
      { text: "", explanation: "" },
    ],
  };
}

function createInitialQuizDraft(): QuizDraft {
  return {
    title: "",
    description: "",
    theme: "",
    language: "en",
    difficulty: "mixed",
    gameMode: "single",
    sourceType: "manual",
    isHub: false,
    isPublic: true,
    questions: [createEmptyQuestion()],
  };
}

export function AdminQuizzesPageClient() {
  const [rows, setRows] = useState<QuizListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [gameMode, setGameMode] = useState("all");
  const [sourceType, setSourceType] = useState("all");
  const [isHub, setIsHub] = useState("all");
  const [language, setLanguage] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);

  const [quizDraft, setQuizDraft] = useState<QuizDraft>(createInitialQuizDraft());
  const [isCreating, setIsCreating] = useState(false);
  const [createMessage, setCreateMessage] = useState<string | null>(null);

  const fetchKey = useMemo(
    () => `${search}|${gameMode}|${sourceType}|${isHub}|${language}|${page}`,
    [gameMode, isHub, language, page, search, sourceType],
  );

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", "20");
        if (search.trim()) params.set("search", search.trim());
        if (gameMode !== "all") params.set("gameMode", gameMode);
        if (sourceType !== "all") params.set("sourceType", sourceType);
        if (isHub !== "all") params.set("isHub", isHub);
        if (language.trim()) params.set("language", language.trim());

        const response = await fetch(`/api/admin/quizzes?${params.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error("Failed to load quizzes");
        }
        const payload = (await response.json()) as ListResponse;
        if (cancelled) return;

        setRows(payload.quizzes);
        setHasMore(payload.hasMore);
        setTotal(payload.total);
      } catch (fetchError) {
        if (cancelled) return;
        setError(fetchError instanceof Error ? fetchError.message : "Could not load quizzes");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [fetchKey, gameMode, isHub, language, page, search, sourceType]);

  async function createQuiz() {
    setIsCreating(true);
    setCreateMessage(null);

    try {
      const response = await fetch("/api/admin/quizzes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(quizDraft),
      });

      const payload = (await response.json()) as { quizId?: string; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to create quiz");
      }

      setCreateMessage("Quiz created successfully.");
      setQuizDraft(createInitialQuizDraft());
      setPage(1);
      setSearch("");
    } catch (createError) {
      setCreateMessage(createError instanceof Error ? createError.message : "Failed to create quiz");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <main className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>All Quizzes</CardTitle>
          <CardDescription>Search and filter across every quiz in the platform.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <Input
              value={search}
              onChange={(event) => {
                setPage(1);
                setSearch(event.target.value);
              }}
              placeholder="Search title, theme, description"
            />
            <Select
              value={gameMode}
              onValueChange={(value) => {
                setPage(1);
                setGameMode(value);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Game mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All game modes</SelectItem>
                <SelectItem value="single">Single</SelectItem>
                <SelectItem value="couch_coop">Couch co-op</SelectItem>
                <SelectItem value="wwtbam">WWTBAM</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={sourceType}
              onValueChange={(value) => {
                setPage(1);
                setSourceType(value);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Source type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All source types</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="ai_generated">AI generated</SelectItem>
                <SelectItem value="pdf">PDF</SelectItem>
                <SelectItem value="url">URL</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={isHub}
              onValueChange={(value) => {
                setPage(1);
                setIsHub(value);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Hub status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All hub states</SelectItem>
                <SelectItem value="true">Hub only</SelectItem>
                <SelectItem value="false">Non-hub only</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={language}
              onChange={(event) => {
                setPage(1);
                setLanguage(event.target.value);
              }}
              placeholder="Language (e.g. en)"
            />
          </div>

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Hub</TableHead>
                <TableHead>Lang</TableHead>
                <TableHead>Questions</TableHead>
                <TableHead>Plays</TableHead>
                <TableHead>Creator</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9}>Loading quizzes...</TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9}>No quizzes found.</TableCell>
                </TableRow>
              ) : (
                rows.map((quiz) => (
                  <TableRow key={quiz.id}>
                    <TableCell className="max-w-[300px] truncate">{quiz.title}</TableCell>
                    <TableCell>{quiz.gameMode}</TableCell>
                    <TableCell>{quiz.sourceType}</TableCell>
                    <TableCell>{quiz.isHub ? "Yes" : "No"}</TableCell>
                    <TableCell>{quiz.language}</TableCell>
                    <TableCell>{quiz.questionCount}</TableCell>
                    <TableCell>{quiz.playCount}</TableCell>
                    <TableCell>{quiz.creatorName ?? quiz.creatorEmail ?? "—"}</TableCell>
                    <TableCell>
                      <Button size="sm" asChild>
                        <Link href={`/admin/quizzes/${quiz.id}`}>Inspect</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-slate-500">Total quizzes: {total.toLocaleString()}</p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((previous) => Math.max(1, previous - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                disabled={!hasMore}
                onClick={() => setPage((previous) => previous + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add New Quiz</CardTitle>
          <CardDescription>Create a quiz manually and add all questions in one flow.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-3 md:grid-cols-2">
            <Input
              placeholder="Title"
              value={quizDraft.title}
              onChange={(event) => setQuizDraft((previous) => ({ ...previous, title: event.target.value }))}
            />
            <Input
              placeholder="Theme"
              value={quizDraft.theme}
              onChange={(event) => setQuizDraft((previous) => ({ ...previous, theme: event.target.value }))}
            />
            <Input
              placeholder="Language"
              value={quizDraft.language}
              onChange={(event) => setQuizDraft((previous) => ({ ...previous, language: event.target.value }))}
            />
            <Select
              value={quizDraft.gameMode}
              onValueChange={(value: QuizDraft["gameMode"]) =>
                setQuizDraft((previous) => ({ ...previous, gameMode: value }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Game mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="single">Single</SelectItem>
                <SelectItem value="couch_coop">Couch co-op</SelectItem>
                <SelectItem value="wwtbam">WWTBAM</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={quizDraft.difficulty}
              onValueChange={(value: QuizDraft["difficulty"]) =>
                setQuizDraft((previous) => ({ ...previous, difficulty: value }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Difficulty" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="easy">Easy</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="hard">Hard</SelectItem>
                <SelectItem value="mixed">Mixed</SelectItem>
                <SelectItem value="escalating">Escalating</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={quizDraft.sourceType}
              onValueChange={(value: QuizDraft["sourceType"]) =>
                setQuizDraft((previous) => ({ ...previous, sourceType: value }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Source type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="ai_generated">AI generated</SelectItem>
                <SelectItem value="pdf">PDF</SelectItem>
                <SelectItem value="url">URL</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Textarea
            placeholder="Description"
            value={quizDraft.description}
            onChange={(event) => setQuizDraft((previous) => ({ ...previous, description: event.target.value }))}
          />

          <div className="flex flex-wrap gap-6">
            <label className="inline-flex items-center gap-2 text-sm">
              <Switch
                checked={quizDraft.isHub}
                onCheckedChange={(checked) => setQuizDraft((previous) => ({ ...previous, isHub: checked }))}
              />
              Publish in hub
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <Switch
                checked={quizDraft.isPublic}
                onCheckedChange={(checked) => setQuizDraft((previous) => ({ ...previous, isPublic: checked }))}
              />
              Public
            </label>
          </div>

          <div className="space-y-4">
            {quizDraft.questions.map((question, questionIndex) => (
              <div key={`draft-question-${questionIndex}`} className="rounded-lg border p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h4 className="font-semibold">Question {questionIndex + 1}</h4>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={quizDraft.questions.length <= 1}
                    onClick={() =>
                      setQuizDraft((previous) => ({
                        ...previous,
                        questions: previous.questions.filter((_, index) => index !== questionIndex),
                      }))
                    }
                  >
                    Remove
                  </Button>
                </div>

                <div className="space-y-3">
                  <Textarea
                    placeholder="Question text"
                    value={question.questionText}
                    onChange={(event) =>
                      setQuizDraft((previous) => {
                        const nextQuestions = [...previous.questions];
                        nextQuestions[questionIndex] = {
                          ...nextQuestions[questionIndex],
                          questionText: event.target.value,
                        };
                        return { ...previous, questions: nextQuestions };
                      })
                    }
                  />
                  <div className="grid gap-3 md:grid-cols-3">
                    <Input
                      placeholder="Subject"
                      value={question.subject}
                      onChange={(event) =>
                        setQuizDraft((previous) => {
                          const nextQuestions = [...previous.questions];
                          nextQuestions[questionIndex] = {
                            ...nextQuestions[questionIndex],
                            subject: event.target.value,
                          };
                          return { ...previous, questions: nextQuestions };
                        })
                      }
                    />
                    <Select
                      value={question.difficulty}
                      onValueChange={(value: QuestionDraft["difficulty"]) =>
                        setQuizDraft((previous) => {
                          const nextQuestions = [...previous.questions];
                          nextQuestions[questionIndex] = {
                            ...nextQuestions[questionIndex],
                            difficulty: value,
                          };
                          return { ...previous, questions: nextQuestions };
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Question difficulty" />
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
                        setQuizDraft((previous) => {
                          const nextQuestions = [...previous.questions];
                          nextQuestions[questionIndex] = {
                            ...nextQuestions[questionIndex],
                            correctOptionIndex: Number(value),
                          };
                          return { ...previous, questions: nextQuestions };
                        })
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
                      <div key={`q-${questionIndex}-o-${optionIndex}`} className="rounded border p-3">
                        <p className="mb-2 text-sm font-medium">Option {String.fromCharCode(65 + optionIndex)}</p>
                        <Input
                          placeholder="Option text"
                          value={option.text}
                          onChange={(event) =>
                            setQuizDraft((previous) => {
                              const nextQuestions = [...previous.questions];
                              const nextOptions = [...nextQuestions[questionIndex].options];
                              nextOptions[optionIndex] = {
                                ...nextOptions[optionIndex],
                                text: event.target.value,
                              };
                              nextQuestions[questionIndex] = {
                                ...nextQuestions[questionIndex],
                                options: nextOptions,
                              };
                              return { ...previous, questions: nextQuestions };
                            })
                          }
                        />
                        <Textarea
                          className="mt-2"
                          placeholder="Explanation"
                          value={option.explanation}
                          onChange={(event) =>
                            setQuizDraft((previous) => {
                              const nextQuestions = [...previous.questions];
                              const nextOptions = [...nextQuestions[questionIndex].options];
                              nextOptions[optionIndex] = {
                                ...nextOptions[optionIndex],
                                explanation: event.target.value,
                              };
                              nextQuestions[questionIndex] = {
                                ...nextQuestions[questionIndex],
                                options: nextOptions,
                              };
                              return { ...previous, questions: nextQuestions };
                            })
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={() =>
                setQuizDraft((previous) => ({
                  ...previous,
                  questions: [...previous.questions, createEmptyQuestion()],
                }))
              }
            >
              Add Question
            </Button>
            <Button disabled={isCreating} onClick={() => void createQuiz()}>
              {isCreating ? "Creating..." : "Create Quiz"}
            </Button>
          </div>

          {createMessage ? <p className="text-sm text-slate-600">{createMessage}</p> : null}
        </CardContent>
      </Card>
    </main>
  );
}

