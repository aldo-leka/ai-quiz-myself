<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the **ai-quiz-myself** Next.js 16 App Router project. Here is a summary of all changes made:

## Changes made

### New files created
- **`src/lib/posthog-server.ts`** — Server-side PostHog client singleton using `posthog-node`. Configured with `flushAt: 1` and `flushInterval: 0` for immediate event flushing in serverless environments.

### Modified files
- **`src/instrumentation-client.ts`** — Added PostHog client-side initialization using `posthog-js`. PostHog is initialized via the recommended `instrumentation-client.ts` approach for Next.js 15.3+, using a reverse proxy (`/ingest`) for reliability. Error tracking (`capture_exceptions: true`) and debug mode in development are enabled.
- **`next.config.ts`** — Added PostHog reverse proxy rewrites (`/ingest/*` → EU PostHog servers) alongside the existing Sentry configuration. Also added `skipTrailingSlashRedirect: true` as required by PostHog.
- **`src/lib/auth.ts`** — Added Better-Auth `hooks.after` callbacks to fire server-side PostHog events on sign-up, sign-in, and sign-out. Users are identified in PostHog at sign-up with their email and name.
- **`src/app/global-error.tsx`** — Added `posthog.captureException(error)` alongside the existing `Sentry.captureException(error)` call for dual error tracking.

### Environment variables set
- `NEXT_PUBLIC_POSTHOG_KEY` — PostHog project API key (set in `.env.local`)
- `NEXT_PUBLIC_POSTHOG_HOST` — PostHog EU host (`https://eu.i.posthog.com`, set in `.env.local`)

### Packages installed
- `posthog-js` — Client-side analytics SDK
- `posthog-node` — Server-side analytics SDK

## Events instrumented

| Event name | Description | File |
|---|---|---|
| `user_signed_up` | Fired when a user successfully creates a new account via email/password | `src/lib/auth.ts` |
| `user_logged_in` | Fired when a user successfully logs in with email/password (server-side) | `src/lib/auth.ts` |
| `user_logged_out` | Fired when a user logs out (server-side) | `src/lib/auth.ts` |
| `$exception` | Unhandled exceptions captured automatically via `capture_exceptions: true` and `posthog.captureException()` | `src/instrumentation-client.ts`, `src/app/global-error.tsx` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- 📊 **Dashboard**: [Analytics basics](https://eu.posthog.com/project/133589/dashboard/545962)
- 📈 [New signups (daily)](https://eu.posthog.com/project/133589/insights/C6ISQnbP) — Daily count of new user signups
- 👥 [Daily active users (logins)](https://eu.posthog.com/project/133589/insights/GPaCdOO0) — Unique users logging in each day
- 🔽 [Signup → Login retention funnel](https://eu.posthog.com/project/133589/insights/s6XhqO3p) — Conversion from signup to first return login (early retention signal)
- 📉 [Signups vs. logouts (weekly churn signal)](https://eu.posthog.com/project/133589/insights/NPmS8gpk) — Weekly signups vs logouts to spot churn trends
- 🐛 [Unhandled errors (daily)](https://eu.posthog.com/project/133589/insights/bTifpZ8w) — Daily error volume tracked via PostHog error tracking

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/posthog-integration-nextjs-app-router/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
