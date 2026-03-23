import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { requireEnv } from "@/lib/env";
import * as schema from "@/db/schema";

declare global {
  // eslint-disable-next-line no-var
  var __aiQuizPgPool: Pool | undefined;
}

const connectionString = requireEnv("DATABASE_URL");

const pool =
  global.__aiQuizPgPool ??
  new Pool({
    connectionString,
    max: process.env.NODE_ENV === "production" ? 20 : 5,
  });

if (process.env.NODE_ENV !== "production") {
  global.__aiQuizPgPool = pool;
}

export const db = drizzle({ client: pool, schema });
