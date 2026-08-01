# Verna

Verna is an anonymous poem-sharing platform where people can turn thoughts,
drafts, and emotional fragments into public poems. Users can post directly,
ask AI to help transform or edit a poem before publishing, reply to poems with
poems, save work they care about, repost poems, and follow anonymous poetic
identities such as `verna1`, `verna2`, or `verna100`.

The Vercel frontend runs as a complete browser demo even before the backend is
deployed. Reviewers can try the product loop end to end: read poems, post, reply,
save, repost, follow profiles, and use the AI-style editor. The Supabase backend
in this repository is the production path for real auth, real AI, persistence,
moderation, and payments.

## Why This Project Exists

Most writing tools are private notebooks. Most social platforms are built for
takes, arguments, and performance. Verna explores a different behavior: a public
creative network where the unit of conversation is a poem.

The intended user flow is:

1. Open feed.
2. Read a poem.
3. Feel something.
4. Reply with another poem, save it, repost it, or follow the author identity.
5. Post your own poem directly or use AI to turn raw text into an editable poem.

The product bet is that anonymous identity plus poetic format can reduce social
pressure while still giving users a public voice and a reason to return.

## Product Model

Verna is designed around three product principles:

- **Anonymous but stable identity**: Google verifies the real account, but public
  identity is a generated Verna handle like `verna14`.
- **Poems as social objects**: Posts, replies, reposts, saves, reactions, and
  profiles all revolve around public poems.
- **AI before publishing, not after**: AI helps generate or edit a poem inline,
  then the user edits and decides what to post.

Users can publish as either:

- `verna_id`: shown under their stable Verna handle.
- `anonymous`: visible in the feed without a public handle.

## Current App Flow

### Portfolio Demo Mode

- Works on Vercel without deploying Supabase first.
- Stores demo posts, saves, follows, replies, and reposts in browser storage.
- Uses a deterministic AI-style editor so reviewers can try the creation flow.
- Keeps the backend architecture visible in the repo for technical review.

### Feed

- `For you`: public poem feed from approved poems and repost events.
- `Following`: authenticated feed from followed Verna profiles.
- Feed cards support poem replies, reactions, saves, and reposts.
- Clicking a public Verna handle opens that author's public profile.

### Compose

- Users can write a poem manually.
- Users can paste a raw thought, article fragment, or messy idea and ask AI to
  turn it into a poem.
- Users can edit the AI output before posting.
- Users choose whether to post as their Verna ID or anonymously.
- Replies are also poems, creating thread-like conversations.

### Profile

- Authenticated users see their Verna identity.
- Public profiles show only public, approved poems posted under a Verna handle.
- Followers are tied to the stable anonymous profile, not the user's real email.

## Architecture

```txt
verna/
|-- frontend/
|   |-- VernApp.jsx
|   |-- index.html
|   |-- package.json
|   `-- src/main.jsx
|-- backend/
|   |-- package.json
|   |-- src/server.ts
|   |-- scripts/test_flow.ts
|   |-- supabase/
|   |   |-- sql/verna-schema.sql
|   |   |-- functions/
|   |   |   |-- _shared/
|   |   |   |-- google-oauth-url/
|   |   |   |-- google-oauth-callback/
|   |   |   |-- google-oauth-exchange/
|   |   |   |-- complete-onboarding/
|   |   |   |-- ai-edit-poem/
|   |   |   |-- publish-poem/
|   |   |   |-- list-public-poems/
|   |   |   |-- list-following-feed/
|   |   |   |-- list-poem-thread/
|   |   |   |-- react-to-poem/
|   |   |   |-- save-poem/
|   |   |   |-- repost-poem/
|   |   |   |-- follow-profile/
|   |   |   |-- get-public-profile/
|   |   |   |-- report-poem/
|   |   |   |-- moderate-poem/
|   |   |   |-- process-ai-jobs/
|   |   |   `-- payment/webhook functions
|   |   `-- .env.local.example
|   `-- tsconfig.json
|-- package.json
|-- package-lock.json
|-- STRUCTURE.md
`-- README.md
```

## Technology

- **Frontend**: React, Vite, Framer Motion.
- **Backend**: Supabase Edge Functions, TypeScript/Deno function runtime.
- **Database**: PostgreSQL via Supabase.
- **Auth**: custom Google OAuth redirect flow with Verna-issued JWTs.
- **AI**: Claude-based inline poem editing and generation.
- **Payments**: Stripe and Flutterwave scaffolding for premium plans.
- **Moderation**: server-side moderation checks before poems become visible.

## Authentication Design

Verna does not rely on Supabase's hosted Google Auth UI. The backend implements
a custom redirect-only Google OAuth flow:

```txt
frontend -> google-oauth-url
Google consent screen
Google -> google-oauth-callback
frontend /auth/callback receives exchange_code
frontend -> google-oauth-exchange
backend returns Verna access and refresh tokens
```

The API accepts Verna-issued JWTs for authenticated user actions. Real email is
stored privately and is not exposed in feeds, poem posts, or public profiles.

## Main API Surface

All authenticated routes use:

```txt
Authorization: Bearer <verna_access_token>
```

| Route | Auth | Purpose |
|---|---:|---|
| `google-oauth-url` | No | Create Google authorization URL |
| `google-oauth-callback` | No | Handle Google redirect and create exchange code |
| `google-oauth-exchange` | No | Exchange one-time code for Verna tokens |
| `refresh-session` | Refresh token | Rotate refresh token and issue access token |
| `get-me` | Yes | Load current Verna profile |
| `complete-onboarding` | Yes | Save onboarding goal and preferred reading moods |
| `ai-edit-poem` | Yes | Generate or edit poem inline before posting |
| `publish-poem` | Yes | Publish poem or poem reply |
| `list-public-poems` | No | Load public For You feed |
| `list-following-feed` | Yes | Load followed profile feed |
| `list-poem-thread` | No | Load poem plus poem replies |
| `react-to-poem` | No | Add anonymous session-based reaction |
| `save-poem` | Yes | Save or unsave a poem |
| `list-saved-poems` | Yes | List saved poems |
| `repost-poem` | Yes | Repost or unrepost a poem |
| `follow-profile` | Yes | Follow or unfollow a Verna identity |
| `get-public-profile` | No | View public profile and poems |
| `report-poem` | Optional | Report unsafe content |
| `moderate-poem` | Admin secret | Review/hide/approve reported poems |
| `process-ai-jobs` | Worker secret | Process queued AI jobs |
| `create-checkout-session` | Yes | Stripe premium checkout |
| `stripe-webhook` | Stripe signature | Sync Stripe subscription state |
| `create-flutterwave-payment-link` | Yes | Flutterwave premium checkout |
| `flutterwave-webhook` | Flutterwave signature | Sync Flutterwave payment state |

## Backend Product Flow

This is the intended launch flow the frontend should follow. The product should
feel like an invitation to write, not a wall before the feed.

```txt
OAuth
  -> google-oauth-url
  -> google-oauth-callback
  -> google-oauth-exchange
  -> get-me

First session
  -> complete-onboarding
     Saves why the user came and which moods they want to read.

Optional first expression
  -> create-poem-draft { action: "save_draft" }
     Saves rough writing without calling AI.
  -> create-poem-draft { action: "polish" }
     Queues an AI job and returns 202 while process-ai-jobs does the work.

Publish
  -> publish-poem
     Publishes from a ready AI draft, a saved draft, or direct poem content.
     Supports author_mode: "verna_id" or "anonymous".
     Runs moderation before public visibility.

Discover/read
  -> list-public-poems
     Supports latest/top sorting plus mood and tag filters for Discover tabs.
  -> list-following-feed
  -> get-public-profile

Signature interaction
  -> publish-poem { parent_post_id }
     Replies are poems, not comments.
  -> list-poem-thread
     Returns the original poem plus poem replies.

Retention actions
  -> react-to-poem
  -> save-poem
  -> repost-poem
  -> follow-profile
  -> report-poem
```

The backend flow is covered by Deno mock API tests in
`backend/supabase/functions/verna-flow.test.ts`. The test simulates an
authenticated user completing onboarding, saving a rough draft, publishing under
a Verna handle, loading the public feed, replying anonymously with a poem, and
loading the poem thread. It also verifies unsafe content is rejected and excluded
from the public feed.

For the exact mock request/response payloads and stored data after each step,
see `docs/API_FLOW_MOCK_DATA.md`.

## Production Readiness Rating

Senior-engineer assessment: **7/10 for an MVP backend, 5.5/10 for high-scale
production**.

Strong:

- Clear poem-first domain model: drafts, posts, replies, saves, reposts,
  follows, reports, moderation, and public-safe views.
- Custom OAuth/JWT flow keeps real identity private while exposing stable Verna
  handles.
- AI generation can run asynchronously through `ai_jobs`.
- Rate limiting exists on high-risk routes.
- Public publishing is moderation-gated.
- Billing webhooks have signature verification and idempotency tracking.
- Deno handler checks and mock API tests now cover the critical product path.

Still not production-hard enough:

- No deployed observability stack yet: metrics, tracing, dashboards, alerting,
  SLOs, or incident runbooks.
- No real load tests against Supabase limits, Edge Function cold starts, or P95 /
  P99 latency.
- No staging/prod migration pipeline with rollback discipline.
- AI job processing is still a cron/worker pattern, not a full queue service with
  operational dashboards.
- Rate limiting is DB-backed and adequate for MVP, but a Redis/edge limiter would
  be better under heavy traffic.
- Payment and auth flows still need end-to-end testing against real provider
  sandboxes before launch.

## Database Highlights

The schema in `backend/supabase/sql/verna-schema.sql` includes:

- `profiles`: real account record plus public Verna number and handle.
- `profiles.onboarding_*`: post-OAuth onboarding state and reading preferences.
- `oauth_identities`: Google identity links.
- `refresh_tokens`: hashed refresh token storage.
- `oauth_callback_exchanges`: short-lived OAuth exchange codes.
- `poem_drafts`: private AI draft records.
- `poem_posts`: published poems and poem replies.
- `public_poem_posts`: public-safe view that hides real user IDs.
- `public_poem_feed_items`: combined poem and repost feed view.
- `poem_post_reactions`: anonymous reaction dedupe by session hash.
- `poem_post_saves`: authenticated saves.
- `poem_post_reposts`: repost events.
- `poem_profile_follows`: profile follow graph.
- `poem_post_reports`: community safety reports.
- `ai_jobs`: queued AI work.
- `subscriptions`: premium access state.

## Safety and Abuse Thinking

Verna is built for real public users, so the backend includes several safety
layers:

- OAuth-backed identity instead of fully unbounded anonymous accounts.
- Stable public handles that protect real identity but still support reputation.
- Server-side moderation before public visibility.
- Report and moderation endpoints for unsafe content.
- Rate limiting helpers for high-risk endpoints.
- Timeout-bounded outbound calls to AI, OAuth, transcription, and billing providers.
- Retry/backoff plus dead-letter handling for queued AI jobs.
- Idempotency tracking for Stripe and Flutterwave webhook deliveries.
- Session-hashed anonymous reactions to reduce spam and duplicate reactions.
- Private data hidden from public views by design.

## Research and Product Questions

This project is also a research artifact. It explores questions such as:

- Can poetic constraints improve the quality of social replies?
- Does stable anonymity encourage more vulnerable creative expression?
- Can AI help users express themselves without replacing their authorship?
- What moderation model is needed for emotional or crisis-adjacent content?
- Which feedback signals matter more for poetry: likes, saves, replies, reposts,
  or follows?
- Can public anonymous identity produce belonging without the pressure of real
  name social media?

These are the kinds of questions I want to study more deeply in research,
human-computer interaction, social computing, AI product design, and applied
software engineering environments.

## What This Repo Demonstrates

Even while the UI is still evolving, this repository demonstrates:

- Product thinking from user behavior to backend data model.
- API design for a real social content platform.
- Custom authentication and token flow.
- Privacy-aware identity design.
- Moderation-aware publishing flow.
- AI integration as an editable assistant rather than an automatic poster.
- Feed, profile, thread, save, repost, follow, and reaction primitives.
- Payment provider integration scaffolding.
- A practical monorepo split between frontend and backend.

## Current Status

Implemented:

- Poem-first frontend shell.
- Custom Google OAuth backend flow.
- Verna handle assignment.
- Public poem feed endpoints.
- Following feed endpoint.
- Inline AI edit/generate endpoint.
- Publish poem and poem reply endpoint.
- Public profile endpoint.
- Thread endpoint.
- Save, repost, follow, reaction, report, and moderation endpoints.
- Stripe and Flutterwave payment scaffolding.

Still in progress:

- Final UI polish.
- Full production deployment validation.
- End-to-end Playwright tests.
- Mobile app packaging.
- More advanced recommendation ranking.
- Stronger observability dashboards.

## Local Development

Install dependencies from the repo root:

```bash
npm install
```

Run the frontend:

```bash
cd frontend
npm run dev
```

Run the backend TypeScript build:

```bash
cd backend
npm run build
```

Run root convenience scripts:

```bash
npm run dev          # backend dev server
npm run build        # backend build
npm run web:dev      # frontend dev server
npm run web:build    # frontend production build
```

## Deploying the Web App

The public web app is configured for Vercel through `vercel.json`.

Vercel should use:

```txt
Install Command: npm install
Build Command: npm --prefix frontend run build
Output Directory: frontend/dist
```

The current frontend works as a browser demo without any Vercel environment
variables. For future production wiring, reserve:

```txt
VITE_VERNA_DEMO_MODE=true
VITE_VERNA_FUNCTIONS_BASE=https://your-project.supabase.co/functions/v1
```

For a portfolio review deployment, you can deploy the frontend first and it will
still be a working site. The backend only needs to be deployed when you want real
user data, Google OAuth, Claude AI, database persistence, and production
moderation.

More detail is in `docs/VERCEL_DEPLOYMENT.md`.

## Environment Variables

Copy:

```txt
backend/supabase/.env.local.example
```

to:

```txt
backend/supabase/.env.local
```

Important secrets include:

```txt
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
VERNA_JWT_SECRET
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI
VERNA_FRONTEND_URL
VERNA_ALLOWED_REDIRECT_ORIGINS
VERNA_CORS_ORIGIN
PROCESS_AI_JOBS_SECRET
MODERATOR_API_SECRET
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
FLUTTERWAVE_SECRET_KEY
FLUTTERWAVE_WEBHOOK_SECRET_HASH
```

Do not commit real `.env.local` files.

## Notes for Reviewers

Verna is incomplete in the way real early-stage software is incomplete: the UI
is still changing, and production deployment still needs final validation.
However, the core system is intentionally designed like a launchable product,
not just a static prototype.

The main thing to evaluate is the thinking: the product loop, backend model,
auth design, privacy choices, AI workflow, safety layer, and how the app could
be studied as a social computing system.
