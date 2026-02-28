import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { requireEnv } from "@/lib/env";
import { getPostHogClient } from "@/lib/posthog-server";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  secret: requireEnv("BETTER_AUTH_SECRET"),
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  trustedOrigins: [process.env.BETTER_AUTH_URL ?? "http://localhost:3000"],
  plugins: [nextCookies()],
  hooks: {
    after: [
      {
        matcher(context) {
          return context.path === "/sign-up/email";
        },
        async handler(context) {
          const body = context.body as { email?: string; name?: string } | undefined;
          const email = body?.email;
          if (email && context.response?.status === 200) {
            const posthog = getPostHogClient();
            posthog.capture({
              distinctId: email,
              event: "user_signed_up",
              properties: {
                email,
                name: body?.name,
                source: "email_password",
              },
            });
            posthog.identify({
              distinctId: email,
              properties: {
                email,
                name: body?.name,
                createdAt: new Date().toISOString(),
              },
            });
            await posthog.flush();
          }
        },
      },
      {
        matcher(context) {
          return context.path === "/sign-in/email";
        },
        async handler(context) {
          const body = context.body as { email?: string } | undefined;
          const email = body?.email;
          if (email && context.response?.status === 200) {
            const posthog = getPostHogClient();
            posthog.capture({
              distinctId: email,
              event: "user_logged_in",
              properties: {
                email,
                source: "email_password",
              },
            });
            await posthog.flush();
          }
        },
      },
      {
        matcher(context) {
          return context.path === "/sign-out";
        },
        async handler(context) {
          const session = context.context?.session as { user?: { email?: string } } | undefined;
          const email = session?.user?.email;
          if (email) {
            const posthog = getPostHogClient();
            posthog.capture({
              distinctId: email,
              event: "user_logged_out",
              properties: {
                email,
              },
            });
            await posthog.flush();
          }
        },
      },
    ],
  },
});

export default auth;
