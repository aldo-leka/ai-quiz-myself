# Social Carousel Automation

This flow lets OpenClaw reserve a public quiz, review a generated carousel, write the copy, and then push it to Publer as either a draft, an immediate publish, or a scheduled post.

## What It Covers

- Public quizzes only
- `single` and `wwtbam` game modes
- Random eligible quiz selection with reservation tracking
- Preview-first workflow with review URLs
- Feed-sized images for Instagram/Facebook and portrait images for TikTok
- Posting history and low-inventory nudges stored in the app

## New Tables

- `social_pipelines`
- `social_posts`
- `social_post_attempts`

`social_posts` is the source of truth for selection state and publish history. Each quiz can only exist once per pipeline.

## Environment

Add these variables:

```bash
INTERNAL_SOCIAL_API_TOKEN=...
SOCIAL_RENDER_BASE_URL=https://quizplus.io

PUBLER_API_KEY=...
PUBLER_WORKSPACE_ID=...
PUBLER_INSTAGRAM_ACCOUNT_ID=...
PUBLER_FACEBOOK_ACCOUNT_ID=...
PUBLER_TIKTOK_ACCOUNT_ID=...
```

Notes:

- `INTERNAL_SOCIAL_API_TOKEN` lives on the VPS app.
- The OpenClaw runner reads `CRON_SECRET` and sends it as `Authorization: Bearer <token>`.
- Set `CRON_SECRET` to the same value as the VPS `INTERNAL_SOCIAL_API_TOKEN`.
- `SOCIAL_RENDER_BASE_URL` should point to the deployed app that serves the frame images.
- The Publer key must include at least `posts`, `workspaces`, `accounts`, and `media`.

## OpenClaw Flow

For the actual cron job, prefer the committed runner:

```bash
python3 scripts/openclaw_social_publish.py --audience us
python3 scripts/openclaw_social_publish.py --audience india
```

The runner opens the required password-based SSH tunnel, reserves one eligible quiz, writes default caption copy, and calls the publish endpoint with `publishMode: "publish"`. It does not store generated images on the OpenClaw machine.

Create `.env.openclaw` in the repo root on the OpenClaw machine. It is ignored by git.

```bash
QUIZPLUS_SOCIAL_BASE_URL=https://quizplus.io
QUIZPLUS_SOCIAL_SSH_HOST=<vps-tailscale-host-or-ip>
QUIZPLUS_SOCIAL_SSH_USER=<ssh-user>
QUIZPLUS_SOCIAL_SSH_PASSWORD=<ssh-password>
QUIZPLUS_SOCIAL_SSH_PORT=22
QUIZPLUS_SOCIAL_SSH_REMOTE_HOST=127.0.0.1
QUIZPLUS_SOCIAL_SSH_REMOTE_PORT=443
QUIZPLUS_SOCIAL_INSECURE_TLS=1
CRON_SECRET=<same value as INTERNAL_SOCIAL_API_TOKEN on the VPS>
QUIZPLUS_SOCIAL_PIPELINE_SLUG=organic_publer_main
```

If the Next app listens directly on the VPS at `127.0.0.1:3000`, use this pair instead:

```bash
QUIZPLUS_SOCIAL_BASE_URL=http://localhost:3000
QUIZPLUS_SOCIAL_SSH_REMOTE_PORT=3000
```

Recommended daily schedules:

```cron
TZ=Europe/Amsterdam
30 2 * * * cd /path/to/ai-quiz-myself && python3 scripts/openclaw_social_publish.py --audience us >> /var/log/openclaw/quizplus-social.log 2>&1
30 15 * * * cd /path/to/ai-quiz-myself && python3 scripts/openclaw_social_publish.py --audience india >> /var/log/openclaw/quizplus-social.log 2>&1
```

The script has its own lock file at `/tmp/quizplus-social.lock`, so the two jobs will not overlap if one run stalls.

### 1. Reserve a quiz

`POST /api/internal/social/reserve-next`

Headers:

```http
Authorization: Bearer <INTERNAL_SOCIAL_API_TOKEN>
Content-Type: application/json
```

Body:

```json
{
  "pipelineSlug": "organic_publer_main"
}
```

Response highlights:

- `socialPost.id`
- `socialPost.reviewUrl`
- `socialPost.quizSnapshot`
- `remainingEligible`
- `nudge`

If the queue is empty, the endpoint returns:

```json
{
  "status": "empty"
}
```

### 2. Review the generated media

Open `socialPost.reviewUrl`.

That page shows:

- both media variants
- all frame URLs
- the play URL
- any stored caption/comment/title copy

### 3. Publish or create a draft

`POST /api/internal/social/publish`

Example body:

```json
{
  "socialPostId": "SOCIAL_POST_UUID",
  "caption": "3 questions in, 1 left unanswered. Can you finish this QuizPlus round?",
  "firstComment": "Play the full quiz here: https://quizplus.io/play/QUIZ_UUID",
  "tiktokTitle": "Can you finish this quiz?",
  "publishMode": "draft"
}
```

`publishMode` can be:

- `draft`
- `publish`
- `schedule`

If using `schedule`, also send:

```json
{
  "scheduleAt": "2026-04-10T18:00:00Z"
}
```

The app will:

1. fetch the generated frame images
2. upload them to Publer
3. create per-network posts
4. poll Publer job status
5. update `social_posts` and `social_post_attempts`

## Local Preview Script

Create a review-first preview from a random eligible quiz:

```bash
npm run social:preview
```

Optional flags:

```bash
npm run social:preview -- --quizId <quiz-uuid>
npm run social:preview -- --pipeline organic_publer_main
npm run social:preview -- --baseUrl http://127.0.0.1:3000
```

The script prints a JSON payload with the `reviewUrl`.

## Review Routes

- Review page: `/social/review/[socialPostId]?token=...`
- Image frames: `/api/social/posts/[socialPostId]/frames/[frameIndex]?variant=feed|story&token=...`

## Status Route

`GET /api/internal/social/status?pipelineSlug=organic_publer_main`

Use this to let OpenClaw decide when to nudge you about low inventory.
