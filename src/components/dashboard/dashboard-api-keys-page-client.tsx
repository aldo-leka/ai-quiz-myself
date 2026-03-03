"use client";

import { useEffect, useState } from "react";
import { KeyRound, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
        <h2 className="text-3xl font-black text-slate-100">API Keys</h2>
        <p className="mt-2 text-slate-300">
          Keys are encrypted at rest and used for your generation and gameplay assistants.
        </p>
      </section>

      <section className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
        <h3 className="text-2xl font-bold text-slate-100">Add or Update Key</h3>
        <div className="grid gap-3 md:grid-cols-3">
          <Select
            value={provider}
            onValueChange={(value: "openai" | "anthropic" | "google") => setProvider(value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="google">Google</SelectItem>
              <SelectItem value="openai">OpenAI</SelectItem>
              <SelectItem value="anthropic">Anthropic</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="Label (optional)"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
          <Input
            placeholder="API key"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            type="password"
          />
        </div>
        <Button
          disabled={saving || apiKey.trim().length < 10}
          onClick={() => void saveKey()}
          className="border-cyan-500/50 bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30"
        >
          {saving ? "Saving..." : "Save Key"}
        </Button>
        {status ? <p className="text-sm text-slate-300">{status}</p> : null}
      </section>

      <section className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
        <h3 className="text-2xl font-bold text-slate-100">Saved Keys</h3>
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        {loading ? <p className="text-slate-300">Loading keys...</p> : null}
        {!loading && rows.length === 0 ? (
          <p className="text-slate-300">No API keys saved yet.</p>
        ) : null}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <article
              key={row.id}
              className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="inline-flex items-center gap-2 text-lg font-semibold text-slate-100">
                  <KeyRound className="size-4 text-cyan-300" />
                  {row.provider}
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"
                  onClick={() => void deleteKey(row.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <p className="mt-2 text-sm text-slate-400">{row.label ?? "No label"}</p>
              <p className="mt-1 text-sm text-cyan-100">{row.maskedKey}</p>
              <p className="mt-3 text-xs text-slate-500">
                Updated {new Date(row.createdAt).toLocaleString()}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
