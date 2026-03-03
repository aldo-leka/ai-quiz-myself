import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getUserSessionOrNull } from "@/lib/user-auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getUserSessionOrNull();

  if (!session?.user?.id) {
    redirect("/sign-in?callbackURL=/dashboard");
  }

  return (
    <DashboardShell
      user={{
        name: session.user.name || session.user.email || "Player",
        image: session.user.image,
        avatarUrl: session.user.avatarUrl,
      }}
    >
      {children}
    </DashboardShell>
  );
}
