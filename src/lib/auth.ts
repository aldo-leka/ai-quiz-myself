import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { isAdminEmail } from "@/lib/admin";
import { STARTER_CREDITS_CENTS } from "@/lib/billing";
import { detectLocaleFromRequest } from "@/lib/locale";
import { requireEnv } from "@/lib/env";

const betterAuthUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const localhostHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

function resolveLocalCookiePrefix() {
  try {
    const url = new URL(betterAuthUrl);
    if (!localhostHosts.has(url.hostname)) {
      return undefined;
    }

    const host = url.hostname.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
    const port = url.port || (url.protocol === "https:" ? "443" : "80");
    return `ai-quiz-myself-${host}-${port}`;
  } catch {
    return undefined;
  }
}

const localCookiePrefix = resolveLocalCookiePrefix();

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: false,
  },
  socialProviders:
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          },
        }
      : undefined,
  user: {
    additionalFields: {
      avatarUrl: {
        type: "string",
        required: false,
      },
      isAdmin: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
      },
      locale: {
        type: "string",
        required: false,
        defaultValue: "en-US",
      },
      preferredProvider: {
        type: "string",
        required: false,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        async before(userRecord, context) {
          const email = typeof userRecord.email === "string" ? userRecord.email : "";
          const image = typeof userRecord.image === "string" ? userRecord.image : null;

          return {
            data: {
              isAdmin: isAdminEmail(email),
              locale: detectLocaleFromRequest(context?.request),
              avatarUrl: image,
            },
          };
        },
        async after(userRecord) {
          if (!userRecord.id) return;

          const [updatedUser] = await db
            .update(schema.user)
            .set({
              starterCreditsGranted: true,
            })
            .where(
              sql`${schema.user.id} = ${userRecord.id} and ${schema.user.starterCreditsGranted} = false`,
            )
            .returning({ id: schema.user.id });

          if (!updatedUser) {
            return;
          }

          await db
            .insert(schema.credits)
            .values({
              userId: userRecord.id,
              balanceCents: STARTER_CREDITS_CENTS,
            })
            .onConflictDoUpdate({
              target: schema.credits.userId,
              set: {
                balanceCents: sql`${schema.credits.balanceCents} + ${STARTER_CREDITS_CENTS}`,
              },
            });

          await db.insert(schema.creditTransactions).values({
            userId: userRecord.id,
            amountCents: STARTER_CREDITS_CENTS,
            currency: "usd",
            type: "starter_bonus",
            status: "completed",
            description: "Starter credits",
            metadata: {
              reason: "signup_bonus",
            },
          });
        },
      },
      update: {
        async before(userRecord) {
          const email = typeof userRecord.email === "string" ? userRecord.email : null;
          if (!email) return;

          return {
            data: {
              isAdmin: isAdminEmail(email),
            },
          };
        },
      },
    },
  },
  secret: requireEnv("BETTER_AUTH_SECRET"),
  baseURL: betterAuthUrl,
  ...(localCookiePrefix
    ? {
        advanced: {
          cookiePrefix: localCookiePrefix,
        },
      }
    : {}),
  trustedOrigins(request) {
    const origin = request?.headers.get("origin");
    const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined;
    return [betterAuthUrl, process.env.NEXT_PUBLIC_BETTER_AUTH_URL, origin, vercelUrl];
  },
  plugins: [nextCookies()],
});

export default auth;
