"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { focusRemoteControl } from "@/lib/remote-focus";
import { cn } from "@/lib/utils";

function normalizeCallbackUrl(url: string | null): string {
  if (!url) return "/dashboard";
  if (!url.startsWith("/")) return "/dashboard";
  return url;
}

type SignInFocusTarget = "back" | "google";

function SignInPageContent() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [focusedTarget, setFocusedTarget] = useState<SignInFocusTarget>("google");
  const pageRef = useRef<HTMLElement | null>(null);
  const googleButtonRef = useRef<HTMLButtonElement | null>(null);
  const didAutoFocusRef = useRef(false);

  const params = useSearchParams();
  const callbackURL = useMemo(
    () => normalizeCallbackUrl(params.get("callbackURL")),
    [params],
  );

  const focusPrimaryAction = useCallback(() => {
    const button = googleButtonRef.current;
    if (!button) return false;

    setFocusedTarget("google");
    focusRemoteControl(button, { block: "nearest", inline: "nearest" });
    return document.activeElement === button;
  }, []);

  useEffect(() => {
    if (didAutoFocusRef.current) return;

    didAutoFocusRef.current = true;

    const frame = window.requestAnimationFrame(() => {
      focusPrimaryAction();
    });
    const retry = window.setTimeout(() => {
      focusPrimaryAction();
    }, 180);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(retry);
    };
  }, [focusPrimaryAction]);

  useEffect(() => {
    const handleArrowFocusNavigation = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (
        event.key !== "ArrowLeft" &&
        event.key !== "ArrowRight" &&
        event.key !== "ArrowUp" &&
        event.key !== "ArrowDown"
      ) {
        return;
      }

      const rootNode = pageRef.current;
      if (!rootNode) return;

      const activeElement = document.activeElement as HTMLElement | null;

      const focusableElements = Array.from(
        rootNode.querySelectorAll<HTMLElement>(
          "button,[href],input,select,textarea,[tabindex]:not([tabindex='-1'])",
        ),
      ).filter((element) => {
        if (element.hasAttribute("disabled")) return false;
        if (element.getAttribute("aria-hidden") === "true") return false;
        return true;
      });

      if (!activeElement || !rootNode.contains(activeElement)) {
        event.preventDefault();
        focusPrimaryAction();
        return;
      }

      const currentIndex = focusableElements.indexOf(activeElement);
      if (currentIndex < 0) {
        event.preventDefault();
        focusPrimaryAction();
        return;
      }

      const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
      const nextIndex = Math.max(
        0,
        Math.min(focusableElements.length - 1, currentIndex + direction),
      );

      if (nextIndex !== currentIndex) {
        event.preventDefault();
        focusRemoteControl(focusableElements[nextIndex] ?? null, {
          block: "nearest",
          inline: "nearest",
        });
      }
    };

    window.addEventListener("keydown", handleArrowFocusNavigation);
    return () => {
      window.removeEventListener("keydown", handleArrowFocusNavigation);
    };
  }, [focusPrimaryAction]);

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
    <main
      ref={pageRef}
      className="relative min-h-[100svh] overflow-hidden bg-[#0f1117] text-[#e4e4e9]"
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-[#6c8aff]/18 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-80 w-80 rounded-full bg-blue-600/15 blur-3xl" />
        <div className="absolute right-0 top-1/3 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-[100svh] w-full max-w-6xl items-start px-4 py-4 md:min-h-screen md:items-center md:px-8 md:py-10">
        <div className="grid w-full gap-4 md:gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-3xl border border-[#252940] bg-gradient-to-br from-[#1a1d2e] to-[#0f1117] p-5 shadow-2xl md:min-h-[420px] md:p-8">
            <div className="flex h-full flex-col">
              <div>
                <Link
                  href="/"
                  onFocus={() => setFocusedTarget("back")}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-2 rounded-full border border-[#6c8aff]/45 bg-[#6c8aff]/12 px-4 py-2 text-sm font-semibold text-[#e4e4e9] transition hover:bg-[#6c8aff]/18 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#818cf8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f1117]",
                    focusedTarget === "back" && "ring-4 ring-[#818cf8] ring-offset-2 ring-offset-[#0f1117]",
                  )}
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
                  <p className="max-w-xl text-base text-[#9394a5] sm:text-lg md:text-xl">
                    Save scores, manage API keys, generate quizzes, and track your full play history.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-[#252940] bg-[#1a1d2e]/88 p-5 shadow-2xl md:min-h-[420px] md:p-8">
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="space-y-2">
                <h2 className="text-2xl font-black tracking-tight sm:text-3xl">Continue</h2>
                <p className="text-sm text-[#9394a5] sm:text-base">
                  Use Google to enter your QuizPlus dashboard.
                </p>
              </div>

              <button
                ref={googleButtonRef}
                type="button"
                disabled={isSubmitting}
                onFocus={() => setFocusedTarget("google")}
                onClick={continueWithGoogle}
                className={cn(
                  "mt-6 inline-flex min-h-12 w-full max-w-sm items-center justify-center gap-3 rounded-full border border-[#6c8aff]/45 bg-[#6c8aff]/14 px-5 py-3 text-base font-semibold text-[#e4e4e9] transition hover:bg-[#6c8aff]/22 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#818cf8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f1117] disabled:cursor-not-allowed disabled:opacity-70 md:mt-8",
                  focusedTarget === "google" && "ring-4 ring-[#818cf8] ring-offset-2 ring-offset-[#0f1117]",
                )}
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
    <Suspense fallback={<main className="min-h-screen bg-[#0f1117]" />}>
      <SignInPageContent />
    </Suspense>
  );
}
