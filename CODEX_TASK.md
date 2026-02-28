# Task: Port WWTBAM Game to Monorepo

Port the "Who Wants to Be a Millionaire" quiz game from the old `client/` + `server/` directories into the new Next.js App Router monorepo at `src/`. The monorepo already has: Drizzle ORM + Neon, better-auth, shadcn/ui components, Trigger.dev, Sentry, PostHog.

## What exists now

**Old code to port FROM (read-only reference, do NOT modify):**
- `client/app/wwtbam/page.tsx` — main WWTBAM game page (single player)
- `client/hooks/useQuizGame.ts` — game state management hook
- `client/hooks/useHostCommunication.ts` — AI host API communication
- `client/hooks/useGameIntro.ts` — intro animation hook
- `client/components/AnimatedText.tsx` — typewriter text with cue system (|||slow|||, |||fast|||, |||reveal|||, etc.)
- `client/components/Button.tsx` — custom button with selected/correct/orange states
- `client/components/CircularButton.tsx` — circular action button
- `client/components/LoadingScreen.tsx` — loading with random quiz messages
- `client/components/quiz/*` — Question, Explanation, Header, Intro, Leaderboard, WaitingScreen, Timer
- `client/lib/constants.ts` — MONEY_LADDER, CHECKPOINTS, messages, country data, timing constants
- `client/lib/types.ts` — TypeScript interfaces
- `client/context/GameContext.tsx` — game context provider
- `server/api.js` — Express routes: `/host` (AI host via Gemini), `/generate-quiz` (fetch from DB), `/batch-generate-quizzes` (AI generation)

**New monorepo (where to port TO):**
- `src/app/` — Next.js App Router pages
- `src/components/ui/` — full shadcn/ui component library already installed
- `src/db/schema/auth.ts` — better-auth schema (user, session, account, verification tables)
- `src/db/schema/index.ts` — exports auth schema
- `src/db/index.ts` — Drizzle client with Neon
- `src/lib/auth.ts` — better-auth config
- `src/lib/auth-client.ts` — auth client
- `src/trigger/example.ts` — example Trigger.dev job
- DB: Neon Postgres via `@neondatabase/serverless` + `drizzle-orm`
- UI: shadcn/ui + Tailwind + Radix + lucide-icons (all installed)

## What to build

### 1. Database Schema (`src/db/schema/quiz.ts`)

Add quiz-related tables to Drizzle schema. Export from `src/db/schema/index.ts`.

```typescript
// Tables needed:
quizzes {
  id: uuid PK
  creatorId: text, nullable, FK -> user.id
  title: text
  theme: text
  language: text, default 'en'
  difficulty: enum('easy', 'medium', 'hard', 'mixed', 'escalating')
  gameMode: enum('single', 'wwtbam', 'couch_coop')
  questionCount: integer
  sourceType: enum('ai_generated', 'pdf', 'url', 'manual')
  isHub: boolean, default false
  playCount: integer, default 0
  likes: integer, default 0
  dislikes: integer, default 0
  createdAt, updatedAt
}

questions {
  id: uuid PK
  quizId: uuid FK -> quizzes.id (cascade delete)
  position: integer
  questionText: text
  imageUrl: text, nullable
  options: jsonb  // [{text: string, explanation: string}]
  correctOptionIndex: integer
  difficulty: enum('easy', 'medium', 'hard')
  subject: text, nullable
  createdAt
}

quizSessions {
  id: uuid PK
  quizId: uuid FK -> quizzes.id
  userId: text, nullable, FK -> user.id
  gameMode: enum('single', 'wwtbam', 'couch_coop')
  players: jsonb, nullable  // [{name, isOwner}]
  score: integer, default 0
  startedAt: timestamp
  finishedAt: timestamp, nullable
}

quizSessionAnswers {
  id: uuid PK
  sessionId: uuid FK -> quizSessions.id (cascade delete)
  questionId: uuid FK -> questions.id
  playerName: text, nullable  // for couch coop
  selectedOptionIndex: integer, nullable  // null = timeout
  isCorrect: boolean
  timeTakenMs: integer
  createdAt
}
```

Add proper indexes and relations. Run `drizzle-kit generate` after.

### 2. API Routes

**`src/app/api/quiz/[quizId]/route.ts`** — GET: fetch a quiz with its questions by ID. Public (no auth required).

**`src/app/api/quiz/random/route.ts`** — GET: fetch a random hub quiz. Accepts query params: `?mode=wwtbam&exclude=id1,id2`. Public.

**`src/app/api/quiz/host/route.ts`** — POST: AI host communication. Port the logic from `server/api.js` `/host` endpoint. For now, keep Gemini (use `@google/genai`). Accept `actionType`, `currentSetting`, `action`, `additionalData`, `history` in the body. Keep the existing SCENE_PROMPTS (FINAL_ANSWER_CONFIRM, LIFELINE_ASK_HOST). Add `GOOGLE_AI_API_KEY` to env. Return `{ response: string }`.

### 3. Game Components (port to `src/`)

Port these components, adapting them to use shadcn/ui where appropriate:

**`src/lib/quiz-constants.ts`** — Port MONEY_LADDER, CHECKPOINTS, QUESTION_LENGTH, LOADING_ACTIONS, WELCOME_MESSAGES, NEXT_QUESTION_MESSAGES, LIFELINE_5050_MESSAGES, ANIMATED_TEXT_SPEED/PAUSE constants from `client/lib/constants.ts`. Do NOT port the countries record (not needed for WWTBAM).

**`src/lib/quiz-types.ts`** — Port SingleGameQuestion and other relevant types. Adapt to match the new DB schema (options are now `{text, explanation}` objects instead of separate arrays).

**`src/components/quiz/AnimatedText.tsx`** — Port directly from `client/components/AnimatedText.tsx`. This is custom and does not map to a shadcn component. Keep the cue system (|||slow|||, |||medium|||, |||reveal|||, |||option:X|||).

**`src/components/quiz/GameButton.tsx`** — Port from `client/components/Button.tsx`. This needs the selected/correct/orange/disabled states for answer buttons. Use `cva` (class-variance-authority) for variants.

**`src/components/quiz/CircularButton.tsx`** — Port from `client/components/CircularButton.tsx`.

**`src/components/quiz/LoadingScreen.tsx`** — Port from `client/components/LoadingScreen.tsx`. Use LOADING_ACTIONS for random messages.

**`src/hooks/useHostCommunication.ts`** — Port from `client/hooks/useHostCommunication.ts`. Change the fetch URL from `${process.env.NEXT_PUBLIC_SERVER_URL}/api/host` to `/api/quiz/host`.

**`src/hooks/useGameIntro.ts`** — Port from `client/hooks/useGameIntro.ts`.

### 4. Game Page (`src/app/play/[quizId]/page.tsx`)

Create the WWTBAM game page. Port the game logic from `client/app/wwtbam/page.tsx` but with these changes:

- **Data fetching:** Instead of fetching from Express server, fetch from `/api/quiz/[quizId]` to get the quiz and its questions.
- **Question format:** Adapt to new schema. Options are `{text, explanation}` objects. `correctOptionIndex` is an integer (not matching text).
- **No localStorage for quiz tracking.** If user is logged in (check via better-auth client), save the session to DB on completion via a POST to a new endpoint `src/app/api/quiz/session/route.ts`.
- **Anonymous play works fine.** Just don't persist the session.
- **Keep all existing gameplay:** money ladder, checkpoints, timer, lifelines (50:50, Ask the Host), AI host commentary via AnimatedText, cash out, game over screen.

Also create a simple entry page:

**`src/app/page.tsx`** — Replace the current boilerplate. Show:
- "QuizPlus" title
- "Play a random quiz" button -> fetches `/api/quiz/random?mode=wwtbam` then redirects to `/play/[quizId]`
- Simple, TV-friendly (large text, large buttons, dark theme)

### 5. Seed Script (`src/db/seed.ts`)

Create a seed script that generates 3 sample WWTBAM quizzes using the Gemini AI (same prompt from `server/api.js` `generateSingleQuiz()`). Store them with `isHub: true`, `gameMode: 'wwtbam'`, `difficulty: 'escalating'`. Map the generated JSON to the new schema format (options as `{text, explanation}` objects).

Add script to package.json: `"db:seed": "npx tsx src/db/seed.ts"`

### 6. Install missing dependency

Add `@google/genai` to dependencies (for the AI host and seed script).

## TV-Friendly Design Principles (apply throughout)

- All interactive elements navigable with arrow keys + Enter
- Minimum touch target: 64px
- Large text: min 18px body, 24px+ headings
- High contrast
- No hover-dependent interactions
- Visible focus states (thick ring/border)
- Dark theme preferred (easier on TV in living room)

## Important constraints

- Do NOT delete or modify anything in `client/` or `server/` directories
- Do NOT touch `src/db/schema/auth.ts` (better-auth manages this)
- Use existing shadcn/ui components from `src/components/ui/` where they fit
- All new quiz components go in `src/components/quiz/`
- All new hooks go in `src/hooks/`
- All new API routes go in `src/app/api/quiz/`
- Use the existing Drizzle client from `src/db/index.ts`
- Keep the same gameplay feel and flow as the original WWTBAM
