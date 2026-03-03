"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { PlayerSelect } from "@/components/dashboard/player-select";

type ProviderOption = "openai" | "anthropic" | "google";

type DashboardSettingsPageClientProps = {
  initialLocale: string;
  initialPreferredProvider: ProviderOption | null;
  availableProviders: ProviderOption[];
};

const localeOptions = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "pt", label: "Portuguese" },
  { value: "nl", label: "Dutch" },
  { value: "sq", label: "Albanian" },
];
const providerOptions: Array<{ value: ProviderOption | "none"; label: string }> = [
  { value: "none", label: "None" },
  { value: "google", label: "Google" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
];

function normalizeLocale(value: string): string {
  const raw = value.trim().toLowerCase();
  if (!raw) return "en";

  if (localeOptions.some((option) => option.value === raw)) {
    return raw;
  }

  const primaryTag = raw.split("-")[0] ?? "";
  if (localeOptions.some((option) => option.value === primaryTag)) {
    return primaryTag;
  }

  return "en";
}

export function DashboardSettingsPageClient({
  initialLocale,
  initialPreferredProvider,
  availableProviders,
}: DashboardSettingsPageClientProps) {
  const [locale, setLocale] = useState(normalizeLocale(initialLocale));
  const [preferredProvider, setPreferredProvider] = useState<ProviderOption | "none">(
    initialPreferredProvider ?? "none",
  );
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const selectableProviders = useMemo(() => {
    return Array.from(new Set(availableProviders));
  }, [availableProviders]);

  async function saveSettings() {
    setSaving(true);
    setStatus(null);

    try {
      const response = await fetch("/api/dashboard/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          locale,
          preferredProvider,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to save settings");
      }
      setStatus("Settings saved.");
    } catch (saveError) {
      setStatus(saveError instanceof Error ? saveError.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
        <h2 className="text-3xl font-black text-slate-100">Preferences</h2>
        <p className="mt-2 text-slate-300">
          Control your generation defaults and language preferences.
        </p>
      </section>

      <section className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-300">Preferred Language</p>
          <PlayerSelect
            value={locale}
            onValueChange={setLocale}
            placeholder="Select language"
            options={localeOptions}
          />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-300">Preferred AI Provider</p>
          <PlayerSelect
            value={preferredProvider}
            onValueChange={(value: ProviderOption | "none") => setPreferredProvider(value)}
            placeholder="Select provider"
            options={providerOptions.filter(
              (option) =>
                option.value === "none" ||
                selectableProviders.includes(option.value as ProviderOption),
            )}
          />
          {selectableProviders.length === 0 ? (
            <p className="text-sm text-slate-400">
              Add an API key first in API Keys before selecting a preferred provider.
            </p>
          ) : null}
        </div>

        <Button
          onClick={() => void saveSettings()}
          disabled={saving}
          className="border-cyan-500/50 bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30"
        >
          {saving ? "Saving..." : "Save Settings"}
        </Button>
        {status ? <p className="text-sm text-slate-300">{status}</p> : null}
      </section>
    </div>
  );
}
