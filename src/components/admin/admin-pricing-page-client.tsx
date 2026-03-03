"use client";

import { useState } from "react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type SettingRow = {
  key: string;
  value: string;
  description: string | null;
  updatedAt: string;
};

type AdminPricingPageClientProps = {
  initialSettings: SettingRow[];
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

export function AdminPricingPageClient({ initialSettings }: AdminPricingPageClientProps) {
  const [settings, setSettings] = useState<SettingRow[]>(initialSettings);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function saveSetting(key: string) {
    const row = settings.find((setting) => setting.key === key);
    if (!row) return;

    const snapshot = settings;
    setSavingKey(key);
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
              key: row.key,
              value: row.value,
              description: row.description,
            },
          ],
        }),
      });

      const payload = (await response.json()) as SettingsPatchResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to save setting");
      }

      const updated = payload.settings.find((setting) => setting.key === key);
      if (updated) {
        setSettings((previous) =>
          previous.map((setting) => (setting.key === key ? updated : setting)),
        );
      }
      setStatus("Setting updated.");
    } catch (error) {
      setSettings(snapshot);
      setStatus(error instanceof Error ? error.message : "Failed to save setting");
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <main className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Credit Economy</CardTitle>
          <CardDescription>
            Manage credit cost settings used by QuizPlus actions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600">
            Purchase prices (real money to credits) are managed in Polar.sh.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Platform Settings</CardTitle>
          <CardDescription>Update credit costs inline per action.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Key</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {settings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5}>No settings found.</TableCell>
                </TableRow>
              ) : (
                settings.map((setting) => (
                  <TableRow key={setting.key}>
                    <TableCell className="font-mono text-xs">{setting.key}</TableCell>
                    <TableCell className="w-[120px]">
                      <Input
                        value={setting.value}
                        onChange={(event) =>
                          setSettings((previous) =>
                            previous.map((row) =>
                              row.key === setting.key
                                ? { ...row, value: event.target.value }
                                : row,
                            ),
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={setting.description ?? ""}
                        onChange={(event) =>
                          setSettings((previous) =>
                            previous.map((row) =>
                              row.key === setting.key
                                ? { ...row, description: event.target.value || null }
                                : row,
                            ),
                          )
                        }
                        placeholder="Optional description"
                      />
                    </TableCell>
                    <TableCell className="text-sm text-slate-500">
                      {new Date(setting.updatedAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        disabled={savingKey === setting.key}
                        onClick={() => void saveSetting(setting.key)}
                      >
                        {savingKey === setting.key ? "Saving..." : "Save"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {status ? <p className="text-sm text-slate-600">{status}</p> : null}
    </main>
  );
}
