"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, FileText, Link2, Sparkles, Target, Wallet } from "lucide-react";
import { FilterPill } from "@/components/quiz/FilterPill";
import { PlayerSelect } from "@/components/dashboard/player-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type SourceType = "theme" | "url" | "pdf";
type GameMode = "single" | "wwtbam" | "couch_coop";
type Difficulty = "easy" | "medium" | "hard" | "mixed" | "escalating";
type BillingMode = "byok" | "platform_credits";

type DashboardCreatePageClientProps = {
  hasApiKey: boolean;
  initialLocale: string;
  walletBalanceCents: number;
  standardGenerationCostCents: number;
  pdfGenerationCostCents: number;
  platformBillingAvailable: boolean;
  r2UploadAvailable: boolean;
  pdfMaxFileSizeBytes: number;
};

const sourceCards: Array<{
  value: SourceType;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    value: "theme",
    title: "From Theme",
    description: "Type a topic and generate a fresh quiz instantly.",
    icon: Target,
  },
  {
    value: "url",
    title: "From URL",
    description: "Paste an article URL and transform it into a quiz.",
    icon: Link2,
  },
  {
    value: "pdf",
    title: "From PDF",
    description: "Upload a PDF document (platform credits mode).",
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

const topUpOptionsCents = [500, 1000, 2000, 5000, 10000];

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
  return fileName.length > 64 ? `${fileName.slice(0, 63)}...` : fileName;
}

function formatUsd(amountCents: number): string {
  return `$${(amountCents / 100).toFixed(2)}`;
}

function computeInitialBillingMode(params: {
  sourceType: SourceType;
  hasApiKey: boolean;
  platformBillingAvailable: boolean;
  walletBalanceCents: number;
  standardGenerationCostCents: number;
}): BillingMode {
  if (params.sourceType === "pdf") {
    return "platform_credits";
  }

  if (!params.platformBillingAvailable) {
    return "byok";
  }

  if (!params.hasApiKey) {
    return "platform_credits";
  }

  if (params.walletBalanceCents >= params.standardGenerationCostCents) {
    return "platform_credits";
  }

  return "byok";
}

function normalizeBillingModeForSource(params: {
  current: BillingMode;
  sourceType: SourceType;
  hasApiKey: boolean;
  platformBillingAvailable: boolean;
}): BillingMode {
  if (params.sourceType === "pdf") {
    return "platform_credits";
  }

  if (!params.platformBillingAvailable) {
    return "byok";
  }

  if (!params.hasApiKey) {
    return "platform_credits";
  }

  return params.current;
}

export function DashboardCreatePageClient({
  hasApiKey,
  initialLocale,
  walletBalanceCents,
  standardGenerationCostCents,
  pdfGenerationCostCents,
  platformBillingAvailable,
  r2UploadAvailable,
  pdfMaxFileSizeBytes,
}: DashboardCreatePageClientProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [sourceType, setSourceType] = useState<SourceType>("theme");
  const [theme, setTheme] = useState("");
  const [url, setUrl] = useState("");
  const [gameMode, setGameMode] = useState<GameMode>("single");
  const [difficulty, setDifficulty] = useState<Difficulty>("mixed");
  const [language, setLanguage] = useState(normalizeLocale(initialLocale));
  const [billingMode, setBillingMode] = useState<BillingMode>(
    computeInitialBillingMode({
      sourceType: "theme",
      hasApiKey,
      platformBillingAvailable,
      walletBalanceCents,
      standardGenerationCostCents,
    }),
  );
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [surpriseLoading, setSurpriseLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [topUpModalOpen, setTopUpModalOpen] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState(String(topUpOptionsCents[1]));
  const [topUpLoading, setTopUpLoading] = useState(false);

  const isWwtbam = gameMode === "wwtbam";
  const effectiveDifficulty: Difficulty = isWwtbam ? "escalating" : difficulty;

  const generationCostCents =
    sourceType === "pdf" ? pdfGenerationCostCents : standardGenerationCostCents;

  const effectiveBillingMode = normalizeBillingModeForSource({
    current: billingMode,
    sourceType,
    hasApiKey,
    platformBillingAvailable,
  });

  const canUseByok = sourceType !== "pdf" && hasApiKey;
  const canUseCredits = platformBillingAvailable;
  const showBillingToggle = sourceType !== "pdf" && canUseByok && canUseCredits;
  const hasEnoughBalance = walletBalanceCents >= generationCostCents;

  const canGenerate = useMemo(() => {
    if (submitting) return false;

    if (sourceType === "theme") {
      if (theme.trim().length < 2) return false;
    } else if (sourceType === "url") {
      if (!isValidHttpUrl(url)) return false;
    } else if (!pdfFile) {
      return false;
    }

    if (effectiveBillingMode === "byok") {
      return canUseByok;
    }

    return canUseCredits && hasEnoughBalance;
  }, [
    canUseByok,
    canUseCredits,
    effectiveBillingMode,
    hasEnoughBalance,
    pdfFile,
    sourceType,
    submitting,
    theme,
    url,
  ]);

  const topUpSelectOptions = useMemo(
    () =>
      topUpOptionsCents.map((amountCents) => ({
        value: String(amountCents),
        label: `${formatUsd(amountCents)} top-up`,
      })),
    [],
  );

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

  function applySourceType(nextSourceType: SourceType) {
    setStatusMessage(null);
    setSourceType(nextSourceType);
    setBillingMode((current) =>
      normalizeBillingModeForSource({
        current,
        sourceType: nextSourceType,
        hasApiKey,
        platformBillingAvailable,
      }),
    );
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

    if (file.size > pdfMaxFileSizeBytes) {
      setStatusMessage(`PDF is too large. Max size is ${formatBytes(pdfMaxFileSizeBytes)}.`);
      return;
    }

    setStatusMessage(null);
    setPdfFile(file);
  }

  async function surpriseMeTheme() {
    if (surpriseLoading || (!hasApiKey && !platformBillingAvailable)) return;

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

  async function openTopUpCheckout() {
    if (topUpLoading) return;

    const amountCents = Number(topUpAmount);
    if (!Number.isInteger(amountCents) || amountCents < 500 || amountCents > 10000) {
      setStatusMessage("Select a top-up amount between $5 and $100.");
      return;
    }

    setTopUpLoading(true);
    setStatusMessage(null);

    try {
      const response = await fetch("/api/dashboard/billing/top-up", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amountCents,
          returnPath: "/dashboard/create",
        }),
      });
      const raw = await response.text();
      let payload: { checkoutUrl?: string; error?: string } = {};
      try {
        payload = raw ? (JSON.parse(raw) as { checkoutUrl?: string; error?: string }) : {};
      } catch {
        payload = {};
      }
      if (!response.ok || !payload.checkoutUrl) {
        const fallback =
          raw && !raw.startsWith("<!DOCTYPE")
            ? raw.slice(0, 180)
            : `Failed to create checkout (HTTP ${response.status})`;
        throw new Error(payload.error ?? fallback);
      }

      window.location.href = payload.checkoutUrl;
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Could not start top-up checkout");
      setTopUpLoading(false);
    }
  }

  async function generateQuiz() {
    if (!canGenerate) return;

    setSubmitting(true);
    setStatusMessage(null);

    try {
      const response =
        sourceType === "pdf" && pdfFile
          ? await (async () => {
            if (r2UploadAvailable) {
              const uploadResponse = await fetch("/api/dashboard/generate/pdf-upload", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  fileName: pdfFile.name,
                  fileSizeBytes: pdfFile.size,
                  contentType: pdfFile.type || "application/pdf",
                }),
              });
              const uploadPayload = (await uploadResponse.json()) as {
                uploadUrl?: string;
                objectKey?: string;
                uploadHeaders?: Record<string, string>;
                error?: string;
              };
              if (!uploadResponse.ok || !uploadPayload.uploadUrl || !uploadPayload.objectKey) {
                throw new Error(uploadPayload.error ?? "Failed to prepare PDF upload");
              }

              const putResponse = await fetch(uploadPayload.uploadUrl, {
                method: "PUT",
                headers: uploadPayload.uploadHeaders,
                body: pdfFile,
              });
              if (!putResponse.ok) {
                throw new Error(`Failed to upload PDF (HTTP ${putResponse.status})`);
              }

              return fetch("/api/dashboard/generate", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  sourceType: "pdf",
                  gameMode,
                  difficulty: effectiveDifficulty,
                  language,
                  billingMode: "platform_credits" as const,
                  fileName: pdfFile.name,
                  fileSizeBytes: pdfFile.size,
                  pdfObjectKey: uploadPayload.objectKey,
                }),
              });
            }

            const formData = new FormData();
            formData.append("sourceType", "pdf");
            formData.append("gameMode", gameMode);
            formData.append("difficulty", effectiveDifficulty);
            formData.append("language", language);
            formData.append("billingMode", "platform_credits");
            formData.append("file", pdfFile);

            return fetch("/api/dashboard/generate", {
              method: "POST",
              body: formData,
            });
          })()
          : await fetch("/api/dashboard/generate", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(
              sourceType === "theme"
                ? {
                    sourceType,
                    theme: theme.trim(),
                    gameMode,
                    difficulty: effectiveDifficulty,
                    language,
                    billingMode: effectiveBillingMode,
                  }
                : {
                    sourceType,
                    url: url.trim(),
                    gameMode,
                    difficulty: effectiveDifficulty,
                    language,
                    billingMode: effectiveBillingMode,
                  },
            ),
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
    <div className="space-y-8">
      <section className="rounded-3xl border border-[#252940] bg-[#1a1d2e]/78 p-7 md:p-10">
        <h2 className="text-[clamp(2.6rem,4vw,4.6rem)] font-black leading-[0.95] tracking-tight text-[#e4e4e9]">
          Create Quiz
        </h2>
        <p className="mt-3 max-w-4xl text-xl text-[#9394a5] md:text-2xl">
          Pick a source, tune the game mode, and launch generation.
        </p>
      </section>

      <section className="rounded-3xl border border-[#252940] bg-[#1a1d2e]/78 p-6 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-base font-semibold uppercase tracking-wide text-[#9394a5] md:text-lg">Wallet</p>
            <p className="text-5xl font-black text-[#e4e4e9] md:text-6xl">{formatUsd(walletBalanceCents)}</p>
            <p className="text-base text-[#9394a5] md:text-lg">
              Cost per generation: {formatUsd(generationCostCents)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#252940] bg-[#0f1117]/82 px-4 py-2.5 text-base text-[#e4e4e9] md:text-lg">
              <Wallet className="size-5 text-[#818cf8]" />
              Mode:{" "}
              {sourceType === "pdf"
                ? "Platform credits"
                : effectiveBillingMode === "platform_credits"
                  ? "Platform credits"
                  : "Use my API key"}
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setTopUpModalOpen(true)}
              className="min-h-14 rounded-2xl border-[#6c8aff]/45 bg-[#6c8aff]/12 px-6 text-lg text-[#e4e4e9] hover:bg-[#6c8aff]/18 md:text-xl"
            >
              <CreditCard className="mr-2 size-5" />
              Add to credit balance
            </Button>
            <Button
              asChild
              type="button"
              variant="outline"
              className="min-h-14 rounded-2xl border-[#252940] bg-[#1a1d2e]/86 px-6 text-lg text-[#e4e4e9] hover:border-[#818cf8]/55 hover:bg-[#6c8aff]/12 hover:text-[#e4e4e9] md:text-xl"
            >
              <Link href="/dashboard/billing">Billing & Auto Recharge</Link>
            </Button>
          </div>
        </div>

        {!platformBillingAvailable ? (
          <p className="mt-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-base text-amber-100 md:text-lg">
            Platform billing is not configured yet (`OPENAI_API_KEY` missing), so only BYOK mode is available.
          </p>
        ) : null}
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {sourceCards.map((card) => {
          const Icon = card.icon;
          const active = sourceType === card.value;
          return (
            <button
              key={card.value}
              type="button"
              onClick={() => applySourceType(card.value)}
              className={cn(
                "rounded-3xl border p-6 text-left transition md:p-7",
                active
                  ? "border-[#818cf8]/55 bg-[#6c8aff]/14 shadow-[0_0_0_1px_rgba(129,140,248,0.28)]"
                  : "border-[#252940] bg-[#1a1d2e]/78 hover:border-[#6c8aff]/35 hover:bg-[#6c8aff]/8",
              )}
            >
              <div className="inline-flex rounded-2xl border border-[#6c8aff]/35 bg-[#6c8aff]/12 p-3">
                <Icon className="size-7 text-[#818cf8]" />
              </div>
              <p className="mt-4 text-3xl font-bold text-[#e4e4e9] md:text-4xl">{card.title}</p>
              <p className="mt-2 text-base text-[#9394a5] md:text-xl">{card.description}</p>
            </button>
          );
        })}
      </section>

      <section className="space-y-6 rounded-3xl border border-[#252940] bg-[#1a1d2e]/78 p-7 md:p-10">
        {showBillingToggle ? (
          <div className="space-y-3">
            <p className="text-lg font-semibold text-[#9394a5] md:text-2xl">Billing Mode</p>
            <div className="flex flex-wrap gap-3">
              <FilterPill
                isActive={effectiveBillingMode === "platform_credits"}
                onClick={() => setBillingMode("platform_credits")}
              >
                Use platform credits ({formatUsd(generationCostCents)}/quiz)
              </FilterPill>
              <FilterPill
                isActive={effectiveBillingMode === "byok"}
                onClick={() => setBillingMode("byok")}
              >
                Use my API key (free)
              </FilterPill>
            </div>
          </div>
        ) : sourceType !== "pdf" && !canUseByok ? (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-base text-amber-100 md:text-lg">
            No API key found, so this will run in platform credits mode.
            {" "}
            <Link href="/dashboard/api-keys" className="font-semibold underline">
              Add API key
            </Link>
          </div>
        ) : null}

        {effectiveBillingMode === "platform_credits" && !hasEnoughBalance ? (
          <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-base text-rose-100 md:text-lg">
            Insufficient balance for this generation.
            {" "}
            Required: {formatUsd(generationCostCents)}. Current: {formatUsd(walletBalanceCents)}.
            {" "}
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => setTopUpModalOpen(true)}
            >
              Top up now
            </button>
          </div>
        ) : null}

        {sourceType === "theme" ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-lg font-semibold text-[#9394a5] md:text-2xl">Theme</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={(!hasApiKey && !platformBillingAvailable) || surpriseLoading}
                className="min-h-14 rounded-2xl border-[#6c8aff]/35 bg-[#6c8aff]/12 px-5 text-lg text-[#e4e4e9] hover:bg-[#6c8aff]/18 md:text-xl"
                onClick={() => void surpriseMeTheme()}
              >
                <Sparkles className="mr-2 size-5" />
                {surpriseLoading ? "Thinking..." : "Surprise Me"}
              </Button>
            </div>
            <Input
              value={theme}
              onChange={(event) => setTheme(event.target.value)}
              placeholder="e.g. Ancient Civilizations, Ocean Creatures, Space Exploration"
              className="h-14 rounded-2xl border-[#252940] bg-[#0f1117]/88 px-5 text-lg text-[#e4e4e9] placeholder:text-[#6b6d7e] md:h-16 md:text-2xl"
            />
          </div>
        ) : null}

        {sourceType === "url" ? (
          <div className="space-y-2">
            <p className="text-lg font-semibold text-[#9394a5] md:text-2xl">Article URL</p>
            <Input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/article"
              className="h-14 rounded-2xl border-[#252940] bg-[#0f1117]/88 px-5 text-lg text-[#e4e4e9] placeholder:text-[#6b6d7e] md:h-16 md:text-2xl"
            />
          </div>
        ) : null}

        {sourceType === "pdf" ? (
          <div className="space-y-3">
            <p className="text-lg font-semibold text-[#9394a5] md:text-2xl">
              PDF file (max {formatBytes(pdfMaxFileSizeBytes)})
            </p>
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
                "rounded-3xl border border-dashed p-7 text-center transition md:p-8",
                isDragActive
                  ? "border-[#818cf8]/55 bg-[#6c8aff]/12"
                  : "border-[#252940] bg-[#0f1117]/82",
              )}
            >
              <p className="text-lg text-[#e4e4e9] md:text-2xl">
                Drag & drop a PDF here, or{" "}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="font-semibold text-[#818cf8] underline"
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
                <p className="mt-3 text-base text-[#e4e4e9] md:text-lg">
                  {formatPdfFileName(pdfFile.name)} ({formatBytes(pdfFile.size)})
                </p>
              ) : null}
            </div>
            {r2UploadAvailable ? (
              <p className="text-sm text-[#9394a5] md:text-base">
                Large PDFs upload to cloud storage first, then the generation task downloads them asynchronously.
              </p>
            ) : (
              <p className="text-sm text-[#9394a5] md:text-base">
                R2 is not configured, so PDF uploads use the smaller direct-upload fallback.
              </p>
            )}
          </div>
        ) : null}

        <div className="space-y-3">
          <p className="text-lg font-semibold text-[#9394a5] md:text-2xl">Game Mode</p>
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
          <p className="text-lg font-semibold text-[#9394a5] md:text-2xl">Difficulty</p>
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
            <p className="text-sm text-[#9394a5] md:text-base">
              WWTBAM always uses escalating difficulty.
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <p className="text-lg font-semibold text-[#9394a5] md:text-2xl">Language</p>
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
            className="min-h-14 rounded-2xl border-[#6c8aff]/45 bg-[#6c8aff]/18 px-7 text-lg text-[#e4e4e9] hover:bg-[#818cf8]/24 md:text-xl"
          >
            {submitting
              ? "Starting..."
              : effectiveBillingMode === "platform_credits"
                ? `Generate (${formatUsd(generationCostCents)})`
                : "Generate"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-14 rounded-2xl border-[#252940] bg-[#1a1d2e]/86 px-7 text-lg text-[#e4e4e9] hover:border-[#818cf8]/55 hover:bg-[#6c8aff]/12 hover:text-[#e4e4e9] md:text-xl"
            onClick={() => router.push("/dashboard/my-quizzes")}
          >
            Back to My Quizzes
          </Button>
        </div>

        {statusMessage ? (
          <p className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-base text-rose-200 md:text-lg">
            {statusMessage}
          </p>
        ) : null}
      </section>

      <Dialog open={topUpModalOpen} onOpenChange={setTopUpModalOpen}>
        <DialogContent className="max-w-md rounded-3xl border border-[#252940] bg-gradient-to-br from-[#1a1d2e] to-[#0f1117] p-6 text-[#e4e4e9]">
          <DialogHeader className="text-left">
            <DialogTitle className="text-3xl font-black text-[#e4e4e9]">Add to credit balance</DialogTitle>
            <DialogDescription className="text-lg text-[#9394a5]">
              Choose a top-up amount. You will complete payment in Stripe checkout.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-lg font-semibold text-[#9394a5]">Amount</p>
            <PlayerSelect
              value={topUpAmount}
              onValueChange={setTopUpAmount}
              placeholder="Select amount"
              options={topUpSelectOptions}
              widthClassName="w-full"
            />
            <p className="text-base text-[#9394a5]">
              Current balance: {formatUsd(walletBalanceCents)}
            </p>
          </div>

          <DialogFooter className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-14 rounded-2xl border-[#252940] bg-[#1a1d2e]/86 px-5 text-lg text-[#e4e4e9] hover:border-[#818cf8]/55 hover:bg-[#6c8aff]/12 hover:text-[#e4e4e9]"
              disabled={topUpLoading}
              onClick={() => setTopUpModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="min-h-14 rounded-2xl border-[#6c8aff]/45 bg-[#6c8aff]/18 px-5 text-lg text-[#e4e4e9] hover:bg-[#818cf8]/24"
              disabled={topUpLoading}
              onClick={() => void openTopUpCheckout()}
            >
              {topUpLoading ? "Opening checkout..." : "Continue to checkout"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
