"use client";

import { useCallback, useLayoutEffect, useState } from "react";
import {
  readStoredReadAloudPreference,
  writeStoredReadAloudPreference,
} from "@/lib/read-aloud-preference";

type UseReadAloudPreferenceParams = {
  userId?: string;
  serverEnabled?: boolean;
  serverPending?: boolean;
};

export function useReadAloudPreference(params: UseReadAloudPreferenceParams) {
  const { userId, serverEnabled, serverPending = false } = params;
  const [readAloudEnabled, setReadAloudEnabled] = useState(false);
  const [readAloudPreferenceReady, setReadAloudPreferenceReady] = useState(false);
  const [readAloudSaving, setReadAloudSaving] = useState(false);
  const [readAloudPreferenceError, setReadAloudPreferenceError] = useState<string | null>(null);

  useLayoutEffect(() => {
    const storedPreference = readStoredReadAloudPreference();
    if (storedPreference !== null) {
      setReadAloudEnabled(storedPreference);
      setReadAloudPreferenceReady(true);
      return;
    }

    if (typeof serverEnabled === "boolean") {
      setReadAloudEnabled(serverEnabled);
      writeStoredReadAloudPreference(serverEnabled);
      setReadAloudPreferenceReady(true);
      return;
    }

    if (!serverPending) {
      setReadAloudPreferenceReady(true);
    }
  }, [serverEnabled, serverPending, userId]);

  const toggleReadAloud = useCallback(
    async (nextEnabled: boolean) => {
      const previousEnabled = readAloudEnabled;

      setReadAloudPreferenceError(null);
      setReadAloudEnabled(nextEnabled);
      writeStoredReadAloudPreference(nextEnabled);

      if (!userId) {
        return;
      }

      setReadAloudSaving(true);

      try {
        const response = await fetch("/api/dashboard/settings", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            readAloudEnabled: nextEnabled,
          }),
        });

        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "Could not save read aloud preference.");
        }
      } catch (error) {
        setReadAloudEnabled(previousEnabled);
        writeStoredReadAloudPreference(previousEnabled);
        setReadAloudPreferenceError(
          error instanceof Error ? error.message : "Could not save read aloud preference.",
        );
      } finally {
        setReadAloudSaving(false);
      }
    },
    [readAloudEnabled, userId],
  );

  return {
    readAloudEnabled,
    readAloudPreferenceReady,
    readAloudSaving,
    readAloudPreferenceError,
    setReadAloudPreferenceError,
    toggleReadAloud,
  };
}
