"use client";

import { useEffect, useRef } from "react";
import posthog from "posthog-js";
import { authClient } from "@/lib/auth-client";

type SessionUser = {
  id?: string;
  email?: string | null;
  name?: string | null;
  locale?: string | null;
  isAdmin?: boolean;
};

export function PostHogAuthSync() {
  const { data: sessionData, isPending } = authClient.useSession();
  const identifiedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (isPending) {
      return;
    }

    const user = (sessionData?.user ?? null) as SessionUser | null;
    const userId = user?.id?.trim() ?? "";

    if (userId) {
      posthog.identify(userId, {
        email: user?.email ?? null,
        name: user?.name ?? null,
        locale: user?.locale ?? null,
        is_admin: Boolean(user?.isAdmin),
      });
      identifiedUserIdRef.current = userId;
      return;
    }

    if (identifiedUserIdRef.current) {
      posthog.reset();
      identifiedUserIdRef.current = null;
    }
  }, [isPending, sessionData?.user]);

  return null;
}

