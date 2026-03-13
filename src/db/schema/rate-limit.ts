import { index, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const requestRateLimits = pgTable(
  "request_rate_limits",
  {
    scope: text("scope").notNull(),
    identifier: text("identifier").notNull(),
    windowStart: timestamp("window_start").notNull(),
    count: integer("count").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    primaryKey({
      columns: [table.scope, table.identifier, table.windowStart],
      name: "request_rate_limits_pk",
    }),
    index("request_rate_limits_updated_at_idx").on(table.updatedAt),
  ],
);
