"use client";

import { useEffect, useState } from "react";
import { KeyRound, Trash2 } from "lucide-react";
import { PlayerSelect } from "@/components/dashboard/player-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ApiKeyRow = {
  id: string;
  provider: "openai" | "anthropic" | "google";
  label: string | null;
  maskedKey: string;
  createdAt: string;
};

type ApiKeysResponse = {
  keys: ApiKeyRow[];
  error?: string;
};

export function DashboardApiKeysPageClient() {
  const [rows, setRows] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [provider, setProvider] = useState<"openai" | "anthropic" | "google">("google");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/dashboard/api-keys", {
        cache: "no-store",
      });
      const payload = (await response.json()) as ApiKeysResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load API keys");
      }
      setRows(payload.keys);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Failed to load API keys");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveKey() {
    setSaving(true);
    setStatus("Validating and saving key...");

    try {
      const response = await fetch("/api/dashboard/api-keys", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider,
          label: label.trim() || undefined,
          apiKey,
        }),
      });
      const payload = (await response.json()) as ApiKeysResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to save API key");
      }

      setRows(payload.keys);
      setApiKey("");
      setStatus("API key saved.");
    } catch (saveError) {
      setStatus(saveError instanceof Error ? saveError.message : "Failed to save API key");
    } finally {
      setSaving(false);
    }
  }

  async function deleteKey(keyId: string) {
    setStatus(null);
    try {
      const response = await fetch(`/api/dashboard/api-keys/${keyId}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to delete API key");
      }
      setRows((previous) => previous.filter((row) => row.id !== keyId));
      setStatus("API key deleted.");
    } catch (deleteError) {
      setStatus(deleteError instanceof Error ? deleteError.message : "Failed to delete API key");
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-[#252940] bg-[#1a1d2e]/78 p-7 md:p-9">
        <h2 className="text-[clamp(2.6rem,4vw,4.4rem)] font-black leading-[0.95] text-[#e4e4e9]">
          API Keys
        </h2>
        <p className="mt-3 max-w-4xl text-xl text-[#9394a5] md:text-2xl">
          Keys are encrypted at rest and used for your generation and gameplay assistants.
        </p>
      </section>

      <section className="space-y-5 rounded-3xl border border-[#252940] bg-[#1a1d2e]/78 p-7 md:p-9">
        <h3 className="text-3xl font-black text-[#e4e4e9] md:text-4xl">Add or Update Key</h3>
        <div className="grid gap-3 md:grid-cols-3">
          <PlayerSelect
            value={provider}
            onValueChange={(value: "openai" | "anthropic" | "google") => setProvider(value)}
            placeholder="Provider"
            widthClassName="w-full"
            options={[
              { value: "google", label: "Google" },
              { value: "openai", label: "OpenAI" },
              { value: "anthropic", label: "Anthropic" },
            ]}
          />
          <Input
            placeholder="Label (optional)"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            className="h-14 rounded-2xl border-[#252940] bg-[#0f1117]/88 px-5 text-lg text-[#e4e4e9] placeholder:text-[#6b6d7e] md:h-16 md:text-xl"
          />
          <Input
            placeholder="API key"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            type="password"
            className="h-14 rounded-2xl border-[#252940] bg-[#0f1117]/88 px-5 text-lg text-[#e4e4e9] placeholder:text-[#6b6d7e] md:h-16 md:text-xl"
          />
        </div>
        <Button
          disabled={saving || apiKey.trim().length < 10}
          onClick={() => void saveKey()}
          className="min-h-14 rounded-2xl border-[#6c8aff]/45 bg-[#6c8aff]/18 px-6 text-lg text-[#e4e4e9] hover:bg-[#818cf8]/24 md:text-xl"
        >
          {saving ? "Saving..." : "Save Key"}
        </Button>
        {status ? <p className="text-base text-[#9394a5] md:text-lg">{status}</p> : null}
      </section>

      <section className="space-y-5 rounded-3xl border border-[#252940] bg-[#1a1d2e]/78 p-7 md:p-9">
        <h3 className="text-3xl font-black text-[#e4e4e9] md:text-4xl">Saved Keys</h3>
        {error ? <p className="text-base text-rose-300 md:text-lg">{error}</p> : null}
        {loading ? <p className="text-lg text-[#9394a5] md:text-2xl">Loading keys...</p> : null}
        {!loading && rows.length === 0 ? (
          <p className="text-lg text-[#9394a5] md:text-2xl">No API keys saved yet.</p>
        ) : null}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <article
              key={row.id}
              className="rounded-3xl border border-[#252940] bg-[#0f1117]/82 p-5 md:p-6"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="inline-flex items-center gap-2 text-2xl font-semibold text-[#e4e4e9]">
                  <KeyRound className="size-5 text-[#818cf8]" />
                  {row.provider}
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"
                  onClick={() => void deleteKey(row.id)}
                >
                  <Trash2 className="size-5" />
                </Button>
              </div>
              <p className="mt-3 text-base text-[#9394a5] md:text-lg">{row.label ?? "No label"}</p>
              <p className="mt-2 text-base text-[#e4e4e9] md:text-lg">{row.maskedKey}</p>
              <p className="mt-4 text-sm text-[#6b6d7e] md:text-base">
                Updated {new Date(row.createdAt).toLocaleString()}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
