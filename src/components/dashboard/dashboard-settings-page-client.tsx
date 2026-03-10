"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardApiKeysPageClient } from "@/components/dashboard/dashboard-api-keys-page-client";
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
  const [availableProvidersState, setAvailableProvidersState] = useState<ProviderOption[]>(
    () => Array.from(new Set(availableProviders)),
  );
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const selectableProviders = useMemo(() => {
    return Array.from(new Set(availableProvidersState));
  }, [availableProvidersState]);

  useEffect(() => {
    if (preferredProvider === "none") {
      return;
    }

    if (!selectableProviders.includes(preferredProvider)) {
      setPreferredProvider("none");
      setStatus("Preferred AI provider cleared. Save settings to apply the change.");
    }
  }, [preferredProvider, selectableProviders]);

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
    <div className="space-y-8">
      <section className="rounded-3xl border border-[#252940] bg-[#1a1d2e]/78 p-7 md:p-9">
        <h2 className="text-[clamp(2.6rem,4vw,4.4rem)] font-black leading-[0.95] text-[#e4e4e9]">
          Settings
        </h2>
        <p className="mt-3 max-w-3xl text-xl text-[#9394a5] md:text-2xl">
          Manage your preferences, personal API keys, and generation defaults.
        </p>
      </section>

      <section className="space-y-6 rounded-3xl border border-[#252940] bg-[#1a1d2e]/78 p-7 md:p-9">
        <h3 className="text-3xl font-black text-[#e4e4e9] md:text-4xl">Preferences</h3>
        <div className="space-y-3">
          <p className="text-lg font-semibold text-[#9394a5] md:text-2xl">Preferred Language</p>
          <PlayerSelect
            value={locale}
            onValueChange={setLocale}
            placeholder="Select language"
            options={localeOptions}
          />
        </div>

        <div className="space-y-3">
          <p className="text-lg font-semibold text-[#9394a5] md:text-2xl">
            Preferred AI Provider
          </p>
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
            <p className="text-base text-[#9394a5] md:text-lg">
              Add an API key in the API Keys section below before selecting a preferred provider.
            </p>
          ) : null}
        </div>

        <Button
          onClick={() => void saveSettings()}
          disabled={saving}
          className="min-h-14 rounded-2xl border-[#6c8aff]/45 bg-[#6c8aff]/18 px-6 text-lg text-[#e4e4e9] hover:bg-[#818cf8]/24 md:text-xl"
        >
          {saving ? "Saving..." : "Save Settings"}
        </Button>
        {status ? <p className="text-base text-[#9394a5] md:text-lg">{status}</p> : null}
      </section>

      <section
        id="api-keys"
        className="rounded-3xl border border-[#252940] bg-[#1a1d2e]/78 p-7 md:p-9"
      >
        <h3 className="text-[clamp(2.6rem,4vw,4.4rem)] font-black leading-[0.95] text-[#e4e4e9]">
          API Keys
        </h3>
        <p className="mt-3 max-w-4xl text-xl text-[#9394a5] md:text-2xl">
          Keys are encrypted at rest and used for your generation and gameplay assistants.
        </p>
      </section>

      <DashboardApiKeysPageClient
        showIntro={false}
        onProvidersChange={setAvailableProvidersState}
      />
    </div>
  );
}
