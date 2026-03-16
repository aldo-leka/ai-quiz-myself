"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, FileText, Link2, Sparkles, Target } from "lucide-react";
import posthog from "posthog-js";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type SourceType = "theme" | "url" | "pdf";
type GameMode = "single" | "wwtbam" | "couch_coop";
type Difficulty = "easy" | "medium" | "hard" | "mixed" | "escalating";
type BillingMode = "byok" | "platform_credits";

type DashboardCreatePageClientProps = {
  isAdmin: boolean;
  hasApiKey: boolean;
  initialLocale: string;
  walletBalanceCents: number;
  standardGenerationCostCents: number;
  pdfGenerationCostCents: number;
  platformBillingAvailable: boolean;
  pdfMaxFileSizeBytes: number;
  initialSourceType?: string;
  initialTheme?: string;
  initialUrl?: string;
  initialGameMode?: string;
  initialDifficulty?: string;
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
    description: "Start from a topic.",
    icon: Target,
  },
  {
    value: "url",
    title: "From URL",
    description: "Turn an article into a quiz.",
    icon: Link2,
  },
  {
    value: "pdf",
    title: "From PDF",
    description: "Upload a PDF source.",
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

const topUpOptions = [
  { amountCents: 500, label: "Quick Warm-Up" },
  { amountCents: 1000, label: "Party Starter" },
  { amountCents: 2000, label: "Game Night Pack" },
  { amountCents: 5000, label: "Weekend Marathon" },
  { amountCents: 10000, label: "Host Mode" },
] as const;
const batchCountPresets = [1, 5, 10, 15, 25, 50, 100];
const maxBatchCounts: Record<SourceType, number> = {
  theme: 100,
  url: 5,
  pdf: 3,
};

function normalizeLocale(value: string): string {
  const raw = value.trim().toLowerCase();
  if (!raw) return "en";
  if (languageOptions.some((option) => option.value === raw)) return raw;

  const primaryTag = raw.split("-")[0] ?? "";
  if (languageOptions.some((option) => option.value === primaryTag)) return primaryTag;

  return "en";
}

function normalizeSourceType(value: string | null | undefined): SourceType {
  if (value === "url" || value === "pdf") {
    return value;
  }

  return "theme";
}

function normalizeGameMode(value: string | null | undefined): GameMode {
  if (value === "couch_coop" || value === "wwtbam") {
    return value;
  }

  return "single";
}

function normalizeDifficulty(value: string | null | undefined, gameMode: GameMode): Difficulty {
  if (gameMode === "wwtbam") {
    return "escalating";
  }

  if (value === "easy" || value === "medium" || value === "hard") {
    return value;
  }

  return "mixed";
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

function parseThemeBatchLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0);
}

function hasDuplicateValues(values: string[]): boolean {
  const seen = new Set<string>();

  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) {
      return true;
    }

    seen.add(key);
  }

  return false;
}

function getMaxBatchCountForSource(sourceType: SourceType): number {
  return maxBatchCounts[sourceType];
}

function clampBatchCount(sourceType: SourceType, value: number): number {
  const maxCount = getMaxBatchCountForSource(sourceType);
  const normalized = Number.isFinite(value) ? Math.floor(value) : 1;
  return Math.min(Math.max(normalized, 1), maxCount);
}

function computeInitialBillingMode(params: {
  sourceType: SourceType;
  isAdmin: boolean;
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

  if (params.isAdmin) {
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
  isAdmin,
  hasApiKey,
  initialLocale,
  walletBalanceCents,
  standardGenerationCostCents,
  pdfGenerationCostCents,
  platformBillingAvailable,
  pdfMaxFileSizeBytes,
  initialSourceType = "theme",
  initialTheme = "",
  initialUrl = "",
  initialGameMode = "single",
  initialDifficulty = "mixed",
}: DashboardCreatePageClientProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const normalizedInitialSourceType = normalizeSourceType(initialSourceType);
  const normalizedInitialGameMode = normalizeGameMode(initialGameMode);
  const normalizedInitialDifficulty = normalizeDifficulty(
    initialDifficulty,
    normalizedInitialGameMode,
  );

  const [sourceType, setSourceType] = useState<SourceType>(normalizedInitialSourceType);
  const [theme, setTheme] = useState(initialTheme.trim());
  const [themeBatchText, setThemeBatchText] = useState("");
  const [url, setUrl] = useState(initialUrl.trim());
  const [quantity, setQuantity] = useState(1);
  const [gameMode, setGameMode] = useState<GameMode>(normalizedInitialGameMode);
  const [difficulty, setDifficulty] = useState<Difficulty>(normalizedInitialDifficulty);
  const [language, setLanguage] = useState(normalizeLocale(initialLocale));
  const [billingMode, setBillingMode] = useState<BillingMode>(
    computeInitialBillingMode({
      sourceType: normalizedInitialSourceType,
      isAdmin,
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
  const [topUpAmount, setTopUpAmount] = useState(String(topUpOptions[1]?.amountCents ?? 1000));
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
  const maxBatchCount = getMaxBatchCountForSource(sourceType);
  const quantityOptions = useMemo(() => {
    const values = new Set(batchCountPresets.filter((value) => value <= maxBatchCount));
    values.add(maxBatchCount);
    return [...values].sort((left, right) => left - right);
  }, [maxBatchCount]);
  const parsedThemeBatchLines = useMemo(() => parseThemeBatchLines(themeBatchText), [themeBatchText]);
  const affordableGenerationCount =
    effectiveBillingMode === "platform_credits" && !isAdmin
      ? Math.min(quantity, Math.floor(walletBalanceCents / generationCostCents))
      : quantity;
  const needsPartialBalanceConfirmation =
    effectiveBillingMode === "platform_credits" &&
    !isAdmin &&
    affordableGenerationCount > 0 &&
    affordableGenerationCount < quantity;
  const schedulableGenerationCount =
    effectiveBillingMode === "platform_credits" ? affordableGenerationCount : quantity;
  const surpriseSuggestionCount =
    quantity === 1
      ? 1
      : schedulableGenerationCount > 0
        ? schedulableGenerationCount
        : quantity;
  const submissionThemeBatchLines = useMemo(
    () => parsedThemeBatchLines.slice(0, schedulableGenerationCount),
    [parsedThemeBatchLines, schedulableGenerationCount],
  );
  const submissionThemeBatchHasDuplicates = useMemo(
    () => hasDuplicateValues(submissionThemeBatchLines),
    [submissionThemeBatchLines],
  );
  const quantityLabel = quantity === 1 ? "quiz" : "quizzes";

  const canGenerate = useMemo(() => {
    if (submitting) return false;

    if (sourceType === "theme") {
      if (schedulableGenerationCount === 1) {
        const singleThemeValue =
          quantity === 1 ? theme.trim() : (submissionThemeBatchLines[0] ?? "").trim();
        if (singleThemeValue.length < 2) return false;
      } else {
        if (submissionThemeBatchLines.length < schedulableGenerationCount) return false;
        if (hasDuplicateValues(submissionThemeBatchLines)) return false;
      }
    } else if (sourceType === "url") {
      if (!isValidHttpUrl(url)) return false;
    } else if (!pdfFile) {
      return false;
    }

    if (effectiveBillingMode === "byok") {
      return canUseByok;
    }

    return canUseCredits && affordableGenerationCount > 0;
  }, [
    affordableGenerationCount,
    canUseByok,
    canUseCredits,
    effectiveBillingMode,
    pdfFile,
    quantity,
    schedulableGenerationCount,
    sourceType,
    submissionThemeBatchLines,
    submitting,
    theme,
    url,
  ]);

  const topUpSelectOptions = useMemo(
    () =>
      topUpOptions.map(({ amountCents, label }) => ({
        value: String(amountCents),
        label: `${label} · ${formatUsd(amountCents)}`,
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
    setQuantity((current) => clampBatchCount(nextSourceType, current));
    setBillingMode((current) =>
      normalizeBillingModeForSource({
        current,
        sourceType: nextSourceType,
        hasApiKey,
        platformBillingAvailable,
      }),
    );
  }

  function applyQuantity(nextQuantity: number) {
    const clampedQuantity = clampBatchCount(sourceType, nextQuantity);
    setQuantity(clampedQuantity);
    setStatusMessage(null);

    if (clampedQuantity === 1) {
      const firstTheme = parseThemeBatchLines(themeBatchText)[0];
      if (firstTheme) {
        setTheme(firstTheme);
      }
      return;
    }

    if (!themeBatchText.trim() && theme.trim().length >= 2) {
      setThemeBatchText(theme.trim());
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
          count: surpriseSuggestionCount,
          excludeThemes:
            quantity === 1
              ? theme.trim().length >= 2
                ? [theme.trim()]
                : []
              : parsedThemeBatchLines,
        }),
      });
      const raw = await response.text();
      let payload: {
        theme?: string;
        themes?: string[];
        error?: string;
      } = {};
      try {
        payload = raw
          ? (JSON.parse(raw) as {
              theme?: string;
              themes?: string[];
              error?: string;
            })
          : {};
      } catch {
        payload = {};
      }
      const suggestedThemes = payload.themes?.filter((value) => value.trim().length > 0) ?? [];
      if (
        !response.ok ||
        (quantity === 1 ? !payload.theme : suggestedThemes.length < surpriseSuggestionCount)
      ) {
        const fallback =
          raw && !raw.startsWith("<!DOCTYPE")
            ? raw.slice(0, 180)
            : `Could not suggest a theme (HTTP ${response.status})`;
        throw new Error(payload.error ?? fallback);
      }

      if (quantity === 1) {
        setTheme(payload.theme ?? suggestedThemes[0] ?? "");
        return;
      }

      const nextThemes = suggestedThemes.slice(0, surpriseSuggestionCount);
      setTheme(nextThemes[0] ?? "");
      setThemeBatchText(nextThemes.join("\n"));
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
    posthog.capture("billing_top_up_checkout_started", {
      source: "dashboard_create",
      amount_cents: amountCents,
    });

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

  async function startGeneration() {
    if (!canGenerate) return;

    setSubmitting(true);
    setStatusMessage(null);
    posthog.capture("quiz_generation_started", {
      source_type: sourceType,
      game_mode: gameMode,
      difficulty: effectiveDifficulty,
      quantity: schedulableGenerationCount,
      billing_mode: effectiveBillingMode,
    });

    try {
      const requestQuantity = schedulableGenerationCount;
      const response =
        sourceType === "pdf" && pdfFile
          ? await (async () => {
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
                quantity: requestQuantity,
                gameMode,
                difficulty: effectiveDifficulty,
                language,
                billingMode: "platform_credits" as const,
                fileName: pdfFile.name,
                fileSizeBytes: pdfFile.size,
                pdfObjectKey: uploadPayload.objectKey,
              }),
            });
          })()
          : await fetch("/api/dashboard/generate", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(
              sourceType === "theme"
                ? requestQuantity === 1
                  ? {
                      sourceType,
                      theme:
                        quantity === 1
                          ? theme.trim()
                          : (submissionThemeBatchLines[0] ?? "").trim(),
                      quantity: requestQuantity,
                      gameMode,
                      difficulty: effectiveDifficulty,
                      language,
                      billingMode: effectiveBillingMode,
                    }
                  : {
                    sourceType,
                    themes: submissionThemeBatchLines,
                    quantity: requestQuantity,
                    gameMode,
                    difficulty: effectiveDifficulty,
                    language,
                    billingMode: effectiveBillingMode,
                  }
                : {
                    sourceType,
                    url: url.trim(),
                    quantity: requestQuantity,
                    gameMode,
                    difficulty: effectiveDifficulty,
                    language,
                    billingMode: effectiveBillingMode,
                  },
            ),
          });
      const payload = (await response.json()) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to start generation");
      }

      posthog.capture("quiz_generation_enqueued", {
        source_type: sourceType,
        game_mode: gameMode,
        difficulty: effectiveDifficulty,
        quantity: schedulableGenerationCount,
        billing_mode: effectiveBillingMode,
      });
      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      posthog.capture("quiz_generation_failed", {
        source_type: sourceType,
        game_mode: gameMode,
        difficulty: effectiveDifficulty,
        quantity: schedulableGenerationCount,
        billing_mode: effectiveBillingMode,
      });
      setStatusMessage(error instanceof Error ? error.message : "Failed to start generation");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.45fr)]">
        <div className="rounded-3xl border border-[#252940] bg-[#1a1d2e]/78 p-5 md:p-6 xl:min-h-[220px]">
          <div className="flex h-full flex-col justify-between gap-5">
            <div className="space-y-2">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#9394a5] md:text-base">
                Quiz Balance
              </p>
              <p className="text-4xl font-black text-[#e4e4e9] md:text-5xl xl:text-[4.15rem]">
                {formatUsd(walletBalanceCents)}
              </p>
              <div className="flex flex-wrap items-center gap-2 text-sm text-[#9394a5] md:text-base">
                <span>Cost per generation: {formatUsd(generationCostCents)}</span>
                {effectiveBillingMode === "platform_credits" ? (
                  <span>Can start now: {affordableGenerationCount}</span>
                ) : (
                  <span>Using your API key</span>
                )}
              </div>
              {!platformBillingAvailable ? (
                <p className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 md:text-base">
                  Platform billing is not configured yet (`OPENAI_API_KEY` missing), so only BYOK mode is available.
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setTopUpModalOpen(true)}
                className="min-h-12 rounded-2xl border-[#6c8aff]/45 bg-[#6c8aff]/12 px-5 text-base text-[#e4e4e9] hover:bg-[#6c8aff]/18 md:text-lg"
              >
                <CreditCard className="mr-2 size-5" />
                Top up balance
              </Button>
              <Button
                asChild
                type="button"
                variant="outline"
                className="min-h-12 rounded-2xl border-[#252940] bg-[#1a1d2e]/86 px-5 text-base text-[#e4e4e9] hover:border-[#818cf8]/55 hover:bg-[#6c8aff]/12 hover:text-[#e4e4e9] md:text-lg"
              >
                <Link href="/dashboard/billing" data-tv-id="create-billing-link">
                  Billing & Auto Recharge
                </Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {sourceCards.map((card) => {
            const Icon = card.icon;
            const active = sourceType === card.value;
            return (
              <button
                key={card.value}
                type="button"
                onClick={() => applySourceType(card.value)}
                data-tv-id={`create-source-${card.value}`}
                className={cn(
                  "rounded-3xl border p-5 text-left transition md:p-6",
                  active
                    ? "border-[#818cf8]/55 bg-[#6c8aff]/14 shadow-[0_0_0_1px_rgba(129,140,248,0.28)]"
                    : "border-[#252940] bg-[#1a1d2e]/78 hover:border-[#6c8aff]/35 hover:bg-[#6c8aff]/8",
                )}
              >
                <div className="inline-flex rounded-2xl border border-[#6c8aff]/35 bg-[#6c8aff]/12 p-3">
                  <Icon className="size-6 text-[#818cf8]" />
                </div>
                <p className="mt-4 text-2xl font-bold text-[#e4e4e9] md:text-3xl">{card.title}</p>
                <p className="mt-2 text-sm text-[#9394a5] md:text-base">{card.description}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-5 rounded-3xl border border-[#252940] bg-[#1a1d2e]/78 p-5 md:p-7 xl:space-y-4">
        {effectiveBillingMode === "platform_credits" && !isAdmin && affordableGenerationCount <= 0 ? (
          <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-100 md:text-base">
            Insufficient balance for this generation. Required: {formatUsd(generationCostCents)}. Current:{" "}
            {formatUsd(walletBalanceCents)}.{" "}
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => setTopUpModalOpen(true)}
            >
              Top up now
            </button>
          </div>
        ) : null}

        {needsPartialBalanceConfirmation ? (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100 md:text-base">
            Current balance covers {affordableGenerationCount} of {quantity} {quantityLabel}. You can start those now or{" "}
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => setTopUpModalOpen(true)}
            >
              top up first
            </button>
            .
          </div>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-12">
          {showBillingToggle ? (
            <div className="space-y-2 xl:col-span-4">
              <p className="text-sm font-semibold uppercase tracking-wide text-[#9394a5] md:text-base">
                Billing mode
              </p>
              <div className="flex flex-wrap gap-2.5">
                <FilterPill
                  isActive={effectiveBillingMode === "platform_credits"}
                  onClick={() => setBillingMode("platform_credits")}
                >
                  Platform credits
                </FilterPill>
                <FilterPill
                  isActive={effectiveBillingMode === "byok"}
                  onClick={() => setBillingMode("byok")}
                >
                  My API key
                </FilterPill>
              </div>
            </div>
          ) : null}

          <div
            className={cn(
              "space-y-2",
              showBillingToggle ? "xl:col-span-6" : "xl:col-span-10",
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold uppercase tracking-wide text-[#9394a5] md:text-base">
                How many quizzes?
              </p>
              <p className="text-xs text-[#9394a5] md:text-sm">
                Max {maxBatchCount} for {sourceType === "theme" ? "themes" : sourceType.toUpperCase()}
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5">
              {quantityOptions.map((option) => (
                <FilterPill
                  key={option}
                  isActive={quantity === option}
                  onClick={() => applyQuantity(option)}
                >
                  {option}
                </FilterPill>
              ))}
            </div>
          </div>

          <div className="space-y-2 xl:col-span-2">
            <p className="text-sm font-semibold uppercase tracking-wide text-[#9394a5] md:text-base">
              Custom
            </p>
            <Input
              type="number"
              min={1}
              max={maxBatchCount}
              value={quantity}
              onChange={(event) => {
                const parsedValue = Number.parseInt(event.target.value, 10);
                applyQuantity(Number.isFinite(parsedValue) ? parsedValue : 1);
              }}
              className="h-12 rounded-2xl border-[#252940] bg-[#0f1117]/88 px-4 text-lg text-[#e4e4e9] md:h-14 md:text-xl"
            />
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
          <div className="rounded-3xl border border-[#252940] bg-[#0f1117]/76 p-5">
            {sourceType === "theme" ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-lg font-semibold text-[#9394a5] md:text-xl">
                    {quantity === 1 ? "Theme" : "Themes"}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={(!hasApiKey && !platformBillingAvailable) || surpriseLoading}
                    className="min-h-12 rounded-2xl border-[#6c8aff]/35 bg-[#6c8aff]/12 px-4 text-base text-[#e4e4e9] hover:bg-[#6c8aff]/18 md:text-lg"
                    onClick={() => void surpriseMeTheme()}
                  >
                    <Sparkles className="mr-2 size-4" />
                    {surpriseLoading
                      ? "Thinking..."
                      : quantity === 1
                        ? "Surprise Me"
                        : `Surprise Me x${surpriseSuggestionCount}`}
                  </Button>
                </div>
                {quantity === 1 ? (
                  <Input
                    value={theme}
                    onChange={(event) => setTheme(event.target.value)}
                    placeholder="e.g. Ancient Civilizations, Ocean Creatures, Space Exploration"
                    className="h-12 rounded-2xl border-[#252940] bg-[#0f1117]/88 px-5 text-base text-[#e4e4e9] placeholder:text-[#6b6d7e] md:h-14 md:text-lg"
                  />
                ) : (
                  <>
                    <Textarea
                      value={themeBatchText}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        const nextThemes = parseThemeBatchLines(nextValue);
                        setThemeBatchText(nextValue);
                        setTheme(nextThemes[0] ?? "");
                      }}
                      placeholder={"One theme per line.\nAncient Civilizations\nOcean Creatures\nSpace Exploration"}
                      className="min-h-[210px] rounded-2xl border-[#252940] bg-[#0f1117]/88 px-5 py-4 text-base text-[#e4e4e9] placeholder:text-[#6b6d7e] md:min-h-[240px] md:text-lg"
                    />
                    <p className="text-sm text-[#9394a5]">
                      {submissionThemeBatchHasDuplicates
                        ? `Remove duplicate themes in the first ${schedulableGenerationCount} lines.`
                        : submissionThemeBatchLines.length < schedulableGenerationCount
                          ? `${submissionThemeBatchLines.length}/${schedulableGenerationCount} themes ready${needsPartialBalanceConfirmation ? " for current balance" : ""}.`
                          : parsedThemeBatchLines.length > quantity
                            ? `Using the first ${schedulableGenerationCount} themes${needsPartialBalanceConfirmation ? " for current balance" : ""}.`
                            : `${schedulableGenerationCount}/${schedulableGenerationCount} themes ready${needsPartialBalanceConfirmation ? " for current balance" : ""}.`}
                    </p>
                  </>
                )}
              </div>
            ) : null}

            {sourceType === "url" ? (
              <div className="space-y-3">
                <p className="text-lg font-semibold text-[#9394a5] md:text-xl">Article URL</p>
                <Input
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://example.com/article"
                  className="h-12 rounded-2xl border-[#252940] bg-[#0f1117]/88 px-5 text-base text-[#e4e4e9] placeholder:text-[#6b6d7e] md:h-14 md:text-lg"
                />
              </div>
            ) : null}

            {sourceType === "pdf" ? (
              <div className="space-y-3">
                <p className="text-lg font-semibold text-[#9394a5] md:text-xl">
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
                    "rounded-3xl border border-dashed p-6 text-center transition",
                    isDragActive
                      ? "border-[#818cf8]/55 bg-[#6c8aff]/12"
                      : "border-[#252940] bg-[#0f1117]/82",
                  )}
                >
                  <p className="text-base text-[#e4e4e9] md:text-lg">
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
                    <p className="mt-3 text-sm text-[#e4e4e9] md:text-base">
                      {formatPdfFileName(pdfFile.name)} ({formatBytes(pdfFile.size)})
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-3xl border border-[#252940] bg-[#0f1117]/76 p-5">
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-semibold uppercase tracking-wide text-[#9394a5] md:text-base">
                  Game mode
                </p>
                <div className="flex flex-wrap gap-2.5">
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

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.85fr)] xl:grid-cols-1">
                <div className="space-y-2">
                  <p className="text-sm font-semibold uppercase tracking-wide text-[#9394a5] md:text-base">
                    Difficulty
                  </p>
                  <div className="flex flex-wrap gap-2.5">
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
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold uppercase tracking-wide text-[#9394a5] md:text-base">
                    Language
                  </p>
                  <PlayerSelect
                    value={language}
                    onValueChange={setLanguage}
                    placeholder="Select language"
                    options={languageOptions}
                    widthClassName="w-full"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {statusMessage ? (
          <p className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200 md:text-base">
            {statusMessage}
          </p>
        ) : null}

        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-end">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              type="button"
              disabled={!canGenerate}
              onClick={() => void startGeneration()}
              className="min-h-14 rounded-2xl border-[#6c8aff]/45 bg-[#6c8aff]/18 px-8 text-lg text-[#e4e4e9] hover:bg-[#818cf8]/24 md:min-w-[280px] md:text-xl"
            >
              {submitting
                ? schedulableGenerationCount === 1
                  ? "Starting..."
                  : `Starting ${schedulableGenerationCount} quizzes...`
                : schedulableGenerationCount === 1
                  ? "Generate"
                  : `Generate ${schedulableGenerationCount} quizzes`}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-14 rounded-2xl border-[#252940] bg-[#1a1d2e]/86 px-7 text-lg text-[#e4e4e9] hover:border-[#818cf8]/55 hover:bg-[#6c8aff]/12 hover:text-[#e4e4e9] md:text-xl"
              onClick={() => router.push("/dashboard")}
            >
              Back to Dashboard
            </Button>
          </div>
        </div>
      </section>

      <Dialog open={topUpModalOpen} onOpenChange={setTopUpModalOpen}>
        <DialogContent className="max-w-md rounded-3xl border border-[#252940] bg-gradient-to-br from-[#1a1d2e] to-[#0f1117] p-6 text-[#e4e4e9]">
          <DialogHeader className="text-left">
            <DialogTitle className="text-3xl font-black text-[#e4e4e9]">Choose a top-up pack</DialogTitle>
            <DialogDescription className="text-lg text-[#9394a5]">
              Pick a pack, then finish the purchase in Stripe checkout.
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
