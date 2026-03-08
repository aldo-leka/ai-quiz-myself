import Link from "next/link";
import { aliasedTable, desc, ilike, or, sql } from "drizzle-orm";
import { LayoutGrid, Search, UserRound } from "lucide-react";
import { AdminImpersonationForm } from "@/components/admin/admin-impersonation-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiKeys, credits, quizSessions, quizzes, session, user } from "@/db/schema";
import { db } from "@/db";

type UsersPageProps = {
  searchParams?: Promise<{ q?: string; page?: string }>;
};

const PAGE_SIZE = 50;

function parsePageParam(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return parsed;
}

function buildUsersHref(query: string, page: number) {
  const params = new URLSearchParams();
  if (query) {
    params.set("q", query);
  }
  if (page > 1) {
    params.set("page", String(page));
  }

  const serialized = params.toString();
  return serialized ? `/admin/users?${serialized}` : "/admin/users";
}

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

function latestDate(...values: unknown[]) {
  const timestamps = values
    .map((value) => normalizeDate(value))
    .filter((value): value is Date => value instanceof Date)
    .map((value) => value.getTime());

  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps));
}

export default async function AdminUsersPage({ searchParams }: UsersPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const query = resolvedSearchParams.q?.trim() ?? "";
  const requestedPage = parsePageParam(resolvedSearchParams.page);
  const adminUser = aliasedTable(user, "admin_user");
  const quizStats = db
    .select({
      userId: quizzes.creatorId,
      totalQuizzes: sql<number>`count(*)::int`.as("totalQuizzes"),
    })
    .from(quizzes)
    .where(sql`${quizzes.isHub} = false`)
    .groupBy(quizzes.creatorId)
    .as("quiz_stats");
  const gameStats = db
    .select({
      userId: quizSessions.userId,
      totalGames: sql<number>`count(*)::int`.as("totalGames"),
      lastGameAt: sql<Date | null>`max(${quizSessions.startedAt})`.as("lastGameAt"),
    })
    .from(quizSessions)
    .where(sql`${quizSessions.userId} is not null`)
    .groupBy(quizSessions.userId)
    .as("game_stats");
  const creditStats = db
    .select({
      userId: credits.userId,
      balanceCents: credits.balanceCents,
    })
    .from(credits)
    .as("credit_stats");
  const apiKeyStats = db
    .select({
      userId: apiKeys.userId,
      apiKeyCount: sql<number>`count(*)::int`.as("apiKeyCount"),
    })
    .from(apiKeys)
    .groupBy(apiKeys.userId)
    .as("api_key_stats");
  const sessionStats = db
    .select({
      userId: session.userId,
      activeSessionCount:
        sql<number>`sum(case when ${session.expiresAt} > now() then 1 else 0 end)::int`.as(
          "activeSessionCount",
        ),
      lastAuthAt: sql<Date | null>`max(${session.updatedAt})`.as("lastAuthAt"),
    })
    .from(session)
    .groupBy(session.userId)
    .as("session_stats");

  const listFilter = query
    ? or(ilike(adminUser.name, `%${query}%`), ilike(adminUser.email, `%${query}%`))
    : undefined;
  const countFilter = query
    ? or(ilike(user.name, `%${query}%`), ilike(user.email, `%${query}%`))
    : undefined;

  const rowsBaseQuery = db
    .select({
      id: adminUser.id,
      name: adminUser.name,
      email: adminUser.email,
      emailVerified: adminUser.emailVerified,
      isAdmin: adminUser.isAdmin,
      locale: adminUser.locale,
      preferredProvider: adminUser.preferredProvider,
      createdAt: adminUser.createdAt,
      totalQuizzes: sql<number>`coalesce(${quizStats.totalQuizzes}, 0)`,
      totalGames: sql<number>`coalesce(${gameStats.totalGames}, 0)`,
      balanceCents: sql<number>`coalesce(${creditStats.balanceCents}, 0)`,
      apiKeyCount: sql<number>`coalesce(${apiKeyStats.apiKeyCount}, 0)`,
      activeSessionCount: sql<number>`coalesce(${sessionStats.activeSessionCount}, 0)`,
      lastAuthAt: sessionStats.lastAuthAt,
      lastGameAt: gameStats.lastGameAt,
    })
    .from(adminUser)
    .leftJoin(quizStats, sql`${quizStats.userId} = ${adminUser.id}`)
    .leftJoin(gameStats, sql`${gameStats.userId} = ${adminUser.id}`)
    .leftJoin(creditStats, sql`${creditStats.userId} = ${adminUser.id}`)
    .leftJoin(apiKeyStats, sql`${apiKeyStats.userId} = ${adminUser.id}`)
    .leftJoin(sessionStats, sql`${sessionStats.userId} = ${adminUser.id}`);

  const countBaseQuery = db
    .select({
      total: sql<number>`count(*)::int`,
    })
    .from(user);
  const activeUsersBaseQuery = db
    .select({
      total: sql<number>`count(distinct ${user.id})::int`,
    })
    .from(user)
    .innerJoin(
      session,
      sql`${session.userId} = ${user.id} and ${session.expiresAt} > now()`,
    );

  const rowsQuery = listFilter ? rowsBaseQuery.where(listFilter) : rowsBaseQuery;
  const countQuery = countFilter ? countBaseQuery.where(countFilter) : countBaseQuery;
  const activeUsersQuery = countFilter
    ? activeUsersBaseQuery.where(countFilter)
    : activeUsersBaseQuery;

  const [countRows, activeUsersRows] = await Promise.all([countQuery, activeUsersQuery]);
  const total = Number(countRows[0]?.total ?? 0);
  const activeUsers = Number(activeUsersRows[0]?.total ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, pageCount);
  const offset = (currentPage - 1) * PAGE_SIZE;
  const rows = await rowsQuery.orderBy(desc(adminUser.createdAt)).limit(PAGE_SIZE).offset(offset);
  const startIndex = total === 0 ? 0 : offset + 1;
  const endIndex = total === 0 ? 0 : offset + rows.length;
  const hasPreviousPage = currentPage > 1;
  const hasNextPage = currentPage < pageCount;

  return (
    <main className="min-w-0 space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900">Users</h1>
            <p className="mt-2 max-w-3xl text-slate-600">
              Inspect accounts, usage, billing state, and jump into the real dashboard as any user.
            </p>
          </div>

          <form className="flex w-full max-w-xl items-center gap-3">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                type="search"
                name="q"
                defaultValue={query}
                placeholder="Search by name or email"
                className="pl-9"
              />
            </div>
            <Button type="submit">Search</Button>
            {query ? (
              <Button asChild variant="outline">
                <Link href="/admin/users">Reset</Link>
              </Button>
            ) : null}
          </form>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
          <p className="text-sm font-semibold text-slate-500">Users matched</p>
          <p className="mt-2 text-3xl font-black text-slate-900">{total.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
          <p className="text-sm font-semibold text-slate-500">Shown on this page</p>
          <p className="mt-2 text-3xl font-black text-slate-900">{rows.length.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
          <p className="text-sm font-semibold text-slate-500">Users with active sessions</p>
          <p className="mt-2 text-3xl font-black text-slate-900">{activeUsers.toLocaleString()}</p>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-slate-900">Directory</h2>
            <p className="text-sm text-slate-500">
              Showing {startIndex.toLocaleString()}-{endIndex.toLocaleString()} of {total.toLocaleString()},
              newest first.
            </p>
          </div>
          <Badge variant="outline">
            Page {currentPage} of {pageCount}
          </Badge>
        </div>

        <Table className="min-w-[1180px]">
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Locale</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Last Activity</TableHead>
              <TableHead>Quizzes</TableHead>
              <TableHead>Games</TableHead>
              <TableHead>Credits</TableHead>
              <TableHead>API Keys</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((entry) => {
              const lastActivity = latestDate(entry.lastAuthAt, entry.lastGameAt);

              return (
                <TableRow key={entry.id}>
                  <TableCell className="whitespace-normal">
                    <div className="space-y-1">
                      <div className="font-semibold text-slate-900">{entry.name}</div>
                      <div className="text-sm text-slate-500">{entry.email}</div>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <div className="flex flex-wrap gap-2">
                      {entry.isAdmin ? <Badge>Admin</Badge> : null}
                      <Badge variant="outline">
                        {entry.emailVerified ? "Verified" : "Unverified"}
                      </Badge>
                      {entry.activeSessionCount > 0 ? (
                        <Badge variant="outline">{entry.activeSessionCount} active sessions</Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>{entry.locale}</TableCell>
                  <TableCell>{formatDateTime(entry.createdAt)}</TableCell>
                  <TableCell>{formatDateTime(lastActivity)}</TableCell>
                  <TableCell>{entry.totalQuizzes}</TableCell>
                  <TableCell>{entry.totalGames}</TableCell>
                  <TableCell>${(entry.balanceCents / 100).toFixed(2)}</TableCell>
                  <TableCell className="whitespace-normal">
                    <div className="space-y-1">
                      <div>{entry.apiKeyCount}</div>
                      <div className="text-xs text-slate-500">{entry.preferredProvider ?? "—"}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/admin/users/${entry.id}`}>Details</Link>
                      </Button>
                      <AdminImpersonationForm size="sm" userId={entry.id}>
                        <LayoutGrid className="mr-1 size-4" />
                        Dashboard
                      </AdminImpersonationForm>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}

            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="py-8 text-center text-slate-500">
                  <div className="flex flex-col items-center gap-2">
                    <UserRound className="size-5" />
                    <span>No users matched this search.</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>

        <div className="mt-5 flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            {total === 0
              ? "No users matched this search."
              : `Showing ${startIndex.toLocaleString()}-${endIndex.toLocaleString()} of ${total.toLocaleString()} users.`}
          </p>
          <div className="flex gap-2">
            {hasPreviousPage ? (
              <Button asChild variant="outline">
                <Link href={buildUsersHref(query, currentPage - 1)}>Previous</Link>
              </Button>
            ) : (
              <Button variant="outline" disabled>
                Previous
              </Button>
            )}
            {hasNextPage ? (
              <Button asChild variant="outline">
                <Link href={buildUsersHref(query, currentPage + 1)}>Next</Link>
              </Button>
            ) : (
              <Button variant="outline" disabled>
                Next
              </Button>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
