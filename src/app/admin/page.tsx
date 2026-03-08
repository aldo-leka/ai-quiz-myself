import { and, desc, eq, gte, inArray, isNotNull, or, sql } from "drizzle-orm";
import { ActiveUsersChart } from "@/components/admin/active-users-chart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { db } from "@/db";
import { user } from "@/db/schema/auth";
import { creditTransactions, hubCandidates, quizSessions, quizzes } from "@/db/schema/quiz";

function toUtcDayStart(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function toUtcWeekStart(date: Date) {
  const dayStart = toUtcDayStart(date);
  const mondayOffset = (dayStart.getUTCDay() + 6) % 7;
  dayStart.setUTCDate(dayStart.getUTCDate() - mondayOffset);
  return dayStart;
}

function toUtcMonthStart(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addUtcDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function dayKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate(),
  ).padStart(2, "0")}`;
}

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function asNumber(value: unknown) {
  return typeof value === "number" ? value : Number(value ?? 0);
}

export default async function AdminPage() {
  const now = new Date();
  const oneYearAgo = addUtcDays(toUtcDayStart(now), -365);

  const [
    totalUsersRow,
    totalQuizzesRow,
    totalGamesPlayedRow,
    totalRevenueRow,
    flaggedCountRow,
    popularQuizzes,
    sessionRows,
  ] = await Promise.all([
    db.select({ total: sql<number>`count(*)::int` }).from(user),
    db.select({ total: sql<number>`count(*)::int` }).from(quizzes),
    db.select({ total: sql<number>`count(*)::int` }).from(quizSessions),
    db
      .select({ total: sql<number>`coalesce(sum(${creditTransactions.amountCents}), 0)::int` })
      .from(creditTransactions)
      .where(
        and(
          inArray(creditTransactions.type, ["purchase", "auto_reload"]),
          eq(creditTransactions.status, "completed"),
        ),
      ),
    db
      .select({
        total: sql<number>`count(*)::int`,
      })
      .from(hubCandidates)
      .where(
        or(
          inArray(hubCandidates.status, ["pending", "processing"]),
          eq(hubCandidates.decision, "reject_unsafe"),
        ),
      ),
    db
      .select({
        id: quizzes.id,
        title: quizzes.title,
        theme: quizzes.theme,
        playCount: quizzes.playCount,
      })
      .from(quizzes)
      .orderBy(desc(quizzes.playCount), desc(quizzes.createdAt))
      .limit(10),
    db
      .select({
        userId: quizSessions.userId,
        startedAt: quizSessions.startedAt,
      })
      .from(quizSessions)
      .where(and(isNotNull(quizSessions.userId), gte(quizSessions.startedAt, oneYearAgo))),
  ]);

  const dailyUserSets = new Map<string, Set<string>>();
  const weeklyUserSets = new Map<string, Set<string>>();
  const monthlyUserSets = new Map<string, Set<string>>();

  for (const row of sessionRows) {
    const userId = row.userId;
    if (!userId) continue;
    const startedAt = row.startedAt ? new Date(row.startedAt) : null;
    if (!startedAt) continue;

    const day = toUtcDayStart(startedAt);
    const week = toUtcWeekStart(startedAt);
    const month = toUtcMonthStart(startedAt);

    const dKey = dayKey(day);
    const wKey = dayKey(week);
    const mKey = monthKey(month);

    if (!dailyUserSets.has(dKey)) dailyUserSets.set(dKey, new Set());
    if (!weeklyUserSets.has(wKey)) weeklyUserSets.set(wKey, new Set());
    if (!monthlyUserSets.has(mKey)) monthlyUserSets.set(mKey, new Set());

    dailyUserSets.get(dKey)?.add(userId);
    weeklyUserSets.get(wKey)?.add(userId);
    monthlyUserSets.get(mKey)?.add(userId);
  }

  const dayLabelFormat = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const monthLabelFormat = new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

  const todayStart = toUtcDayStart(now);
  const currentWeekStart = toUtcWeekStart(now);
  const currentMonthStart = toUtcMonthStart(now);

  const daily = Array.from({ length: 14 }).map((_, index) => {
    const offset = index - 13;
    const bucketDate = addUtcDays(todayStart, offset);
    const key = dayKey(bucketDate);
    return {
      label: dayLabelFormat.format(bucketDate),
      activeUsers: dailyUserSets.get(key)?.size ?? 0,
    };
  });

  const weekly = Array.from({ length: 12 }).map((_, index) => {
    const offset = (index - 11) * 7;
    const bucketDate = addUtcDays(currentWeekStart, offset);
    const key = dayKey(bucketDate);
    return {
      label: dayLabelFormat.format(bucketDate),
      activeUsers: weeklyUserSets.get(key)?.size ?? 0,
    };
  });

  const monthly = Array.from({ length: 12 }).map((_, index) => {
    const bucketDate = new Date(
      Date.UTC(currentMonthStart.getUTCFullYear(), currentMonthStart.getUTCMonth() + index - 11, 1),
    );
    const key = monthKey(bucketDate);
    return {
      label: monthLabelFormat.format(bucketDate),
      activeUsers: monthlyUserSets.get(key)?.size ?? 0,
    };
  });

  const totalUsers = asNumber(totalUsersRow[0]?.total);
  const totalQuizzes = asNumber(totalQuizzesRow[0]?.total);
  const totalGamesPlayed = asNumber(totalGamesPlayedRow[0]?.total);
  const totalRevenueCents = asNumber(totalRevenueRow[0]?.total);
  const flaggedContentCount = asNumber(flaggedCountRow[0]?.total);

  return (
    <main className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Total users</CardDescription>
            <CardTitle className="text-3xl">{totalUsers.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Total quizzes</CardDescription>
            <CardTitle className="text-3xl">{totalQuizzes.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Total games played</CardDescription>
            <CardTitle className="text-3xl">{totalGamesPlayed.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Revenue (USD)</CardDescription>
            <CardTitle className="text-3xl">${(totalRevenueCents / 100).toFixed(2)}</CardTitle>
          </CardHeader>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Active Users</CardTitle>
            <CardDescription>Unique authenticated users in each time bucket.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActiveUsersChart daily={daily} weekly={weekly} monthly={monthly} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Flagged Content</CardTitle>
            <CardDescription>Pending or unsafe hub candidates.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{flaggedContentCount.toLocaleString()}</div>
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Most Popular Quizzes</CardTitle>
            <CardDescription>Top 10 by play count.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Theme</TableHead>
                  <TableHead className="text-right">Plays</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {popularQuizzes.map((quiz, index) => (
                  <TableRow key={quiz.id}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell className="max-w-[420px] truncate">{quiz.title}</TableCell>
                    <TableCell>{quiz.theme}</TableCell>
                    <TableCell className="text-right">{quiz.playCount.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
