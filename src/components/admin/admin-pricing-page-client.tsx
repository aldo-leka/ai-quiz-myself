"use client";

import { useState } from "react";
import {
  BASE_GENERATION_COST_CENTS,
  STARTER_CREDITS_CENTS,
  STARTER_CREDITS_SETTING_KEY,
  QUIZ_GENERATION_COST_SETTING_KEY,
  centsFromDollars,
  dollarsFromCents,
  formatUsdCents,
} from "@/lib/billing";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type AdminPricingPageClientProps = {
  initialGenerationCostCents: number;
  initialStarterCreditsCents: number;
  initialGenerationCostUpdatedAt: string | null;
  initialStarterCreditsUpdatedAt: string | null;
};

type SettingsPatchResponse = {
  settings: Array<{
    key: string;
    value: string;
    description: string | null;
    updatedAt: string;
  }>;
  error?: string;
};

function formatTimestamp(value: string | null): string {
  if (!value) return "Not saved yet";
  return new Date(value).toLocaleString();
}

export function AdminPricingPageClient({
  initialGenerationCostCents,
  initialStarterCreditsCents,
  initialGenerationCostUpdatedAt,
  initialStarterCreditsUpdatedAt,
}: AdminPricingPageClientProps) {
  const [generationCostInput, setGenerationCostInput] = useState(
    dollarsFromCents(initialGenerationCostCents).toFixed(2),
  );
  const [generationCostCents, setGenerationCostCents] = useState(initialGenerationCostCents);
  const [starterCreditsInput, setStarterCreditsInput] = useState(
    dollarsFromCents(initialStarterCreditsCents).toFixed(2),
  );
  const [starterCreditsCents, setStarterCreditsCents] = useState(initialStarterCreditsCents);
  const [generationCostUpdatedAt, setGenerationCostUpdatedAt] = useState<string | null>(
    initialGenerationCostUpdatedAt,
  );
  const [starterCreditsUpdatedAt, setStarterCreditsUpdatedAt] = useState<string | null>(
    initialStarterCreditsUpdatedAt,
  );
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function savePricing() {
    const normalizedGenerationCost = generationCostInput.trim().replace(",", ".");
    const parsedGenerationCost = Number(normalizedGenerationCost);
    if (!Number.isFinite(parsedGenerationCost) || parsedGenerationCost <= 0) {
      setStatus("Enter a valid dollar amount greater than 0.");
      return;
    }

    const normalizedStarterCredits = starterCreditsInput.trim().replace(",", ".");
    const parsedStarterCredits = Number(normalizedStarterCredits);
    if (!Number.isFinite(parsedStarterCredits) || parsedStarterCredits < 0) {
      setStatus("Enter a valid starter bonus amount of 0 or more.");
      return;
    }

    const nextCostCents = centsFromDollars(parsedGenerationCost);
    if (nextCostCents <= 0) {
      setStatus("Enter a valid dollar amount greater than 0.");
      return;
    }

    const nextStarterCreditsCents = centsFromDollars(parsedStarterCredits);
    if (nextStarterCreditsCents < 0) {
      setStatus("Enter a valid starter bonus amount of 0 or more.");
      return;
    }

    setSaving(true);
    setStatus(null);

    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          updates: [
            {
              key: QUIZ_GENERATION_COST_SETTING_KEY,
              value: String(nextCostCents),
              description: "Universal platform credit cost in cents for one quiz generation.",
            },
            {
              key: STARTER_CREDITS_SETTING_KEY,
              value: String(nextStarterCreditsCents),
              description: "Starter signup bonus in cents. Set to 0 to disable the bonus.",
            },
          ],
        }),
      });

      const payload = (await response.json()) as SettingsPatchResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to save setting");
      }

      const updated = payload.settings.find(
        (setting) => setting.key === QUIZ_GENERATION_COST_SETTING_KEY,
      );
      const updatedStarterCredits = payload.settings.find(
        (setting) => setting.key === STARTER_CREDITS_SETTING_KEY,
      );
      if (updated) {
        const parsedUpdatedCost = Number.parseInt(updated.value, 10);
        const resolvedUpdatedCost = Number.isFinite(parsedUpdatedCost)
          ? parsedUpdatedCost
          : nextCostCents;
        setGenerationCostCents(resolvedUpdatedCost);
        setGenerationCostInput((resolvedUpdatedCost / 100).toFixed(2));
        setGenerationCostUpdatedAt(updated.updatedAt);
      }
      if (updatedStarterCredits) {
        const parsedUpdatedStarterCredits = Number.parseInt(updatedStarterCredits.value, 10);
        const resolvedUpdatedStarterCredits = Number.isFinite(parsedUpdatedStarterCredits)
          ? parsedUpdatedStarterCredits
          : nextStarterCreditsCents;
        setStarterCreditsCents(resolvedUpdatedStarterCredits);
        setStarterCreditsInput((resolvedUpdatedStarterCredits / 100).toFixed(2));
        setStarterCreditsUpdatedAt(updatedStarterCredits.updatedAt);
      }
      setStatus("Pricing updated.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to save setting");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Quiz Generation Pricing</CardTitle>
          <CardDescription>
            Set one universal platform credit price for quiz generation and an optional signup
            starter bonus.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600">
            Generation pricing applies across theme, URL, and PDF quiz generation immediately.
            Starter bonus applies to new signups only.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Live Pricing</CardTitle>
          <CardDescription>
            Default fallback is {formatUsdCents(BASE_GENERATION_COST_CENTS)} if no admin price has
            been saved yet. The default starter bonus fallback is{" "}
            {formatUsdCents(STARTER_CREDITS_CENTS)}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">Quiz generation price in USD</p>
                <Input
                  value={generationCostInput}
                  onChange={(event) => setGenerationCostInput(event.target.value)}
                  inputMode="decimal"
                  placeholder="0.30"
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">Starter signup bonus in USD</p>
                <Input
                  value={starterCreditsInput}
                  onChange={(event) => setStarterCreditsInput(event.target.value)}
                  inputMode="decimal"
                  placeholder="3.00"
                />
                <p className="text-xs text-slate-500">
                  Set this to 0.00 to disable signup bonus credits entirely.
                </p>
              </div>
              <Button disabled={saving} onClick={() => void savePricing()}>
                {saving ? "Saving..." : "Save pricing"}
              </Button>
            </div>

            <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div>
                <p className="text-sm font-medium text-slate-700">Current live quiz price</p>
                <p className="mt-2 text-3xl font-semibold text-slate-950">
                  {formatUsdCents(generationCostCents)}
                </p>
                <p className="mt-3 text-sm text-slate-600">
                  Stored as {generationCostCents} cents in `{QUIZ_GENERATION_COST_SETTING_KEY}`.
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Last updated: {formatTimestamp(generationCostUpdatedAt)}
                </p>
              </div>

              <div className="border-t border-slate-200 pt-4">
                <p className="text-sm font-medium text-slate-700">Current starter signup bonus</p>
                <p className="mt-2 text-3xl font-semibold text-slate-950">
                  {formatUsdCents(starterCreditsCents)}
                </p>
                <p className="mt-3 text-sm text-slate-600">
                  Stored as {starterCreditsCents} cents in `{STARTER_CREDITS_SETTING_KEY}`.
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Last updated: {formatTimestamp(starterCreditsUpdatedAt)}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {status ? <p className="text-sm text-slate-600">{status}</p> : null}
    </main>
  );
}
