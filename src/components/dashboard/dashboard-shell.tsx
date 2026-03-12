"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CreditCard,
  History,
  LibraryBig,
  LogOut,
  PlusCircle,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type DashboardShellProps = {
  children: React.ReactNode;
  canAccessAdmin?: boolean;
  impersonation?: {
    adminLabel: string;
    targetEmail: string;
    targetName: string;
    targetUserId: string;
  } | null;
  user: {
    name: string;
    image?: string | null;
    avatarUrl?: string | null;
  };
};

const navItems: Array<{
  href: string;
  label: string;
  icon: LucideIcon;
  accent?: boolean;
}> = [
  { href: "/dashboard/create", label: "Create Quiz", icon: PlusCircle, accent: true },
  { href: "/dashboard", label: "My Quizzes", icon: LibraryBig },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
  { href: "/dashboard/history", label: "History", icon: History },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
] as const;

const dashboardSubpages = new Set(["billing", "create", "history", "settings"]);

function userInitials(name: string): string {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .slice(0, 2);

  if (parts.length === 0) return "U";
  return parts.map((part) => part[0]!.toUpperCase()).join("");
}

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/dashboard") {
    if (pathname === href) {
      return true;
    }

    if (!pathname.startsWith("/dashboard/")) {
      return false;
    }

    const subpath = pathname.slice("/dashboard/".length);
    const firstSegment = subpath.split("/")[0] ?? "";
    return !dashboardSubpages.has(firstSegment);
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardShell({
  children,
  canAccessAdmin = false,
  impersonation = null,
  user,
}: DashboardShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const userImage = user.avatarUrl || user.image || null;
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      if (impersonation) {
        try {
          await fetch("/api/admin/impersonation", { method: "DELETE" });
        } catch {
          // Ignore cookie cleanup failures and continue signing out.
        }
      }
      await authClient.signOut();
      router.replace("/");
      router.refresh();
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0f1117] text-[#e4e4e9]">
      <main className="mx-auto w-full max-w-[1820px] space-y-10 px-4 py-6 md:px-10 md:py-10">
        {impersonation ? (
          <section className="rounded-3xl border border-amber-400/40 bg-amber-500/10 p-5 shadow-lg md:p-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-2">
                <p className="text-sm font-black uppercase tracking-[0.28em] text-amber-200 md:text-base">
                  Admin Impersonation
                </p>
                <p className="text-base text-amber-50 md:text-xl">
                  Viewing {impersonation.targetName} ({impersonation.targetEmail}) in the real
                  dashboard as signed-in admin {impersonation.adminLabel}.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  href={`/admin/users/${impersonation.targetUserId}`}
                  className={cn(
                    "inline-flex min-h-14 items-center gap-2 rounded-full border border-[#252940] bg-[#1a1d2e]/86 px-5 py-2.5 text-base font-semibold text-[#e4e4e9] transition md:px-6 md:text-lg",
                    "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#818cf8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f1117]",
                  )}
                >
                  <ShieldCheck className="size-5" />
                  Back to Admin
                </Link>
                <form action="/api/admin/impersonation" method="post">
                  <input type="hidden" name="intent" value="stop" />
                  <input
                    type="hidden"
                    name="redirectTo"
                    value={`/admin/users/${impersonation.targetUserId}`}
                  />
                  <button
                    type="submit"
                    className={cn(
                      "inline-flex min-h-14 items-center gap-2 rounded-full border border-amber-400/40 bg-amber-500/20 px-5 py-2.5 text-base font-semibold text-amber-50 transition hover:bg-amber-500/30 md:px-6 md:text-lg",
                      "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#818cf8]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f1117]",
                    )}
                  >
                    Stop Impersonating
                  </button>
                </form>
              </div>
            </div>
          </section>
        ) : null}

        <section className="rounded-3xl border border-[#252940] bg-gradient-to-br from-[#1a1d2e] to-[#0f1117] p-6 shadow-2xl md:p-10">
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <Link
                  href="/"
                  className={cn(
                    "inline-flex min-h-14 items-center gap-2 rounded-full border border-[#6c8aff]/45 bg-[#6c8aff]/12 px-5 py-2.5 text-base font-semibold text-[#e4e4e9] transition md:px-6 md:text-lg",
                    "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#818cf8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f1117]",
                  )}
                >
                  <ArrowLeft className="size-5" />
                  Back to Hub
                </Link>
              </div>

              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "relative inline-flex min-h-14 select-none items-center rounded-full border border-[#252940] bg-[#1a1d2e]/86 py-3 pr-5 pl-16 text-base font-semibold text-[#e4e4e9] transition md:pr-6 md:pl-[4.5rem] md:text-xl",
                      "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#818cf8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f1117]",
                    )}
                  >
                    <Avatar className="absolute top-1/2 left-2 size-10 -translate-y-1/2 overflow-hidden border border-[#818cf8]/35 bg-[#1a1d2e]/86 shadow-none">
                      <AvatarImage
                        src={userImage ?? undefined}
                        alt={user.name}
                        className="object-cover object-center"
                      />
                      <AvatarFallback className="bg-[#252940] text-[#e4e4e9]">
                        {userInitials(user.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="select-none">{user.name}</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  className="w-[var(--radix-popover-trigger-width)] rounded-2xl border-[#252940] bg-[#0f1117]/96 p-2 text-[#e4e4e9]"
                >
                  {canAccessAdmin ? (
                    <Link
                      href="/admin"
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left text-base text-[#e4e4e9] transition hover:bg-[#6c8aff]/18 hover:text-[#e4e4e9]"
                    >
                      <ShieldCheck className="size-4" />
                      Admin
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void handleSignOut()}
                    disabled={isSigningOut}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left text-base text-rose-200 transition hover:bg-rose-500/20 hover:text-rose-100 disabled:cursor-not-allowed disabled:opacity-70",
                      canAccessAdmin ? "mt-1" : "",
                    )}
                  >
                    <LogOut className="size-4" />
                    {isSigningOut ? "Signing out..." : "Log out"}
                  </button>
                </PopoverContent>
              </Popover>
            </div>

            <nav className="flex flex-wrap gap-3">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = isActivePath(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "inline-flex min-h-14 items-center gap-3 rounded-full border px-6 py-3 text-xl font-semibold transition md:min-h-16 md:px-7 md:text-[1.8rem]",
                      "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#818cf8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f1117]",
                      isActive
                        ? "border-[#818cf8]/55 bg-[#6c8aff]/18 text-[#e4e4e9]"
                        : item.accent
                          ? "border-[#6c8aff]/45 bg-[#6c8aff]/14 text-[#e4e4e9] hover:bg-[#6c8aff]/22"
                          : "border-[#252940] bg-[#1a1d2e] text-[#e4e4e9]",
                    )}
                    >
                    <Icon className="size-6" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </section>

        {children}
      </main>
    </div>
  );
}
