# QuizPlus

QuizPlus is a Next.js 16 quiz platform with:

- a public hub of curated quizzes
- three game modes: `single`, `wwtbam`, and `couch_coop`
- user dashboards for quiz generation, API keys, billing, history, and settings
- an admin area for moderation, quiz inspection, pricing, and platform API keys
- background quiz generation and review workflows powered by Trigger.dev

The app supports both bring-your-own-key generation and platform-managed credit billing.

## Stack

- Next.js 16 App Router
- React 19
- Tailwind CSS 4
- shadcn/ui + Radix UI primitives
- Drizzle ORM + Neon Postgres
- pgvector for quiz/theme embeddings
- better-auth for authentication
- Trigger.dev for background jobs and schedules
- Stripe for wallet top-ups and auto-recharge
- Cloudflare R2 for large PDF uploads
- Vercel AI SDK with OpenAI, Anthropic, and Google providers

## Core Product Areas

### Public hub

- Browse hub quizzes by mode, popular themes, difficulty, and sort order
- Launch a random matching quiz with `Surprise Me`
- Vote on quizzes
- Play quizzes without logging in

### Game modes

- `Single Player`
- `Who Wants to Be a Millionaire` (`WWTBAM`)
- `Couch Co-op`

### User dashboard

- Overview
- My Quizzes
- Create Quiz
- API Keys
- Billing
- History
- Settings

### Admin dashboard

- Analytics overview
- Quiz inspection and editing
- Moderation
- Pricing and platform settings
- Admin API key management

## How quiz generation works

QuizPlus supports three generation sources:

1. `Theme`
2. `URL`
3. `PDF`

### Theme and URL generation

- Can run with the user's own API key (`BYOK`)
- Can also run in platform credits mode if the platform OpenAI key is configured
- Generated quizzes are saved to the user's personal library

### PDF generation

- Uses platform credits mode
- Uses the platform OpenAI key
- Supports direct upload fallback for smaller files
- Supports large-file upload through Cloudflare R2 with async download in Trigger jobs
- Falls back to OCR when direct PDF text extraction is weak or unavailable

### Hub publication model

User-generated quizzes do not become live hub content directly.

Current flow:

1. A personal quiz is created in `quizzes`
2. If the quiz is eligible for hub review, an immutable snapshot is stored in `hub_candidates`
3. A separate Trigger task reviews the candidate
4. If approved, a separate published hub quiz is created in `quizzes`

This keeps personal editable content isolated from public hub content.

## Repository layout

```text
src/
  app/
    admin/        Admin UI
    dashboard/    User dashboard UI
    play/         Quiz play pages
    api/          Route handlers
  components/
    admin/        Admin-specific components
    dashboard/    Dashboard-specific components
    quiz/         Shared quiz gameplay and hub UI
    ui/           shadcn/ui components
  db/
    schema/       Drizzle schema
    seed-*.ts     Seed scripts
  lib/
    auth.ts               better-auth config
    stripe.ts             Stripe helpers
    r2.ts                 Cloudflare R2 helpers
    quiz-generation.ts    prompt construction + AI generation
    pdf-extraction.ts     PDF parsing + OCR fallback
    quiz-embeddings.ts    pgvector embedding helpers
    hub-candidates.ts     hub candidate snapshot publishing logic
  trigger/
    generate-quiz.ts
    review-hub-candidates.ts
    auto-recharge-wallet.ts
```

## Local development

### Prerequisites

- Node.js current LTS
- npm
- a Postgres database with pgvector enabled
- optional but commonly needed:
  - Trigger.dev project
  - Google OAuth credentials
  - OpenAI API key
  - Stripe account
  - Cloudflare R2 bucket

### 1. Install dependencies

```bash
npm install
```

### 2. Create your environment file

Copy `.env.example` to `.env` and fill in the values you actually need.

```bash
copy .env.example .env
```

On macOS/Linux:

```bash
cp .env.example .env
```

### 3. Push the schema

```bash
npm run db:push
```

There are Drizzle SQL migrations in `drizzle/`, but the repo's primary local workflow currently uses `drizzle-kit push`.

### 4. Seed some quizzes

```bash
npm run db:seed:single
npm run db:seed:wwtbam
npm run db:seed:couch
```

### 5. Start the app

Terminal 1:

```bash
npm run dev
```

Terminal 2:

```bash
npm run trigger:dev
```

If you do not run `trigger:dev` locally, Trigger-powered generation and scheduled tasks will not execute locally unless you point the app at a deployed Trigger production environment.

## Environment variables

Use `.env.example` as the source of truth. The sections below explain what each group is for.

### Core app

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Neon/Postgres connection string |
| `BETTER_AUTH_SECRET` | Yes | better-auth signing secret |
| `BETTER_AUTH_URL` | Yes | Server auth base URL |
| `NEXT_PUBLIC_BETTER_AUTH_URL` | Yes | Client auth base URL |
| `ADMIN_EMAILS` | Yes for admin access | Comma-separated admin allowlist |

### Google auth

Google sign-in is the only enabled auth provider right now.

| Variable | Required | Purpose |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | Yes for sign-in | Google OAuth client id |
| `GOOGLE_CLIENT_SECRET` | Yes for sign-in | Google OAuth client secret |

### AI models and API key encryption

| Variable | Required | Purpose |
| --- | --- | --- |
| `API_KEY_ENCRYPTION_SECRET` | Yes if storing user/admin API keys | Encrypts provider keys at rest |
| `OPENAI_MODEL` | Recommended | Default OpenAI generation model |
| `ANTHROPIC_MODEL` | Recommended | Default Anthropic generation model |
| `GOOGLE_MODEL` | Recommended | Default Google generation model |
| `HOST_OPENAI_MODEL` | Optional override | WWTBAM/host-specific OpenAI model |
| `HOST_ANTHROPIC_MODEL` | Optional override | WWTBAM/host-specific Anthropic model |
| `HOST_GOOGLE_MODEL` | Optional override | WWTBAM/host-specific Google model |
| `OPENAI_API_KEY` | Required for platform billing, PDF OCR, hub review | Platform OpenAI key |
| `OPENAI_OCR_MODEL` | Recommended | OCR model for PDF fallback |

### Trigger.dev

| Variable | Required | Purpose |
| --- | --- | --- |
| `TRIGGER_SECRET_KEY` | Yes if your app should trigger Trigger jobs | Authenticates app -> Trigger API calls |

Important: Trigger task runtime env vars are configured in Trigger itself. They do not automatically inherit your local `.env` or your Vercel env vars.

### Stripe

| Variable | Required | Purpose |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | Yes for billing | Stripe server API |
| `STRIPE_PUBLISHABLE_KEY` | Yes for billing UI | Stripe client integration |
| `STRIPE_WEBHOOK_SECRET` | Yes for webhook processing | Verifies `/api/webhooks/stripe` |
| `STRIPE_DEFAULT_CURRENCY` | Recommended | Defaults to `eur` unless set to `usd` |

### Cloudflare R2

Required for large async PDF uploads. Without R2, PDF generation falls back to a smaller direct-upload path.

| Variable | Required | Purpose |
| --- | --- | --- |
| `R2_ENDPOINT` | Yes for R2 uploads | S3-compatible endpoint |
| `R2_REGION` | Optional | Defaults to `auto` |
| `R2_BUCKET` | Yes for R2 uploads | Bucket name |
| `R2_ACCESS_KEY_ID` | Yes for R2 uploads | S3-compatible access key |
| `R2_SECRET_ACCESS_KEY` | Yes for R2 uploads | S3-compatible secret |
| `R2_PUBLIC_URL` | Optional | Reserved if you later expose public objects |
| `CLOUDFLARE_API_TOKEN` | Optional currently | Not required by the current runtime upload path |

### Email

| Variable | Required | Purpose |
| --- | --- | --- |
| `SMTP_HOST` | Optional | SMTP host |
| `SMTP_PORT` | Optional | SMTP port |
| `SMTP_SECURE` | Optional | SMTP TLS setting |
| `SMTP_USER` | Optional | SMTP username |
| `SMTP_PASS` | Optional | SMTP password |
| `SMTP_FROM` | Optional | Default from address |

### Analytics and monitoring

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_POSTHOG_KEY` | Optional | PostHog client key |
| `NEXT_PUBLIC_POSTHOG_HOST` | Optional | PostHog host |
| `SENTRY_AUTH_TOKEN` | Optional | Sentry release/auth tooling |

### Local tunnel helper

`npm run ngrok:dev` uses:

| Variable | Required | Purpose |
| --- | --- | --- |
| `NGROK_URL` | Yes for script | Reserved ngrok URL or hostname |
| `NGROK_AUTHTOKEN` | Optional | ngrok auth token |

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start Next.js locally |
| `npm run build` | Production build |
| `npm run start` | Start built app |
| `npm run lint` | Run ESLint |
| `npm run db:generate` | Generate Drizzle migration files |
| `npm run db:push` | Push schema changes to the database |
| `npm run db:seed:single` | Seed single-player quizzes |
| `npm run db:seed:wwtbam` | Seed WWTBAM quizzes |
| `npm run db:seed:couch` | Seed couch co-op quizzes |
| `npm run trigger:dev` | Run local Trigger worker |
| `npm run ngrok:dev` | Start ngrok using `.env` values |

## Authentication and authorization

- Authentication uses `better-auth`
- Email/password auth is disabled
- Google OAuth is enabled when Google credentials are configured
- Admin access is based on `ADMIN_EMAILS`
- The user record also persists `isAdmin`, `locale`, `preferredProvider`, Stripe ids, and starter-credit state

On signup:

- the app auto-detects locale
- marks `isAdmin` based on email allowlist
- grants starter wallet credits once

## Billing model

The current billing system is cents-based, not floating "credits".

- Wallet balance is stored in `credits.balance_cents`
- Standard generation cost defaults to `$0.30`
- Starter bonus defaults to `$3.00`
- Manual top-ups run through Stripe Checkout
- Auto-recharge runs as a scheduled Trigger task and charges a saved payment method off-session

Generation billing modes:

- `byok`
  - User supplies their own provider key
  - No wallet charge
- `platform_credits`
  - Platform OpenAI key is used
  - Balance is reserved when generation starts
  - Charge is settled on success
  - Reserved balance is refunded on failure

Current product behavior:

- Theme and URL generation can use BYOK or platform credits
- PDF generation uses platform credits

## Trigger jobs

Current Trigger tasks live in `src/trigger`.

### `generate-quiz`

- Creates quizzes from theme, URL, or PDF
- Resolves provider credentials
- Extracts article text or PDF text
- Persists generated quizzes and questions
- Settles or refunds reserved billing
- Creates hub candidate snapshots when eligible

### `review-hub-candidate`

- Reviews immutable candidate snapshots
- Rejects unsafe, too niche, or duplicate content
- Generates embeddings
- Publishes approved hub quizzes as separate quiz rows

### `auto-recharge-wallet`

- Scheduled task
- Runs every minute
- Finds users below threshold
- Creates off-session Stripe payment intents

## Hub review and embeddings

The project uses pgvector for:

- quiz uniqueness checks
- surprise-theme history deduplication

Key tables:

- `quiz_embeddings`
- `surprise_theme_history`
- `hub_candidates`

Current hub review rules are implemented in background jobs, not in the request path.

## PDF generation notes

### File sizes

- without R2: smaller direct-upload fallback path, capped at 8 MB
- with R2: async upload/download path, capped at 100 MB

### R2 CORS

If you use direct browser upload to R2, configure bucket CORS to allow `PUT` from your frontend origin. The current upload path sends `Content-Type: application/pdf`.

### Extraction path

- native PDF text extraction first
- OCR fallback via OpenAI when needed

## Production deployment

### App

The app is designed to deploy to Vercel, but it is a standard Next.js app and can be deployed elsewhere.

### Trigger.dev

Trigger production requires two separate things:

1. Your app environment needs `TRIGGER_SECRET_KEY`
2. Your Trigger project needs deployed task code and its own runtime env vars

You can deploy Trigger tasks either:

- manually from your terminal
- via Trigger GitHub integration
- via GitHub Actions

Manual deploy:

```bash
npx trigger.dev@latest login
npx trigger.dev@latest deploy
```

GitHub integration is optional, but it is the cleanest setup if you want automatic production task deploys on push.

### Trigger production env vars

At minimum, mirror any task runtime secrets into Trigger production. Based on the current codebase that usually includes:

- `DATABASE_URL`
- `OPENAI_API_KEY`
- `R2_ENDPOINT`
- `R2_REGION`
- `R2_BUCKET`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `STRIPE_SECRET_KEY`
- any other generation/review/billing secrets used by task code

### Stripe webhook

Production webhook route:

```text
/api/webhooks/stripe
```

Relevant events currently handled:

- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `checkout.session.completed`

## Local webhook testing

You have two practical options:

1. Stripe CLI
2. ngrok + the included helper script

Example local tunnel:

```bash
npm run ngrok:dev
```

Then point Stripe webhooks to:

```text
https://your-ngrok-domain/api/webhooks/stripe
```

## Data model summary

Important tables:

- `user`
- `quizzes`
- `questions`
- `quiz_sessions`
- `quiz_session_answers`
- `quiz_generation_jobs`
- `api_keys`
- `hub_candidates`
- `quiz_embeddings`
- `surprise_theme_history`
- `credits`
- `credit_transactions`
- `auto_recharge_settings`
- `billing_webhook_events`
- `quiz_votes`
- `platform_settings`

## Operational notes

- `isPublic` exists on quizzes but is not currently the primary discovery control for the hub
- Hub discovery is based on `isHub`
- Older data migrations exist in `drizzle/`
- The project currently uses `db:push` for most day-to-day schema syncing

## Troubleshooting

### Quiz generation jobs never complete locally

Make sure both are running:

```bash
npm run dev
npm run trigger:dev
```

If you intentionally want jobs to run in Trigger production instead, make sure:

- the app is using a production `TRIGGER_SECRET_KEY`
- tasks have been deployed to Trigger production
- Trigger production env vars are set

### PDF uploads fail

Check:

- R2 credentials
- bucket CORS
- `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`

### Stripe top-ups fail

Check:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- webhook delivery to `/api/webhooks/stripe`

### Google login is missing

Check:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `BETTER_AUTH_URL`
- `NEXT_PUBLIC_BETTER_AUTH_URL`

## Current state of auth

- Google sign-in supported
- Email/password disabled
- Admin access controlled by email allowlist

## License

No license file is currently included in this repository.
