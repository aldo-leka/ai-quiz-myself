"use client";

import { useEffect, useMemo, useState } from "react";
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

export function AdminApiKeysPageClient() {
  const [rows, setRows] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const [provider, setProvider] = useState<"openai" | "anthropic" | "google">("google");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");

  const googleKeyExists = useMemo(
    () => rows.some((row) => row.provider === "google"),
    [rows],
  );

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/api-keys", {
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
    setStatus(null);

    try {
      const response = await fetch("/api/admin/api-keys", {
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
    const confirmed = window.confirm("Delete this API key?");
    if (!confirmed) return;

    setStatus(null);
    try {
      const response = await fetch(`/api/admin/api-keys/${keyId}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to delete API key");
      }
      await load();
      setStatus("API key deleted.");
    } catch (deleteError) {
      setStatus(deleteError instanceof Error ? deleteError.message : "Failed to delete API key");
    }
  }

  return (
    <main className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>API Keys</CardTitle>
          <CardDescription>
            Keys are encrypted at rest and reused for admin generation and future user flows.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600">
            Google key available for generation: {googleKeyExists ? "Yes" : "No"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add or Update Key</CardTitle>
          <CardDescription>One key per provider for your account.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
          <Button disabled={saving || apiKey.trim().length < 10} onClick={() => void saveKey()}>
            {saving ? "Saving..." : "Save Key"}
          </Button>
          {status ? <p className="text-sm text-slate-600">{status}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Saved Keys</CardTitle>
        </CardHeader>
        <CardContent>
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5}>Loading...</TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5}>No keys saved.</TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.provider}</TableCell>
                    <TableCell>{row.label ?? "—"}</TableCell>
                    <TableCell>{row.maskedKey}</TableCell>
                    <TableCell>{new Date(row.createdAt).toLocaleString()}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => void deleteKey(row.id)}>
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}
