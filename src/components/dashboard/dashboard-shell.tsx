"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
import { focusRemoteControl } from "@/lib/remote-focus";
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

type Direction = "left" | "right" | "up" | "down";

function isEditableElement(node: Element | null): boolean {
  if (!node || !(node instanceof HTMLElement)) return false;

  const tag = node.tagName.toLowerCase();
  return (
    node.isContentEditable ||
    tag === "input" ||
    tag === "textarea" ||
    tag === "select"
  );
}

function isTvFocusableInput(node: Element | null): node is HTMLInputElement | HTMLTextAreaElement {
  return (
    (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) &&
    node.dataset.tvInput === "true"
  );
}

function isFocusableDashboardControl(node: Element): node is HTMLElement {
  if (!(node instanceof HTMLElement)) return false;
  if (node.tabIndex < 0) return false;
  if (node.hasAttribute("disabled") || node.getAttribute("aria-disabled") === "true") return false;
  if (node.getAttribute("aria-hidden") === "true") return false;
  if (node.getAttribute("role") === "combobox") return false;
  if (node.dataset.tvIgnore === "true" || node.closest("[data-tv-ignore='true']")) return false;
  if (isEditableElement(node) && !isTvFocusableInput(node)) return false;

  const style = window.getComputedStyle(node);
  if (style.display === "none" || style.visibility === "hidden") return false;

  const rect = node.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function focusDashboardControl(node: HTMLElement | null, options?: ScrollIntoViewOptions) {
  if (!node) return;

  focusRemoteControl(node, options);

  if (isTvFocusableInput(node)) {
    node.click();
    const length = node.value.length;
    try {
      node.setSelectionRange(length, length);
    } catch {
      // Ignore inputs that don't support range selection.
    }
  }
}

function findNextDashboardControl(
  currentNode: HTMLElement,
  nodes: HTMLElement[],
  direction: Direction,
) {
  const currentRect = currentNode.getBoundingClientRect();
  const currentX = currentRect.left + currentRect.width / 2;
  const currentY = currentRect.top + currentRect.height / 2;
  const verticalBand = Math.max(currentRect.height * 0.75, 36);
  const horizontalBand = Math.max(currentRect.width * 0.75, 36);

  const candidates = nodes
    .filter((node) => node !== currentNode)
    .map((node) => {
      const rect = node.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const dx = x - currentX;
      const dy = y - currentY;
      const withinVerticalBand = Math.abs(dy) <= verticalBand;
      const withinHorizontalBand = Math.abs(dx) <= horizontalBand;

      switch (direction) {
        case "left":
          if (dx >= -4) return null;
          return {
            node,
            primary: Math.abs(dx),
            secondary: Math.abs(dy),
            preferredAxis: withinVerticalBand ? 0 : 1,
          };
        case "right":
          if (dx <= 4) return null;
          return {
            node,
            primary: dx,
            secondary: Math.abs(dy),
            preferredAxis: withinVerticalBand ? 0 : 1,
          };
        case "up":
          if (dy >= -4) return null;
          return {
            node,
            primary: Math.abs(dy),
            secondary: Math.abs(dx),
            preferredAxis: withinHorizontalBand ? 0 : 1,
          };
        case "down":
          if (dy <= 4) return null;
          return {
            node,
            primary: dy,
            secondary: Math.abs(dx),
            preferredAxis: withinHorizontalBand ? 0 : 1,
          };
      }
    })
    .filter(
      (
        candidate,
      ): candidate is {
        node: HTMLElement;
        primary: number;
        secondary: number;
        preferredAxis: number;
      } =>
        candidate !== null,
    )
    .sort((a, b) => {
      const aScore = a.preferredAxis * 1_000_000 + a.primary * 1000 + a.secondary;
      const bScore = b.preferredAxis * 1_000_000 + b.primary * 1000 + b.secondary;
      return aScore - bScore;
    });

  return candidates[0]?.node ?? null;
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

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter"].includes(event.key)) {
        return;
      }

      if (
        isEditableElement(document.activeElement) &&
        !isTvFocusableInput(document.activeElement)
      ) {
        return;
      }

      const candidates = Array.from(
        document.querySelectorAll<HTMLElement>(
          "main a[href], main button, main [role='button'], main [role='switch'], main input[data-tv-input='true'], main textarea[data-tv-input='true']",
        ),
      ).filter(isFocusableDashboardControl);

      if (!candidates.length) {
        return;
      }

      const activeElement =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const currentNode = activeElement && candidates.includes(activeElement) ? activeElement : null;

      if (event.key === "Enter") {
        if (!currentNode) {
          event.preventDefault();
          focusDashboardControl(candidates[0] ?? null);
          return;
        }

        if (currentNode instanceof HTMLAnchorElement) {
          event.preventDefault();
          currentNode.click();
          return;
        }

        if (typeof currentNode.click === "function") {
          event.preventDefault();
          currentNode.click();
        }

        if (isTvFocusableInput(currentNode)) {
          currentNode.focus();
          currentNode.click();
        }
        return;
      }

      event.preventDefault();

      if (!currentNode) {
        focusDashboardControl(candidates[0] ?? null);
        return;
      }

      if (event.key === "ArrowLeft" && currentNode.dataset.tvId === "dashboard-user-pill") {
        const settingsLink = candidates.find(
          (node) => node.dataset.tvId === "dashboard-settings-link",
        );
        if (settingsLink) {
          focusDashboardControl(settingsLink);
          return;
        }
      }

      if (event.key === "ArrowRight" && currentNode.dataset.tvId === "dashboard-settings-link") {
        const userPill = candidates.find((node) => node.dataset.tvId === "dashboard-user-pill");
        if (userPill) {
          focusDashboardControl(userPill);
          return;
        }
      }

      if (event.key === "ArrowDown" && currentNode.dataset.tvId === "dashboard-billing-link") {
        const topUpButton = candidates.find((node) => node.dataset.tvId === "billing-topup-button");
        if (topUpButton) {
          focusDashboardControl(topUpButton);
          return;
        }
      }

      if (event.key === "ArrowRight" && currentNode.dataset.tvId === "billing-topup-button") {
        const managePaymentButton = candidates.find(
          (node) => node.dataset.tvId === "billing-manage-payment-button",
        );
        if (managePaymentButton) {
          focusDashboardControl(managePaymentButton);
          return;
        }
      }

      if (
        event.key === "ArrowLeft" &&
        currentNode.dataset.tvId === "billing-manage-payment-button"
      ) {
        const topUpButton = candidates.find((node) => node.dataset.tvId === "billing-topup-button");
        if (topUpButton) {
          focusDashboardControl(topUpButton);
          return;
        }
      }

      if (
        event.key === "ArrowDown" &&
        (currentNode.dataset.tvId === "billing-topup-button" ||
          currentNode.dataset.tvId === "billing-manage-payment-button")
      ) {
        const autoRechargeSwitch = candidates.find(
          (node) => node.dataset.tvId === "billing-auto-recharge-switch",
        );
        if (autoRechargeSwitch) {
          focusDashboardControl(autoRechargeSwitch);
          return;
        }
      }

      if (
        event.key === "ArrowDown" &&
        currentNode.dataset.tvId === "billing-auto-recharge-switch"
      ) {
        const thresholdInput = candidates.find((node) => node.dataset.tvId === "billing-threshold-input");
        if (thresholdInput) {
          focusDashboardControl(thresholdInput);
          return;
        }
      }

      if (event.key === "ArrowUp" && currentNode.dataset.tvId === "billing-threshold-input") {
        const autoRechargeSwitch = candidates.find(
          (node) => node.dataset.tvId === "billing-auto-recharge-switch",
        );
        if (autoRechargeSwitch) {
          focusDashboardControl(autoRechargeSwitch);
          return;
        }
      }

      if (event.key === "ArrowRight" && currentNode.dataset.tvId === "billing-threshold-input") {
        const targetInput = candidates.find((node) => node.dataset.tvId === "billing-target-input");
        if (targetInput) {
          focusDashboardControl(targetInput);
          return;
        }
      }

      if (event.key === "ArrowLeft" && currentNode.dataset.tvId === "billing-target-input") {
        const thresholdInput = candidates.find(
          (node) => node.dataset.tvId === "billing-threshold-input",
        );
        if (thresholdInput) {
          focusDashboardControl(thresholdInput);
          return;
        }
      }

      if (event.key === "ArrowRight" && currentNode.dataset.tvId === "billing-target-input") {
        const monthlyCapInput = candidates.find(
          (node) => node.dataset.tvId === "billing-monthly-cap-input",
        );
        if (monthlyCapInput) {
          focusDashboardControl(monthlyCapInput);
          return;
        }
      }

      if (
        event.key === "ArrowLeft" &&
        currentNode.dataset.tvId === "billing-monthly-cap-input"
      ) {
        const targetInput = candidates.find((node) => node.dataset.tvId === "billing-target-input");
        if (targetInput) {
          focusDashboardControl(targetInput);
          return;
        }
      }

      if (event.key === "ArrowRight" && currentNode.dataset.tvId === "create-billing-link") {
        const sourceTheme = candidates.find((node) => node.dataset.tvId === "create-source-theme");
        if (sourceTheme) {
          focusRemoteControl(sourceTheme);
          return;
        }
      }

      if (event.key === "ArrowLeft" && currentNode.dataset.tvId === "create-source-theme") {
        const billingLink = candidates.find((node) => node.dataset.tvId === "create-billing-link");
        if (billingLink) {
          focusRemoteControl(billingLink);
          return;
        }
      }

      if (event.key === "ArrowRight" && currentNode.dataset.tvId === "create-source-theme") {
        const sourceUrl = candidates.find((node) => node.dataset.tvId === "create-source-url");
        if (sourceUrl) {
          focusRemoteControl(sourceUrl);
          return;
        }
      }

      if (event.key === "ArrowLeft" && currentNode.dataset.tvId === "create-source-url") {
        const sourceTheme = candidates.find((node) => node.dataset.tvId === "create-source-theme");
        if (sourceTheme) {
          focusRemoteControl(sourceTheme);
          return;
        }
      }

      if (event.key === "ArrowRight" && currentNode.dataset.tvId === "create-source-url") {
        const sourcePdf = candidates.find((node) => node.dataset.tvId === "create-source-pdf");
        if (sourcePdf) {
          focusRemoteControl(sourcePdf);
          return;
        }
      }

      if (event.key === "ArrowLeft" && currentNode.dataset.tvId === "create-source-pdf") {
        const sourceUrl = candidates.find((node) => node.dataset.tvId === "create-source-url");
        if (sourceUrl) {
          focusRemoteControl(sourceUrl);
          return;
        }
      }

      if (
        pathname === "/dashboard" &&
        event.key === "ArrowUp" &&
        currentNode.closest("[data-tv-scope='quizzes-grid']")
      ) {
        const quizFilterCandidates = candidates.filter((node) => {
          return (
            node.dataset.tvId === "quizzes-filter-mode" ||
            node.dataset.tvId === "quizzes-filter-status" ||
            node.dataset.tvId === "quizzes-filter-language" ||
            node.dataset.tvId === "quizzes-play-random"
          );
        });
        const nearestQuizFilter = findNextDashboardControl(
          currentNode,
          quizFilterCandidates,
          "up",
        );
        if (nearestQuizFilter) {
          focusDashboardControl(nearestQuizFilter);
          return;
        }
      }

      const direction = event.key.replace("Arrow", "").toLowerCase() as Direction;
      const nextNode = findNextDashboardControl(currentNode, candidates, direction);
      if (nextNode) {
        focusDashboardControl(nextNode);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pathname]);

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
                  href="/hub"
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
                    data-tv-id="dashboard-user-pill"
                    className={cn(
                      "relative inline-flex min-h-14 select-none items-center justify-center rounded-full border border-[#252940] bg-[#1a1d2e]/86 px-5 py-3 text-base font-semibold text-[#e4e4e9] transition md:px-6 md:text-xl",
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
                    <span className="block px-12 text-center select-none md:px-14">{user.name}</span>
                    <Avatar
                      aria-hidden="true"
                      className="invisible absolute top-1/2 right-2 size-10 -translate-y-1/2 overflow-hidden border border-[#818cf8]/35 bg-[#1a1d2e]/86 shadow-none"
                    />
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

            <nav data-tv-scope="dashboard-nav" className="flex flex-wrap gap-3">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = isActivePath(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    data-tv-id={
                      item.href === "/dashboard"
                        ? "dashboard-quizzes-link"
                        : item.href === "/dashboard/settings"
                        ? "dashboard-settings-link"
                        : item.href === "/dashboard/billing"
                          ? "dashboard-billing-link"
                          : undefined
                    }
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
