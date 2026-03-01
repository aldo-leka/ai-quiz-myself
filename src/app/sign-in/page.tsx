"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";

function normalizeCallbackUrl(url: string | null): string {
  if (!url) return "/dashboard";
  if (!url.startsWith("/")) return "/dashboard";
  return url;
}

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const params = useSearchParams();
  const callbackURL = useMemo(
    () => normalizeCallbackUrl(params.get("callbackURL")),
    [params],
  );

  async function submitMagicLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    try {
      await authClient.signIn.magicLink({
        email,
        callbackURL,
      });
      setMessage("Check your inbox for the sign-in link.");
    } catch {
      setMessage("Unable to send magic link. Check SMTP env values and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

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
        Play hub quizzes without an account. Sign in to manage quizzes, API keys, and history.
      </p>

      <form onSubmit={submitMagicLink} className="mt-8 space-y-3">
        <label htmlFor="email" className="text-sm font-medium text-slate-800">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-900/10 focus:ring-2"
        />
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {isSubmitting ? "Sending..." : "Continue with Magic Link"}
        </button>
      </form>

      <div className="my-6 text-center text-xs uppercase tracking-wide text-slate-500">or</div>

      <button
        type="button"
        disabled={isSubmitting}
        onClick={continueWithGoogle}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 disabled:opacity-60"
      >
        Continue with Google
      </button>

      {message ? <p className="mt-4 text-sm text-slate-700">{message}</p> : null}
    </main>
  );
}

