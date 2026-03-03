import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { isAdminEmail } from "@/lib/admin";
import { detectLocaleFromRequest } from "@/lib/locale";
import { requireEnv } from "@/lib/env";

const betterAuthUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

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
  trustedOrigins(request) {
    const origin = request?.headers.get("origin");
    const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined;
    return [betterAuthUrl, process.env.NEXT_PUBLIC_BETTER_AUTH_URL, origin, vercelUrl];
  },
  plugins: [nextCookies()],
});

export default auth;
