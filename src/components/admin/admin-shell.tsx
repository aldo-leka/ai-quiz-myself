"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { Flag, KeyRound, LayoutDashboard, NotebookPen, UserRound, Users, Wallet } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

type AdminShellProps = {
  children: React.ReactNode;
  userLabel: string;
};

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/quizzes", label: "Quizzes", icon: NotebookPen },
  { href: "/admin/api-keys", label: "API Keys", icon: KeyRound },
  { href: "/admin/moderation", label: "Moderation", icon: Flag },
  { href: "/admin/pricing", label: "Pricing", icon: Wallet },
] satisfies Array<{ href: string; label: string; icon: LucideIcon }>;

function isActivePath(pathname: string, href: string) {
  if (href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminShell({ children, userLabel }: AdminShellProps) {
  const pathname = usePathname();

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel className="px-2 text-sm font-bold tracking-wide text-slate-400">
              QuizPlus Admin
            </SidebarGroupLabel>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActivePath(pathname, item.href)}
                    className={cn(
                      "text-sm",
                      isActivePath(pathname, item.href) && "font-semibold",
                    )}
                  >
                    <Link href={item.href} className="flex items-center gap-2">
                      <item.icon className="size-4 shrink-0" aria-hidden="true" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="p-3">
          <Link
            href="/dashboard"
            className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
          >
            <UserRound className="size-3.5 shrink-0" />
            User Dashboard
          </Link>
          <p className="mt-2 text-xs text-slate-500">{userLabel}</p>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0">
        <header className="flex items-center gap-3 border-b px-4 py-3">
          <SidebarTrigger />
          <div className="text-sm font-semibold text-slate-700">Admin Dashboard</div>
        </header>
        <div className="min-w-0 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
