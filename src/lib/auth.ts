import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { createTransport } from "nodemailer";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { isAdminEmail } from "@/lib/admin";
import { detectLocaleFromRequest } from "@/lib/locale";
import { requireEnv } from "@/lib/env";

function createMagicLinkEmailHtml({
  appName,
  email,
  url,
}: {
  appName: string;
  email: string;
  url: string;
}) {
  return `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:12px;padding:28px;border:1px solid #e5e7eb;">
            <tr>
              <td style="color:#0f172a;font-size:22px;font-weight:700;padding-bottom:8px;">Sign in to ${appName}</td>
            </tr>
            <tr>
              <td style="color:#334155;font-size:15px;line-height:22px;padding-bottom:20px;">
                We received a sign-in request for <strong>${email}</strong>.
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:24px;">
                <a href="${url}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 18px;border-radius:10px;">Continue to ${appName}</a>
              </td>
            </tr>
            <tr>
              <td style="color:#64748b;font-size:13px;line-height:20px;padding-bottom:8px;">
                This link expires in 5 minutes. If you didn’t request this, you can ignore this email.
              </td>
            </tr>
            <tr>
              <td style="color:#94a3b8;font-size:12px;line-height:18px;word-break:break-all;">
                ${url}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function getMailTransporter() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !port || !user || !pass) {
    throw new Error("Missing SMTP env vars. Required: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS");
  }

  const smtpPort = Number(port);
  const secure = process.env.SMTP_SECURE === "true" || smtpPort === 465;

  return createTransport({
    host,
    port: smtpPort,
    secure,
    auth: {
      user,
      pass,
    },
  });
}

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
  plugins: [
    nextCookies(),
    magicLink({
      expiresIn: 60 * 5,
      async sendMagicLink({ email, url }) {
        const from = process.env.SMTP_FROM;
        if (!from) {
          throw new Error("Missing SMTP_FROM");
        }

        const transporter = getMailTransporter();
        await transporter.sendMail({
          from,
          to: email,
          subject: "Your sign-in link for QuizPlus",
          html: createMagicLinkEmailHtml({
            appName: "QuizPlus",
            email,
            url,
          }),
        });
      },
    }),
  ],
});

export default auth;
