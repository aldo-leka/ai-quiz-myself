"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

type QuizGenerationJob = {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  inputData: unknown;
  quizId: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  quizTitle: string | null;
};

type QuizGenerationInput = {
  theme: string;
  gameMode: "single" | "wwtbam" | "couch_coop";
  difficulty: "easy" | "medium" | "hard" | "mixed" | "escalating";
};

type ApiKeyOption = {
  id: string;
  provider: "openai" | "anthropic" | "google";
  label: string | null;
  maskedKey: string;
  createdAt: string;
};

type ListResponse = {
  quizzes: QuizListItem[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};

type JobsResponse = {
  jobs: QuizGenerationJob[];
};

type ApiKeysResponse = {
  keys: ApiKeyOption[];
  error?: string;
};

const defaultGenerationInput: QuizGenerationInput = {
  theme: "",
  gameMode: "single",
  difficulty: "mixed",
};

function parseJobInputData(inputData: unknown): {
  theme: string;
  gameMode: "single" | "wwtbam" | "couch_coop";
  difficulty: "easy" | "medium" | "hard" | "mixed" | "escalating";
} {
  if (!inputData || typeof inputData !== "object") {
    return { theme: "General Knowledge", gameMode: "single", difficulty: "mixed" };
  }

  const payload = inputData as { theme?: unknown; gameMode?: unknown; difficulty?: unknown };
  const gameMode =
    payload.gameMode === "single" || payload.gameMode === "wwtbam" || payload.gameMode === "couch_coop"
      ? payload.gameMode
      : "single";
  const difficulty =
    payload.difficulty === "easy" ||
    payload.difficulty === "medium" ||
    payload.difficulty === "hard" ||
    payload.difficulty === "mixed" ||
    payload.difficulty === "escalating"
      ? payload.difficulty
      : "mixed";
  return {
    theme: typeof payload.theme === "string" ? payload.theme : "Unknown",
    gameMode,
    difficulty,
  };
}

function mapGenerationStatus(status: QuizGenerationJob["status"]) {
  if (status === "completed") return "Generated";
  if (status === "failed") return "Error";
  if (status === "processing") return "Generating";
  return "Queued";
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
  const [reloadNonce, setReloadNonce] = useState(0);

  const [jobs, setJobs] = useState<QuizGenerationJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [generationInput, setGenerationInput] = useState<QuizGenerationInput>(defaultGenerationInput);
  const [apiKeys, setApiKeys] = useState<ApiKeyOption[]>([]);
  const [apiKeysLoading, setApiKeysLoading] = useState(true);
  const [apiKeysError, setApiKeysError] = useState<string | null>(null);
  const [selectedApiKeyId, setSelectedApiKeyId] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);
  const [generationMessage, setGenerationMessage] = useState<string | null>(null);

  const initializedCompletedJobIds = useRef(new Set<string>());
  const jobsInitialized = useRef(false);
  const jobsLoadedOnce = useRef(false);

  const fetchKey = useMemo(
    () => `${search}|${gameMode}|${sourceType}|${isHub}|${language}|${page}|${reloadNonce}`,
    [gameMode, isHub, language, page, reloadNonce, search, sourceType],
  );

  const loadQuizzes = useCallback(async () => {
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
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("Failed to load quizzes");
      }

      const payload = (await response.json()) as ListResponse;
      setRows(payload.quizzes);
      setHasMore(payload.hasMore);
      setTotal(payload.total);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Could not load quizzes");
    } finally {
      setLoading(false);
    }
  }, [gameMode, isHub, language, page, search, sourceType]);

  const loadJobs = useCallback(async () => {
    if (!jobsLoadedOnce.current) {
      setJobsLoading(true);
    }
    setJobsError(null);

    try {
      const response = await fetch("/api/admin/quizzes/generation-jobs", {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("Failed to load generation jobs");
      }

      const payload = (await response.json()) as JobsResponse;
      setJobs(payload.jobs);

      const completed = payload.jobs.filter((job) => job.status === "completed");
      if (!jobsInitialized.current) {
        completed.forEach((job) => initializedCompletedJobIds.current.add(job.id));
        jobsInitialized.current = true;
        return;
      }

      const hasNewlyCompleted = completed.some((job) => !initializedCompletedJobIds.current.has(job.id));
      if (hasNewlyCompleted) {
        completed.forEach((job) => initializedCompletedJobIds.current.add(job.id));
        setReloadNonce((previous) => previous + 1);
      }
    } catch (fetchError) {
      setJobsError(fetchError instanceof Error ? fetchError.message : "Could not load generation jobs");
    } finally {
      if (!jobsLoadedOnce.current) {
        setJobsLoading(false);
        jobsLoadedOnce.current = true;
      }
    }
  }, []);

  const loadApiKeys = useCallback(async () => {
    setApiKeysLoading(true);
    setApiKeysError(null);

    try {
      const response = await fetch("/api/admin/api-keys", {
        cache: "no-store",
      });
      const payload = (await response.json()) as ApiKeysResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load API keys");
      }

      setApiKeys(payload.keys);
      setSelectedApiKeyId((previous) => {
        if (previous && payload.keys.some((key) => key.id === previous)) {
          return previous;
        }
        const firstGoogle = payload.keys.find((key) => key.provider === "google");
        if (firstGoogle) return firstGoogle.id;
        return payload.keys[0]?.id ?? "";
      });
    } catch (fetchError) {
      setApiKeysError(fetchError instanceof Error ? fetchError.message : "Could not load API keys");
    } finally {
      setApiKeysLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQuizzes();
  }, [fetchKey, loadQuizzes]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    void loadApiKeys();
  }, [loadApiKeys]);

  useEffect(() => {
    const interval = setInterval(() => {
      void loadJobs();
    }, 4000);

    return () => clearInterval(interval);
  }, [loadJobs]);

  async function startGeneration() {
    setIsGenerating(true);
    setGenerationMessage(null);

    try {
      const response = await fetch("/api/admin/quizzes/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          theme: generationInput.theme,
          gameMode: generationInput.gameMode,
          difficulty: generationInput.difficulty,
          language: "en",
          apiKeyId: selectedApiKeyId || undefined,
        }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to start generation");
      }

      setGenerationMessage("Generation started.");
      await loadJobs();
    } catch (generationError) {
      setGenerationMessage(
        generationError instanceof Error ? generationError.message : "Failed to start generation",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  async function dismissGenerationJob(jobId: string) {
    const response = await fetch(`/api/admin/quizzes/generation-jobs/${jobId}`, {
      method: "PATCH",
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? "Failed to dismiss generation job");
    }
  }

  async function retryGeneration(job: QuizGenerationJob) {
    const details = parseJobInputData(job.inputData);
    setRetryingJobId(job.id);
    setGenerationMessage(null);

    try {
      const response = await fetch("/api/admin/quizzes/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          theme: details.theme,
          gameMode: details.gameMode,
          difficulty: details.difficulty,
          language: "en",
          apiKeyId: selectedApiKeyId || undefined,
        }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to retry generation");
      }

      await dismissGenerationJob(job.id);
      setJobs((previous) => previous.filter((existingJob) => existingJob.id !== job.id));
      setGenerationMessage("Retry started.");
      await loadJobs();
    } catch (error) {
      setGenerationMessage(error instanceof Error ? error.message : "Failed to retry generation");
    } finally {
      setRetryingJobId(null);
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
          <CardTitle>Generate Quiz</CardTitle>
          <CardDescription>
            Trigger AI generation using the same prompt system as seed scripts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Input
              placeholder="Theme (optional)"
              value={generationInput.theme}
              onChange={(event) =>
                setGenerationInput((previous) => ({
                  ...previous,
                  theme: event.target.value,
                }))
              }
            />
            <Select
              value={generationInput.gameMode}
              onValueChange={(value: QuizGenerationInput["gameMode"]) =>
                setGenerationInput((previous) => ({
                  ...previous,
                  gameMode: value,
                  difficulty:
                    value === "wwtbam"
                      ? "escalating"
                      : previous.difficulty === "escalating"
                        ? "mixed"
                        : previous.difficulty,
                }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Game mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="single">Single Player</SelectItem>
                <SelectItem value="couch_coop">Couch Co-op</SelectItem>
                <SelectItem value="wwtbam">WWTBAM</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={generationInput.difficulty}
              onValueChange={(value: QuizGenerationInput["difficulty"]) =>
                setGenerationInput((previous) => ({
                  ...previous,
                  difficulty: value,
                }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Difficulty" />
              </SelectTrigger>
              <SelectContent>
                {generationInput.gameMode === "wwtbam" ? (
                  <SelectItem value="escalating">Escalating</SelectItem>
                ) : (
                  <>
                    <SelectItem value="easy">Easy</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="hard">Hard</SelectItem>
                    <SelectItem value="mixed">Mixed</SelectItem>
                    <SelectItem value="escalating">Escalating</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>

          <p className="text-sm text-slate-500">
            Admin generation is English-only and intended for hub population.
          </p>
          {generationInput.gameMode === "wwtbam" ? (
            <p className="text-sm text-slate-500">
              WWTBAM generation always uses escalating difficulty.
            </p>
          ) : null}

          <div className="space-y-2">
            <p className="text-sm font-medium">API Key</p>
            <Select value={selectedApiKeyId} onValueChange={setSelectedApiKeyId}>
              <SelectTrigger>
                <SelectValue placeholder={apiKeysLoading ? "Loading keys..." : "Select key"} />
              </SelectTrigger>
              <SelectContent>
                {apiKeys.map((key) => (
                  <SelectItem key={key.id} value={key.id}>
                    {key.provider} {key.label ? `• ${key.label}` : ""} • {key.maskedKey}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {apiKeysError ? <p className="text-sm text-rose-600">{apiKeysError}</p> : null}
            {!apiKeysLoading && apiKeys.length === 0 ? (
              <p className="text-sm text-rose-600">
                No API keys found. Add one in Admin &gt; API Keys.
              </p>
            ) : null}
          </div>

          <Button
            disabled={isGenerating || apiKeysLoading || !selectedApiKeyId}
            onClick={() => void startGeneration()}
          >
            {isGenerating ? "Starting..." : "Generate Quiz"}
          </Button>

          {generationMessage ? <p className="text-sm text-slate-600">{generationMessage}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Generation Status</CardTitle>
          <CardDescription>Recent Trigger runs for quiz generation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {jobsError ? <p className="text-sm text-rose-600">{jobsError}</p> : null}
          {!jobsLoading && jobs.length === 0 ? (
            <p className="text-sm text-slate-500">No generation jobs yet.</p>
          ) : null}

          <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3">
            {jobs.map((job) => {
              const details = parseJobInputData(job.inputData);
              return (
                <div key={job.id} className="aspect-square rounded-lg border p-3">
                  <div className="flex h-full flex-col">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">{details.theme}</p>
                      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        {mapGenerationStatus(job.status)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Mode: {details.gameMode} | Difficulty: {details.difficulty}
                    </p>

                    <div className="mt-auto">
                      {job.status === "completed" && job.quizId ? (
                        <div className="mt-2 flex flex-col gap-2">
                          <p className="text-sm text-emerald-600">
                            {job.quizTitle ? `Generated: ${job.quizTitle}` : "Quiz generated"}
                          </p>
                          <Button size="sm" asChild>
                            <Link href={`/admin/quizzes/${job.quizId}`}>Inspect</Link>
                          </Button>
                        </div>
                      ) : null}
                      {job.status === "failed" ? (
                        <div className="mt-2 flex flex-col gap-2">
                          <p className="text-sm text-rose-600">{job.errorMessage ?? "Generation failed"}</p>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={retryingJobId === job.id}
                              onClick={() => void retryGeneration(job)}
                            >
                              {retryingJobId === job.id ? "Retrying..." : "Retry"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={async () => {
                                try {
                                  await dismissGenerationJob(job.id);
                                  setJobs((previous) =>
                                    previous.filter((existingJob) => existingJob.id !== job.id),
                                  );
                                } catch (dismissError) {
                                  setGenerationMessage(
                                    dismissError instanceof Error
                                      ? dismissError.message
                                      : "Failed to dismiss generation job",
                                  );
                                }
                              }}
                            >
                              Dismiss
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
