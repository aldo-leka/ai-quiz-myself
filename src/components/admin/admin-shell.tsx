"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  { href: "/admin", label: "📊 Dashboard" },
  { href: "/admin/quizzes", label: "📝 Quizzes" },
  { href: "/admin/api-keys", label: "🔑 API Keys" },
  { href: "/admin/moderation", label: "🚩 Moderation" },
  { href: "/admin/pricing", label: "💰 Pricing" },
] as const;

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
                    <Link href={item.href}>{item.label}</Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="p-3 text-xs text-slate-500">{userLabel}</SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex items-center gap-3 border-b px-4 py-3">
          <SidebarTrigger />
          <div className="text-sm font-semibold text-slate-700">Admin Dashboard</div>
        </header>
        <div className="p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
