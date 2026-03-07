import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { ArrowLeft, LayoutGrid } from "lucide-react";
import { notFound } from "next/navigation";
import { AdminImpersonationForm } from "@/components/admin/admin-impersonation-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { account, apiKeys, credits, creditTransactions, quizSessions, quizzes, session, user } from "@/db/schema";
import { db } from "@/db";

type UserDetailPageProps = {
  params: Promise<{ userId: string }>;
};

function normalizeDate(value: unknown): Date | null {
  if (!value) return null;

  const candidate =
    value instanceof Date
      ? value
      : typeof value === "string" || typeof value === "number"
        ? new Date(value)
        : null;

  if (!candidate || Number.isNaN(candidate.getTime())) {
    return null;
  }

  return candidate;
}

function formatDateTime(value: unknown) {
  const normalized = normalizeDate(value);
  if (!normalized) return "—";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(normalized);
}

function summarizeUserAgent(value: string | null) {
  if (!value) return "Unknown device";
  return value.slice(0, 100);
}

export default async function AdminUserDetailPage({ params }: UserDetailPageProps) {
  const { userId } = await params;

  const [profile] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      isAdmin: user.isAdmin,
      locale: user.locale,
      preferredProvider: user.preferredProvider,
      avatarUrl: user.avatarUrl,
      image: user.image,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!profile) {
    notFound();
  }

  const [
    creditBalanceRows,
    quizStatsRows,
    gameStatsRows,
    apiKeyCountRows,
    sessionStatsRows,
    spendRows,
    providers,
    userApiKeys,
    recentAuthSessions,
    recentTransactions,
    recentQuizzes,
  ] = await Promise.all([
    db
      .select({
        balanceCents: credits.balanceCents,
      })
      .from(credits)
      .where(eq(credits.userId, userId))
      .limit(1),
    db
      .select({
        totalQuizzes: sql<number>`count(*)::int`,
      })
      .from(quizzes)
      .where(sql`${quizzes.creatorId} = ${userId} and ${quizzes.isHub} = false`),
    db
      .select({
        totalGames: sql<number>`count(*)::int`,
        avgScore: sql<number>`coalesce(avg(${quizSessions.totalScore})::float, 0)`,
        lastGameAt: sql<Date | null>`max(${quizSessions.startedAt})`,
      })
      .from(quizSessions)
      .where(eq(quizSessions.userId, userId)),
    db
      .select({
        apiKeyCount: sql<number>`count(*)::int`,
      })
      .from(apiKeys)
      .where(eq(apiKeys.userId, userId)),
    db
      .select({
        activeSessionCount: sql<number>`sum(case when ${session.expiresAt} > now() then 1 else 0 end)::int`,
        lastAuthAt: sql<Date | null>`max(${session.updatedAt})`,
      })
      .from(session)
      .where(eq(session.userId, userId)),
    db
      .select({
        totalSpentCents: sql<number>`coalesce(sum(${creditTransactions.amountCents})::int, 0)`,
      })
      .from(creditTransactions)
      .where(
        sql`${creditTransactions.userId} = ${userId} and ${creditTransactions.type} = 'purchase' and ${creditTransactions.status} = 'completed'`,
      ),
    db
      .select({
        providerId: account.providerId,
      })
      .from(account)
      .where(eq(account.userId, userId)),
    db
      .select({
        provider: apiKeys.provider,
        label: apiKeys.label,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.userId, userId))
      .orderBy(desc(apiKeys.createdAt)),
    db
      .select({
        id: session.id,
        updatedAt: session.updatedAt,
        expiresAt: session.expiresAt,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
      })
      .from(session)
      .where(eq(session.userId, userId))
      .orderBy(desc(session.updatedAt))
      .limit(5),
    db
      .select({
        id: creditTransactions.id,
        amountCents: creditTransactions.amountCents,
        type: creditTransactions.type,
        status: creditTransactions.status,
        description: creditTransactions.description,
        createdAt: creditTransactions.createdAt,
      })
      .from(creditTransactions)
      .where(eq(creditTransactions.userId, userId))
      .orderBy(desc(creditTransactions.createdAt))
      .limit(5),
    db
      .select({
        id: quizzes.id,
        title: quizzes.title,
        createdAt: quizzes.createdAt,
        playCount: quizzes.playCount,
        likes: quizzes.likes,
        dislikes: quizzes.dislikes,
      })
      .from(quizzes)
      .where(eq(quizzes.creatorId, userId))
      .orderBy(desc(quizzes.createdAt))
      .limit(5),
  ]);

  const balanceCents = Number(creditBalanceRows[0]?.balanceCents ?? 0);
  const totalQuizzes = Number(quizStatsRows[0]?.totalQuizzes ?? 0);
  const totalGames = Number(gameStatsRows[0]?.totalGames ?? 0);
  const avgScore = Number(gameStatsRows[0]?.avgScore ?? 0);
  const lastGameAt = gameStatsRows[0]?.lastGameAt ?? null;
  const apiKeyCount = Number(apiKeyCountRows[0]?.apiKeyCount ?? 0);
  const activeSessionCount = Number(sessionStatsRows[0]?.activeSessionCount ?? 0);
  const lastAuthAt = sessionStatsRows[0]?.lastAuthAt ?? null;
  const totalSpentCents = Number(spendRows[0]?.totalSpentCents ?? 0);

  return (
    <main className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">User ID: {profile.id}</Badge>
              {profile.isAdmin ? <Badge>Admin</Badge> : null}
              <Badge variant="outline">
                {profile.emailVerified ? "Verified email" : "Unverified email"}
              </Badge>
            </div>

            <div>
              <h1 className="text-3xl font-black tracking-tight text-slate-900">{profile.name}</h1>
              <p className="mt-1 text-lg text-slate-600">{profile.email}</p>
            </div>

            <p className="max-w-3xl text-slate-600">
              Review account state, session activity, recent billing events, and open the actual
              dashboard in this user&apos;s session context.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link href="/admin/users">
                <ArrowLeft className="mr-2 size-4" />
                Back to Users
              </Link>
            </Button>
            <AdminImpersonationForm userId={profile.id}>
              <LayoutGrid className="mr-2 size-4" />
              Open Dashboard
            </AdminImpersonationForm>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">Joined</p>
          <p className="mt-2 text-2xl font-black text-slate-900">{formatDateTime(profile.createdAt)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">Credits Balance</p>
          <p className="mt-2 text-2xl font-black text-slate-900">${(balanceCents / 100).toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">Private Quizzes / Games</p>
          <p className="mt-2 text-2xl font-black text-slate-900">
            {totalQuizzes} / {totalGames}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">Avg Score / Purchases</p>
          <p className="mt-2 text-2xl font-black text-slate-900">
            {avgScore.toFixed(1)} / ${(totalSpentCents / 100).toFixed(2)}
          </p>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black text-slate-900">Account Details</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-500">Preferred Provider</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">
                {profile.preferredProvider ?? "—"}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-500">Locale</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{profile.locale}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-500">Active Sessions</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{activeSessionCount}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-500">Configured API Keys</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{apiKeyCount}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-500">Last Auth Activity</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{formatDateTime(lastAuthAt)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-500">Last Game Activity</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{formatDateTime(lastGameAt)}</p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <div>
              <p className="text-sm font-semibold text-slate-500">Connected Accounts</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {providers.length > 0 ? (
                  providers.map((entry) => (
                    <Badge key={entry.providerId} variant="outline">
                      {entry.providerId}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-slate-500">No linked providers</span>
                )}
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-500">Stored API Keys</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {userApiKeys.length > 0 ? (
                  userApiKeys.map((entry) => (
                    <Badge
                      key={`${entry.provider}-${normalizeDate(entry.createdAt)?.toISOString() ?? String(entry.createdAt)}`}
                      variant="outline"
                    >
                      {entry.provider}
                      {entry.label ? ` · ${entry.label}` : ""}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-slate-500">No API keys configured</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black text-slate-900">Recent Auth Sessions</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Last Seen</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Agent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentAuthSessions.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{formatDateTime(entry.updatedAt)}</TableCell>
                  <TableCell>{formatDateTime(entry.expiresAt)}</TableCell>
                  <TableCell>{entry.ipAddress ?? "—"}</TableCell>
                  <TableCell className="max-w-sm whitespace-normal text-xs text-slate-500">
                    {summarizeUserAgent(entry.userAgent)}
                  </TableCell>
                </TableRow>
              ))}
              {recentAuthSessions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-6 text-center text-slate-500">
                    No auth sessions recorded.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black text-slate-900">Recent Billing Activity</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentTransactions.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{formatDateTime(entry.createdAt)}</TableCell>
                  <TableCell>{entry.type}</TableCell>
                  <TableCell>{entry.status}</TableCell>
                  <TableCell className="whitespace-normal">{entry.description}</TableCell>
                  <TableCell className="text-right">${(entry.amountCents / 100).toFixed(2)}</TableCell>
                </TableRow>
              ))}
              {recentTransactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-slate-500">
                    No billing activity yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black text-slate-900">Recent Quizzes</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Plays</TableHead>
                <TableHead>Rating</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentQuizzes.map((entry) => {
                const totalVotes = entry.likes + entry.dislikes;
                return (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-normal font-medium text-slate-900">
                      {entry.title}
                    </TableCell>
                    <TableCell>{formatDateTime(entry.createdAt)}</TableCell>
                    <TableCell>{entry.playCount}</TableCell>
                    <TableCell>
                      {totalVotes > 0 ? `${Math.round((entry.likes / totalVotes) * 100)}%` : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
              {recentQuizzes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-6 text-center text-slate-500">
                    No quizzes created yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </section>
    </main>
  );
}
