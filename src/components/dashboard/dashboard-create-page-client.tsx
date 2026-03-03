"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Link2, Sparkles, Target } from "lucide-react";
import { FilterPill } from "@/components/quiz/FilterPill";
import { PlayerSelect } from "@/components/dashboard/player-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type SourceType = "theme" | "url" | "pdf";
type GameMode = "single" | "wwtbam" | "couch_coop";
type Difficulty = "easy" | "medium" | "hard" | "mixed" | "escalating";

type DashboardCreatePageClientProps = {
  hasApiKey: boolean;
  initialLocale: string;
  creditBalance: number;
  pdfCreditCost: number;
};

const MAX_PDF_FILE_SIZE = 100 * 1024 * 1024;

const sourceCards: Array<{
  value: SourceType;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    value: "theme",
    title: "From Theme",
    description: "Type a topic and generate with your own API key.",
    icon: Target,
  },
  {
    value: "url",
    title: "From URL",
    description: "Paste an article URL and turn it into a quiz.",
    icon: Link2,
  },
  {
    value: "pdf",
    title: "From PDF",
    description: "Upload a PDF document. Uses platform key + credits.",
    icon: FileText,
  },
];

const modeOptions: Array<{ value: GameMode; label: string }> = [
  { value: "single", label: "Single Player" },
  { value: "couch_coop", label: "Couch Co-op" },
  { value: "wwtbam", label: "WWTBAM" },
];

const difficultyOptions: Array<{ value: Difficulty; label: string }> = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
  { value: "mixed", label: "Mixed" },
];

const languageOptions = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "pt", label: "Portuguese" },
  { value: "nl", label: "Dutch" },
  { value: "sq", label: "Albanian" },
];

function normalizeLocale(value: string): string {
  const raw = value.trim().toLowerCase();
  if (!raw) return "en";
  if (languageOptions.some((option) => option.value === raw)) return raw;

  const primaryTag = raw.split("-")[0] ?? "";
  if (languageOptions.some((option) => option.value === primaryTag)) return primaryTag;

  return "en";
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatPdfFileName(fileName: string): string {
  return fileName.length > 64 ? `${fileName.slice(0, 63)}…` : fileName;
}

export function DashboardCreatePageClient({
  hasApiKey,
  initialLocale,
  creditBalance,
  pdfCreditCost,
}: DashboardCreatePageClientProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [sourceType, setSourceType] = useState<SourceType>("theme");
  const [theme, setTheme] = useState("");
  const [url, setUrl] = useState("");
  const [gameMode, setGameMode] = useState<GameMode>("single");
  const [difficulty, setDifficulty] = useState<Difficulty>("mixed");
  const [language, setLanguage] = useState(normalizeLocale(initialLocale));
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [surpriseLoading, setSurpriseLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const isWwtbam = gameMode === "wwtbam";
  const effectiveDifficulty: Difficulty = isWwtbam ? "escalating" : difficulty;
  const hasEnoughCredits = creditBalance >= pdfCreditCost;

  const canGenerate = useMemo(() => {
    if (submitting) return false;
    if (sourceType === "theme") {
      return hasApiKey && theme.trim().length >= 2;
    }
    if (sourceType === "url") {
      return hasApiKey && isValidHttpUrl(url);
    }
    return Boolean(pdfFile) && hasEnoughCredits;
  }, [hasApiKey, hasEnoughCredits, pdfFile, sourceType, submitting, theme, url]);

  function applyGameMode(nextMode: GameMode) {
    setGameMode(nextMode);
    if (nextMode === "wwtbam") {
      setDifficulty("escalating");
      return;
    }
    if (difficulty === "escalating") {
      setDifficulty("mixed");
    }
  }

  function setPdfFileFromInput(file: File | null) {
    if (!file) {
      setPdfFile(null);
      return;
    }

    const type = file.type.toLowerCase();
    const name = file.name.toLowerCase();
    const isPdf = type === "application/pdf" || name.endsWith(".pdf");
    if (!isPdf) {
      setStatusMessage("Only PDF files are supported.");
      return;
    }

    if (file.size > MAX_PDF_FILE_SIZE) {
      setStatusMessage("PDF is too large. Max size is 100MB.");
      return;
    }

    setStatusMessage(null);
    setPdfFile(file);
  }

  async function surpriseMeTheme() {
    if (!hasApiKey || surpriseLoading) return;

    setSurpriseLoading(true);
    setStatusMessage(null);

    try {
      const response = await fetch("/api/dashboard/generate/surprise-theme", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          gameMode,
          language,
        }),
      });
      const payload = (await response.json()) as { theme?: string; error?: string };
      if (!response.ok || !payload.theme) {
        throw new Error(payload.error ?? "Could not suggest a theme");
      }
      setTheme(payload.theme);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Could not suggest a theme");
    } finally {
      setSurpriseLoading(false);
    }
  }

  async function generateQuiz() {
    if (!canGenerate) return;

    setSubmitting(true);
    setStatusMessage(null);

    try {
      const body =
        sourceType === "theme"
          ? {
              sourceType,
              theme: theme.trim(),
              gameMode,
              difficulty: effectiveDifficulty,
              language,
            }
          : sourceType === "url"
            ? {
                sourceType,
                url: url.trim(),
                gameMode,
                difficulty: effectiveDifficulty,
                language,
              }
            : {
                sourceType,
                gameMode,
                difficulty: effectiveDifficulty,
                language,
                fileName: pdfFile?.name,
                fileSizeBytes: pdfFile?.size,
              };

      const response = await fetch("/api/dashboard/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to start generation");
      }

      router.push("/dashboard/my-quizzes");
      router.refresh();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to start generation");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 md:p-8">
        <h2 className="text-3xl font-black tracking-tight text-slate-100 md:text-4xl">
          Create Quiz
        </h2>
        <p className="mt-2 text-lg text-slate-300">
          Pick a source, tune game mode and difficulty, then generate instantly.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {sourceCards.map((card) => {
          const Icon = card.icon;
          const active = sourceType === card.value;
          return (
            <button
              key={card.value}
              type="button"
              onClick={() => {
                setStatusMessage(null);
                setSourceType(card.value);
              }}
              className={cn(
                "rounded-3xl border p-5 text-left transition",
                active
                  ? "border-cyan-400 bg-cyan-500/15 shadow-[0_0_0_1px_rgba(34,211,238,0.45)]"
                  : "border-slate-800 bg-slate-900/70 hover:border-cyan-500/40 hover:bg-cyan-500/5",
              )}
            >
              <div className="inline-flex rounded-2xl border border-cyan-500/40 bg-cyan-500/10 p-2">
                <Icon className="size-5 text-cyan-200" />
              </div>
              <p className="mt-3 text-xl font-bold text-slate-100">{card.title}</p>
              <p className="mt-1 text-sm text-slate-300">{card.description}</p>
            </button>
          );
        })}
      </section>

      <section className="space-y-5 rounded-3xl border border-slate-800 bg-slate-900/70 p-6 md:p-8">
        {sourceType !== "pdf" && !hasApiKey ? (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-100">
            Add an API key before generating quizzes from theme or URL.
            {" "}
            <Link href="/dashboard/api-keys" className="font-semibold underline">
              Go to API Keys
            </Link>
          </div>
        ) : null}

        {sourceType === "theme" ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-300">Theme</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!hasApiKey || surpriseLoading}
                className="border-cyan-500/40 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20"
                onClick={() => void surpriseMeTheme()}
              >
                <Sparkles className="mr-1 size-4" />
                {surpriseLoading ? "Thinking..." : "Surprise Me"}
              </Button>
            </div>
            <Input
              value={theme}
              onChange={(event) => setTheme(event.target.value)}
              placeholder="e.g. Ancient Civilizations, Ocean Creatures, Space Exploration"
            />
          </div>
        ) : null}

        {sourceType === "url" ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-300">Article URL</p>
            <Input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/article"
            />
          </div>
        ) : null}

        {sourceType === "pdf" ? (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-300">PDF file (max 100MB)</p>
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragActive(true);
              }}
              onDragLeave={() => setIsDragActive(false)}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragActive(false);
                const file = event.dataTransfer.files?.[0] ?? null;
                setPdfFileFromInput(file);
              }}
              className={cn(
                "rounded-2xl border border-dashed p-6 text-center transition",
                isDragActive
                  ? "border-cyan-400 bg-cyan-500/10"
                  : "border-slate-700 bg-slate-950/70",
              )}
            >
              <p className="text-slate-200">
                Drag & drop a PDF here, or{" "}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="font-semibold text-cyan-200 underline"
                >
                  choose file
                </button>
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setPdfFileFromInput(file);
                }}
              />
              {pdfFile ? (
                <p className="mt-2 text-sm text-cyan-100">
                  {formatPdfFileName(pdfFile.name)} ({formatBytes(pdfFile.size)})
                </p>
              ) : null}
            </div>

            <div className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4 text-sm text-slate-300">
              This will use {pdfCreditCost} credit{pdfCreditCost === 1 ? "" : "s"}.
              {" "}
              Balance: {creditBalance}.
              {!hasEnoughCredits ? (
                <>
                  {" "}
                  <a
                    href="https://polar.sh"
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-cyan-200 underline"
                  >
                    Buy Credits
                  </a>
                </>
              ) : null}
              <p className="mt-2 text-xs text-slate-400">
                Credits are checked now; deduction will be enabled when PDF generation goes live.
              </p>
            </div>
          </div>
        ) : null}

        <div className="space-y-3">
          <p className="text-sm font-semibold text-slate-300">Game Mode</p>
          <div className="flex flex-wrap gap-3">
            {modeOptions.map((option) => (
              <FilterPill
                key={option.value}
                isActive={gameMode === option.value}
                onClick={() => applyGameMode(option.value)}
              >
                {option.label}
              </FilterPill>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-semibold text-slate-300">Difficulty</p>
          <div className="flex flex-wrap gap-3">
            {isWwtbam ? (
              <FilterPill isActive onClick={() => undefined}>
                Escalating
              </FilterPill>
            ) : (
              difficultyOptions.map((option) => (
                <FilterPill
                  key={option.value}
                  isActive={difficulty === option.value}
                  onClick={() => setDifficulty(option.value)}
                >
                  {option.label}
                </FilterPill>
              ))
            )}
          </div>
          {isWwtbam ? (
            <p className="text-xs text-slate-400">
              WWTBAM always uses escalating difficulty.
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-300">Language</p>
          <PlayerSelect
            value={language}
            onValueChange={setLanguage}
            placeholder="Select language"
            options={languageOptions}
            widthClassName="w-full sm:w-72"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={!canGenerate}
            onClick={() => void generateQuiz()}
            className="min-h-11 border-cyan-500/50 bg-cyan-500/20 px-6 text-cyan-100 hover:bg-cyan-500/30"
          >
            {submitting ? "Starting..." : "Generate"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 border-slate-600 bg-slate-900/80 text-slate-100 hover:border-cyan-400/50 hover:bg-cyan-500/10 hover:text-cyan-100"
            onClick={() => router.push("/dashboard/my-quizzes")}
          >
            Back to My Quizzes
          </Button>
        </div>

        {statusMessage ? (
          <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
            {statusMessage}
          </p>
        ) : null}
      </section>
    </div>
  );
}

