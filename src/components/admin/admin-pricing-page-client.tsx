"use client";

import { useState } from "react";
import {
  BASE_GENERATION_COST_CENTS,
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
  initialUpdatedAt: string | null;
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
  initialUpdatedAt,
}: AdminPricingPageClientProps) {
  const [generationCostInput, setGenerationCostInput] = useState(
    dollarsFromCents(initialGenerationCostCents).toFixed(2),
  );
  const [generationCostCents, setGenerationCostCents] = useState(initialGenerationCostCents);
  const [updatedAt, setUpdatedAt] = useState<string | null>(initialUpdatedAt);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function savePricing() {
    const normalized = generationCostInput.trim().replace(",", ".");
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setStatus("Enter a valid dollar amount greater than 0.");
      return;
    }

    const nextCostCents = centsFromDollars(parsed);
    if (nextCostCents <= 0) {
      setStatus("Enter a valid dollar amount greater than 0.");
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
      if (updated) {
        setGenerationCostCents(Number.parseInt(updated.value, 10) || nextCostCents);
        setGenerationCostInput((Number.parseInt(updated.value, 10) / 100).toFixed(2));
        setUpdatedAt(updated.updatedAt);
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
            Set one universal platform credit price for quiz generation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600">
            This price applies across theme, URL, and PDF quiz generation immediately.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Live Price</CardTitle>
          <CardDescription>
            Default fallback is {formatUsdCents(BASE_GENERATION_COST_CENTS)} if no admin price has
            been saved yet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_1fr]">
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">Price in USD</p>
                <Input
                  value={generationCostInput}
                  onChange={(event) => setGenerationCostInput(event.target.value)}
                  inputMode="decimal"
                  placeholder="0.30"
                />
              </div>
              <Button disabled={saving} onClick={() => void savePricing()}>
                {saving ? "Saving..." : "Save pricing"}
              </Button>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-700">Current live price</p>
              <p className="mt-2 text-3xl font-semibold text-slate-950">
                {formatUsdCents(generationCostCents)}
              </p>
              <p className="mt-3 text-sm text-slate-600">
                Stored as {generationCostCents} cents in `{QUIZ_GENERATION_COST_SETTING_KEY}`.
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Last updated: {formatTimestamp(updatedAt)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {status ? <p className="text-sm text-slate-600">{status}</p> : null}
    </main>
  );
}
