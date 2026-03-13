import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";

type RateLimitOptions = {
  scope: string;
  identifier: string;
  limit: number;
  windowMs: number;
  errorMessage: string;
};

type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

const RATE_LIMIT_BUCKET_RETENTION_MS = 48 * 60 * 60 * 1000;
const RATE_LIMIT_PRUNE_INTERVAL_MS = 15 * 60 * 1000;

let lastRateLimitPruneAt = 0;

function getWindowStart(windowMs: number, nowMs: number): Date {
  return new Date(Math.floor(nowMs / windowMs) * windowMs);
}

function toRetryAfterSeconds(windowMs: number, nowMs: number): number {
  const remainder = windowMs - (nowMs % windowMs);
  return Math.max(1, Math.ceil(remainder / 1000));
}

async function pruneExpiredRateLimitBuckets(nowMs: number) {
  if (nowMs - lastRateLimitPruneAt < RATE_LIMIT_PRUNE_INTERVAL_MS) {
    return;
  }

  lastRateLimitPruneAt = nowMs;
  const cutoff = new Date(nowMs - RATE_LIMIT_BUCKET_RETENTION_MS);

  await db.execute(sql`
    delete from "request_rate_limits"
    where "updated_at" < ${cutoff}
  `);
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  const cfIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cfIp) return cfIp;

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  return "unknown";
}

export async function consumeRateLimit(
  options: Omit<RateLimitOptions, "errorMessage">,
): Promise<RateLimitResult> {
  const nowMs = Date.now();
  await pruneExpiredRateLimitBuckets(nowMs);

  const windowStart = getWindowStart(options.windowMs, nowMs);
  const result = await db.execute(sql`
    insert into "request_rate_limits" ("scope", "identifier", "window_start", "count")
    values (${options.scope}, ${options.identifier}, ${windowStart}, 1)
    on conflict ("scope", "identifier", "window_start")
    do update
      set "count" = "request_rate_limits"."count" + 1,
          "updated_at" = now()
    returning "count"
  `);

  const count = Number((result.rows[0] as { count?: number | string } | undefined)?.count ?? 0);
  const remaining = Math.max(0, options.limit - count);

  return {
    allowed: count <= options.limit,
    limit: options.limit,
    remaining,
    retryAfterSeconds: toRetryAfterSeconds(options.windowMs, nowMs),
  };
}

export async function enforceRateLimit(options: RateLimitOptions): Promise<NextResponse | null> {
  const result = await consumeRateLimit(options);

  if (result.allowed) {
    return null;
  }

  return NextResponse.json(
    { error: options.errorMessage },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSeconds),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": String(result.remaining),
      },
    },
  );
}
