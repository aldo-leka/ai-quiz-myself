import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft, Play } from "lucide-react";
import { notFound } from "next/navigation";
import { DashboardOverviewContent } from "@/components/dashboard/dashboard-overview-content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { user } from "@/db/schema";
import { getDashboardOverviewData } from "@/lib/dashboard-overview";

type AdminUserDashboardPreviewPageProps = {
  params: Promise<{ userId: string }>;
};

const playerButtonBaseClass =
  "rounded-xl border transition focus-visible:ring-cyan-400/60";
const playerButtonCyanClass =
  "border-cyan-500/50 bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30";

export default async function AdminUserDashboardPreviewPage({
  params,
}: AdminUserDashboardPreviewPageProps) {
  const { userId } = await params;

  const [targetUser] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      image: user.image,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!targetUser) {
    notFound();
  }

  const overview = await getDashboardOverviewData(targetUser.id);

  return (
    <main className="space-y-6">
      <section className="rounded-3xl border border-cyan-200 bg-cyan-50 p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Read-only preview</Badge>
              <Badge variant="outline">{targetUser.email}</Badge>
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight text-slate-900">
                Dashboard Preview: {targetUser.name}
              </h1>
              <p className="mt-2 max-w-3xl text-slate-600">
                This renders the same overview data the user dashboard landing page uses, without
                changing auth state or impersonating the account.
              </p>
            </div>
          </div>

          <Button asChild variant="outline">
            <Link href={`/admin/users/${targetUser.id}`}>
              <ArrowLeft className="mr-2 size-4" />
              Back to User Details
            </Link>
          </Button>
        </div>
      </section>

      <DashboardOverviewContent
        user={{
          name: targetUser.name,
          image: targetUser.image,
          avatarUrl: targetUser.avatarUrl,
        }}
        overview={overview}
        renderQuizAction={(quiz) => (
          <Button
            asChild
            size="sm"
            className={`${playerButtonBaseClass} ${playerButtonCyanClass}`}
          >
            <Link href={`/play/${quiz.id}`}>
              <Play className="mr-1 size-4" />
              Play
            </Link>
          </Button>
        )}
      />
    </main>
  );
}
