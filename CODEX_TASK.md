# Task: Port WWTBAM to Monorepo (Phase 1)

## Context

This is a quiz game platform (quizplus.io). We're porting the "Who Wants to Be a Millionaire" mode from the old `client/` + `server/` directories into the new Next.js App Router monorepo at `src/`.

The monorepo already has: Drizzle ORM + Neon, better-auth (with user/session/account/verification tables in `src/db/schema/auth.ts`), shadcn/ui, Trigger.dev, Sentry, PostHog.

**Old code in `client/` and `server/` is reference only. Do NOT modify it. Read it to understand the game flow.**

Key old files to study:
- `client/app/wwtbam/page.tsx` — full WWTBAM game page
- `client/hooks/useHostCommunication.ts` — AI host API calls
- `client/components/AnimatedText.tsx` — typewriter text with cue system (|||slow|||, |||medium|||, etc.)
- `client/components/Button.tsx` — answer buttons with selected/correct/orange states
- `client/lib/constants.ts` — money ladder, checkpoints, host messages, timing
- `client/lib/types.ts` — TypeScript interfaces
- `server/api.js` — Express routes for AI host + quiz generation (Gemini prompts)

## Step 1: Database Schema

Add quiz tables to `src/db/schema/quiz.ts`. Export from `src/db/schema/index.ts`.

**Important:** The `user` table already exists from better-auth at `src/db/schema/auth.ts`. All FKs to users should reference that table's `id` (text type, not uuid).

Tables needed for WWTBAM (keep it lean, we'll add more tables later):

**quizzes** — id (uuid), creatorId (text, nullable, FK -> user.id), title, theme, language (default 'en'), difficulty (enum: easy/medium/hard/mixed/escalating), gameMode (enum: single/wwtbam/couch_coop), questionCount (int), sourceType (enum: ai_generated/pdf/url/manual), isHub (boolean), playCount (int, default 0), likes (int, default 0), dislikes (int, default 0), createdAt, updatedAt

**questions** — id (uuid), quizId (FK -> quizzes, cascade), position (int), questionText (text), imageUrl (text, nullable), options (jsonb: [{text, explanation}]), correctOptionIndex (int), difficulty (enum), subject (text, nullable), createdAt

**apiKeys** — id (uuid), userId (FK -> user.id, cascade), provider (enum: openai/anthropic/google), encryptedKey (text), label (text, nullable), createdAt. Unique index on userId + provider.

**quizSessions** — id (uuid), quizId (FK -> quizzes), userId (text, nullable, FK -> user.id), gameMode (enum), score (int, default 0), startedAt, finishedAt (nullable)

**quizSessionAnswers** — id (uuid), sessionId (FK -> quizSessions, cascade), questionId (FK -> questions), selectedOptionIndex (int, nullable for timeout), isCorrect (boolean), timeTakenMs (int), createdAt

Add relations and sensible indexes. Run `drizzle-kit generate` after.

## Step 2: Port WWTBAM Game

### AI Host — Use Vercel AI SDK with streaming

Use `ai` package (https://ai-sdk.dev) for the AI host. This is critical for the game show feel.

**Install:** `ai` + `@ai-sdk/openai` + `@ai-sdk/anthropic` + `@ai-sdk/google`

**How it works:**
- When a logged-in user has saved an API key, use THEIR key + provider for the AI host
- For hub quizzes played by anonymous users (or users without a key): skip AI host, use the fallback static messages (already exist in old code: WELCOME_MESSAGES, NEXT_QUESTION_MESSAGES, etc.)
- The AI host response should be STREAMED to the client so the AnimatedText component can start rendering immediately

**API route: `src/app/api/quiz/host/route.ts`**
- POST endpoint
- Accept: actionType, currentSetting, action, additionalData, history, provider, apiKey (encrypted, decrypt server-side)
- Use `streamText()` from the AI SDK
- Return a streaming response

**System prompts:**
- Study the existing prompts in `server/api.js` (SCENE_PROMPTS) as examples of the tone and structure
- But write NEW, improved prompts. The host should be dramatic, educational, entertaining — a proper game show host.
- Action types: WELCOME, BEGIN_QUESTION, FINAL_ANSWER_CONFIRM, LIFELINE_ASK_HOST, LIFELINE_5050
- Include the cue markers in the prompt instructions so the AI outputs them: |||slow|||, |||medium|||, |||fast|||, |||reveal|||, |||option:A/B/C/D|||

**Client hook: `src/hooks/useHostCommunication.ts`**
- Use `useChat` or manual fetch with streaming from the AI SDK client helpers
- Feed streamed text into the AnimatedText component

### Game Components

Port to `src/components/quiz/`, using shadcn/ui where it makes sense:

- **AnimatedText.tsx** — Port from `client/components/AnimatedText.tsx`. Keep the cue parsing system (|||slow|||, |||medium|||, |||reveal|||, |||option:X|||). This is custom, doesn't map to shadcn.
- **GameButton.tsx** — Port from `client/components/Button.tsx`. Needs selected/correct/orange/disabled states. Use `cva` for variants.
- **CircularButton.tsx** — Port from `client/components/CircularButton.tsx`.
- **LoadingScreen.tsx** — Port from `client/components/LoadingScreen.tsx`.

### Game Constants

**`src/lib/quiz-constants.ts`** — Port from `client/lib/constants.ts`:
- MONEY_LADDER, CHECKPOINTS, QUESTION_LENGTH
- LOADING_ACTIONS
- WELCOME_MESSAGES, NEXT_QUESTION_MESSAGES, LIFELINE_5050_MESSAGES (used as fallback when no AI host)
- ANIMATED_TEXT_SPEED and pause constants

Do NOT port the countries record.

### Game Page: `src/app/play/[quizId]/page.tsx`

Port the game logic from `client/app/wwtbam/page.tsx` with these changes:

- Fetch quiz data from a server action or API route (not Express)
- Questions use new schema format: options are `{text, explanation}` objects, correct answer is `correctOptionIndex`
- AI host uses streaming via AI SDK (see above). Falls back to static messages if no API key.
- If user is logged in: save quiz session + answers to DB on completion
- If anonymous: game works fine, just don't persist
- Keep ALL gameplay: money ladder, checkpoints, timer (60s), lifelines (50:50, Ask the Host), cash out, game over

### API Routes

**`src/app/api/quiz/[quizId]/route.ts`** — GET: fetch quiz with questions. Public.

**`src/app/api/quiz/random/route.ts`** — GET: random hub quiz. Accepts `?mode=wwtbam&exclude=id1,id2`. Public.

**`src/app/api/quiz/host/route.ts`** — POST: streaming AI host (see above).

**`src/app/api/quiz/session/route.ts`** — POST: save completed quiz session. Auth required.

### Landing Page: `src/app/page.tsx`

Replace the boilerplate. Simple and TV-friendly:
- "QuizPlus" title
- "Play a Random Quiz" button → fetch random WWTBAM quiz → redirect to `/play/[quizId]`
- Dark theme, large text, large buttons

## Step 3: Seed Script

**`src/db/seed.ts`** — Generate 3 WWTBAM quizzes using Google Gemini (`@ai-sdk/google`).

Use a generation prompt similar to the one in `server/api.js` `generateSingleQuiz()` but improved. 14 questions, escalating difficulty, varied subjects, educational explanations.

Store with `isHub: true`, `gameMode: 'wwtbam'`, `difficulty: 'escalating'`. Map to new schema format.

Add to package.json: `"db:seed": "npx tsx src/db/seed.ts"`

## TV-Friendly Design (apply everywhere)

- Arrow key + Enter navigation (TV remote compatible)
- Min touch target: 64px
- Large text: 18px+ body, 24px+ headings
- High contrast, dark theme
- No hover-dependent interactions
- Visible focus states (thick ring/outline)

## Constraints

- Do NOT modify `client/` or `server/` directories
- Do NOT touch `src/db/schema/auth.ts`
- Use existing shadcn/ui components from `src/components/ui/`
- New quiz components in `src/components/quiz/`
- New hooks in `src/hooks/`
- New API routes in `src/app/api/quiz/`
- Use existing Drizzle client from `src/db/index.ts`
