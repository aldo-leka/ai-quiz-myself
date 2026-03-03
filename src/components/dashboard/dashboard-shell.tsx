"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, History, KeyRound, LayoutGrid, LibraryBig, Settings } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type DashboardShellProps = {
  children: React.ReactNode;
  user: {
    name: string;
    image?: string | null;
    avatarUrl?: string | null;
  };
};

const navItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutGrid },
  { href: "/dashboard/my-quizzes", label: "My Quizzes", icon: LibraryBig },
  { href: "/dashboard/api-keys", label: "API Keys", icon: KeyRound },
  { href: "/dashboard/history", label: "History", icon: History },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
] as const;

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
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardShell({ children, user }: DashboardShellProps) {
  const pathname = usePathname();
  const userImage = user.avatarUrl || user.image || null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="mx-auto w-full max-w-[1700px] space-y-8 px-4 py-6 md:px-8 md:py-8">
        <section className="rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-6 shadow-2xl md:p-8">
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-3">
                <Link
                  href="/"
                  className={cn(
                    "inline-flex min-h-11 items-center gap-2 rounded-full border border-cyan-500/50 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-100 transition",
                    "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
                  )}
                >
                  <ArrowLeft className="size-4" />
                  Back to Hub
                </Link>
                <h1 className="text-4xl font-black tracking-tight text-slate-100 md:text-5xl">
                  Player Dashboard
                </h1>
              </div>

              <div className="inline-flex items-center gap-3 rounded-full border border-slate-700 bg-slate-900/80 px-3 py-2">
                <Avatar size="lg" className="border border-slate-700">
                  <AvatarImage src={userImage ?? undefined} alt={user.name} />
                  <AvatarFallback className="bg-slate-800 text-cyan-100">
                    {userInitials(user.name)}
                  </AvatarFallback>
                </Avatar>
                <p className="text-sm font-semibold text-slate-100">{user.name}</p>
              </div>
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
                      "inline-flex min-h-12 items-center gap-2 rounded-full border px-5 py-2 text-lg font-semibold transition",
                      "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
                      isActive
                        ? "border-cyan-400 bg-cyan-500/20 text-cyan-100"
                        : "border-slate-700 bg-slate-900 text-slate-200",
                    )}
                  >
                    <Icon className="size-5" />
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
