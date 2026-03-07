import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getDashboardViewerContextOrNull } from "@/lib/user-auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const viewerContext = await getDashboardViewerContextOrNull();
  const session = viewerContext?.session;

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
      canAccessAdmin={Boolean(viewerContext?.canAccessAdmin)}
      impersonation={
        viewerContext?.impersonation
          ? {
              adminLabel:
                viewerContext.authSession.user.name ||
                viewerContext.impersonation.adminEmail ||
                "Admin",
              targetEmail: viewerContext.impersonation.targetEmail,
              targetName: viewerContext.impersonation.targetName,
              targetUserId: viewerContext.impersonation.targetUserId,
            }
          : null
      }
    >
      {children}
    </DashboardShell>
  );
}
