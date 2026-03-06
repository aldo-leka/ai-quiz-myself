"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
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
    <main className="relative min-h-[100svh] overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-80 w-80 rounded-full bg-blue-600/15 blur-3xl" />
        <div className="absolute right-0 top-1/3 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-[100svh] w-full max-w-6xl items-start px-4 py-4 md:min-h-screen md:items-center md:px-8 md:py-10">
        <div className="grid w-full gap-4 md:gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900/90 to-slate-950/90 p-5 shadow-2xl md:min-h-[420px] md:p-8">
            <div className="flex h-full flex-col">
              <div>
                <Link
                  href="/"
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-cyan-500/50 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                >
                  <ArrowLeft className="size-4" />
                  Back to Hub
                </Link>
              </div>

              <div className="mt-6 md:mt-0 md:flex md:flex-1 md:items-center">
                <div className="space-y-4">
                  <h1 className="text-3xl font-black tracking-tight sm:text-4xl md:text-6xl">
                    Sign in and keep your quiz journey synced.
                  </h1>
                  <p className="max-w-xl text-base text-slate-300 sm:text-lg md:text-xl">
                    Save scores, manage API keys, generate quizzes, and track your full play history.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-900/85 p-5 shadow-2xl md:min-h-[420px] md:p-8">
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="space-y-2">
                <h2 className="text-2xl font-black tracking-tight sm:text-3xl">Continue</h2>
                <p className="text-sm text-slate-300 sm:text-base">
                  Use Google to enter your QuizPlus dashboard.
                </p>
              </div>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={continueWithGoogle}
                className="mt-6 inline-flex min-h-12 w-full max-w-sm items-center justify-center gap-3 rounded-full border border-cyan-500/50 bg-cyan-500/15 px-5 py-3 text-base font-semibold text-cyan-100 transition hover:bg-cyan-500/25 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-70 md:mt-8"
              >
                <Image src="/logos/google.svg" alt="Google" width={20} height={20} />
                {isSubmitting ? "Connecting..." : "Continue with Google"}
              </button>

              {message ? (
                <p className="mt-4 w-full max-w-sm rounded-xl border border-rose-500/50 bg-rose-500/10 p-3 text-sm text-rose-200">
                  {message}
                </p>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-slate-950" />}>
      <SignInPageContent />
    </Suspense>
  );
}
