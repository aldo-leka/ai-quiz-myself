"use client";

import Image from "next/image";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";

function normalizeCallbackUrl(url: string | null): string {
  if (!url) return "/dashboard";
  if (!url.startsWith("/")) return "/dashboard";
  return url;
}

function SignInPageContent() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const params = useSearchParams();
  const callbackURL = useMemo(
    () => normalizeCallbackUrl(params.get("callbackURL")),
    [params],
  );

  async function continueWithGoogle() {
    setIsSubmitting(true);
    setMessage(null);

    try {
      await authClient.signIn.social({
        provider: "google",
        callbackURL,
      });
    } catch {
      setMessage("Google sign-in failed. Verify Google OAuth env vars and callback URL.");
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-2 text-sm text-slate-600">
        Continue with Google to manage quizzes, API keys, and history.
      </p>

      <button
        type="button"
        disabled={isSubmitting}
        onClick={continueWithGoogle}
        className="mt-8 flex w-full items-center justify-center gap-3 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 disabled:opacity-60"
      >
        <Image src="/logos/google.svg" alt="Google" width={18} height={18} />
        Continue with Google
      </button>

      {message ? <p className="mt-4 text-sm text-slate-700">{message}</p> : null}
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-white" />}>
      <SignInPageContent />
    </Suspense>
  );
}
