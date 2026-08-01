# Verna Backend API Flow With Mock Data

This document shows the backend product flow tested with mock data in
`backend/supabase/functions/verna-flow.test.ts`.

The goal of the test was to behave like a real user moving through Verna:

```txt
auth user
  -> onboarding
  -> write rough poem
  -> save draft
  -> publish poem
  -> load public feed
  -> reply with poem
  -> load poem thread
  -> verify unsafe content stays out of feed
```

## Flaws Found And Fixed

1. `publish-poem` was storing title/content without trimming whitespace.
   - Example bad input: `"  Quiet Ocean  "`
   - Fixed output: `"Quiet Ocean"`
   - Example bad content: `"  I carried a quiet ocean...  "`
   - Fixed output: `"I carried a quiet ocean..."`

2. The first mock test used fake IDs like `draft-0002`.
   - The real API correctly expects UUIDs for `draft_id`, `post_id`, and
     `parent_post_id`.
   - The mock was fixed to generate UUID-shaped IDs so it respects the real API
     contract.

3. The write/publish/thread handlers started their server immediately, which made
   direct API-flow testing awkward.
   - Fixed by exporting testable handler factories while keeping normal Supabase
     Edge Function behavior.

## Mock User

The mock authenticated user is:

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "email": "poet@example.com",
  "user_metadata": {
    "verna_handle": "verna7",
    "provider": "google"
  }
}
```

Initial mock database:

```json
{
  "profiles": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "verna_handle": "verna7",
      "subscription_tier": "free",
      "onboarding_completed": false,
      "onboarding_goal": null,
      "preferred_moods": []
    }
  ],
  "poem_drafts": [],
  "poem_posts": [],
  "ai_jobs": []
}
```

## Step 1: Complete Onboarding

Endpoint:

```txt
POST /functions/v1/complete-onboarding
Authorization: Bearer <verna_access_token>
```

Input:

```json
{
  "goal": "express_feelings",
  "preferred_moods": ["Heartbreak", "Hope", "Hope"]
}
```

Important backend behavior:

- Requires authenticated Verna JWT.
- Rate limit key: `profile:onboarding:<user_id>`.
- Normalizes moods.
- Deduplicates repeated moods.

Output:

```json
{
  "success": true,
  "profile": {
    "id": "11111111-1111-4111-8111-111111111111",
    "verna_handle": "verna7",
    "onboarding_completed": true,
    "onboarding_goal": "express_feelings",
    "preferred_moods": ["heartbreak", "hope"]
  }
}
```

Stored data after step:

```json
{
  "profiles": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "verna_handle": "verna7",
      "subscription_tier": "free",
      "onboarding_completed": true,
      "onboarding_goal": "express_feelings",
      "preferred_moods": ["heartbreak", "hope"]
    }
  ]
}
```

## Step 2: Save Rough Poem Draft

Endpoint:

```txt
POST /functions/v1/create-poem-draft
Authorization: Bearer <verna_access_token>
```

Input:

```json
{
  "raw_text": "  I carried a quiet ocean home and did not know where to pour it.  ",
  "mood": "Heartbreak",
  "action": "save_draft"
}
```

Important backend behavior:

- Requires authenticated Verna JWT.
- Rate limit key: `poem:draft:<user_id>`.
- Checks monthly free-plan draft quota.
- Does not queue an AI job when `action` is `save_draft`.
- Stores the rough text as editable draft content.

Output:

```json
{
  "success": true,
  "draft_id": "00000000-0000-4000-8c00-000000000002",
  "status": "draft"
}
```

Stored data after step:

```json
{
  "poem_drafts": [
    {
      "id": "00000000-0000-4000-8c00-000000000002",
      "user_id": "11111111-1111-4111-8111-111111111111",
      "raw_text": "  I carried a quiet ocean home and did not know where to pour it.  ",
      "mood": "Heartbreak",
      "style": "verna",
      "edited_poem": "  I carried a quiet ocean home and did not know where to pour it.  ",
      "status": "draft"
    }
  ],
  "ai_jobs": []
}
```

## Step 3: Publish Poem From Draft

Endpoint:

```txt
POST /functions/v1/publish-poem
Authorization: Bearer <verna_access_token>
```

Input:

```json
{
  "draft_id": "00000000-0000-4000-8c00-000000000002",
  "title": "  Quiet Ocean  ",
  "tags": ["Heart Break", "Short Reads", "Heart Break"],
  "author_mode": "verna_id"
}
```

Important backend behavior:

- Requires authenticated Verna JWT.
- Rate limit key: `poem:publish:<user_id>`.
- Confirms draft belongs to the user.
- Allows publishing from draft statuses: `draft` or `ready`.
- Prevents publishing the same draft twice.
- Trims title and content.
- Normalizes and deduplicates tags.
- Runs moderation before public visibility.
- If approved, sets `is_visible: true`.

Output:

```json
{
  "success": true,
  "post": {
    "id": "00000000-0000-4000-8a00-000000000004",
    "parent_post_id": null,
    "author_mode": "verna_id",
    "author_handle": "verna7",
    "moderation_status": "approved",
    "moderation_reason": null,
    "is_visible": true,
    "created_at": "2026-07-30T12:04:00.000Z"
  },
  "moderation": {
    "approved": true,
    "contains_crisis": false,
    "contains_pii": false,
    "reason": null
  }
}
```

Stored data after step:

```json
{
  "poem_posts": [
    {
      "id": "00000000-0000-4000-8a00-000000000004",
      "draft_id": "00000000-0000-4000-8c00-000000000002",
      "parent_post_id": null,
      "user_id": "11111111-1111-4111-8111-111111111111",
      "author_mode": "verna_id",
      "author_handle": "verna7",
      "title": "Quiet Ocean",
      "content": "I carried a quiet ocean home and did not know where to pour it.",
      "mood": "Heartbreak",
      "tags": ["heart-break", "short-reads"],
      "moderation_status": "approved",
      "is_visible": true,
      "is_flagged": false,
      "reply_count": 0
    }
  ],
  "poem_drafts": [
    {
      "id": "00000000-0000-4000-8c00-000000000002",
      "status": "posted",
      "edited_title": "Quiet Ocean",
      "edited_poem": "I carried a quiet ocean home and did not know where to pour it."
    }
  ]
}
```

## Step 4: Load Public Feed By Tag

Endpoint:

```txt
POST /functions/v1/list-public-poems
```

Input:

```json
{
  "tag": "Heart Break",
  "limit": 10
}
```

Important backend behavior:

- Does not require auth.
- Rate limit key: `poem:feed:<ip>`.
- Normalizes tag to `heart-break`.
- Reads only public-safe views.
- Does not expose real user IDs or real emails.

Output:

```json
{
  "success": true,
  "poems": [
    {
      "id": "00000000-0000-4000-8a00-000000000004",
      "feed_item_id": "00000000-0000-4000-8a00-000000000004",
      "feed_item_type": "post",
      "parent_post_id": null,
      "author_handle": "verna7",
      "author_mode": "verna_id",
      "title": "Quiet Ocean",
      "content": "I carried a quiet ocean home and did not know where to pour it.",
      "mood": "Heartbreak",
      "tags": ["heart-break", "short-reads"],
      "reply_count": 0,
      "repost_count": 0,
      "save_count": 0
    }
  ],
  "next_cursor": null
}
```

## Step 5: Reply With A Poem

Endpoint:

```txt
POST /functions/v1/publish-poem
Authorization: Bearer <verna_access_token>
```

Input:

```json
{
  "parent_post_id": "00000000-0000-4000-8a00-000000000004",
  "content": "The sky answered late,\nbut it came carrying your name.",
  "mood": "Hope",
  "tags": ["Hope"],
  "author_mode": "anonymous"
}
```

Important backend behavior:

- Confirms parent poem exists, is visible, and is approved.
- Runs moderation.
- Stores the reply as a poem post with `parent_post_id`.
- If `author_mode` is `anonymous`, public views hide the author handle.
- Increments the parent poem's `reply_count`.

Output:

```json
{
  "success": true,
  "post": {
    "id": "00000000-0000-4000-8a00-000000000006",
    "parent_post_id": "00000000-0000-4000-8a00-000000000004",
    "author_mode": "anonymous",
    "author_handle": null,
    "moderation_status": "approved",
    "is_visible": true
  },
  "moderation": {
    "approved": true,
    "contains_crisis": false,
    "contains_pii": false,
    "reason": null
  }
}
```

Stored data after step:

```json
{
  "poem_posts": [
    {
      "id": "00000000-0000-4000-8a00-000000000004",
      "reply_count": 1
    },
    {
      "id": "00000000-0000-4000-8a00-000000000006",
      "parent_post_id": "00000000-0000-4000-8a00-000000000004",
      "author_mode": "anonymous",
      "author_handle": null,
      "content": "The sky answered late,\nbut it came carrying your name.",
      "mood": "Hope",
      "tags": ["hope"],
      "is_visible": true
    }
  ]
}
```

## Step 6: Load Poem Thread

Endpoint:

```txt
POST /functions/v1/list-poem-thread
```

Input:

```json
{
  "post_id": "00000000-0000-4000-8a00-000000000004"
}
```

Important backend behavior:

- Does not require auth.
- Rate limit key: `poem:thread:<ip>`.
- Loads root poem from public-safe view.
- Loads approved visible poem replies.

Output:

```json
{
  "success": true,
  "root": {
    "id": "00000000-0000-4000-8a00-000000000004",
    "author_handle": "verna7",
    "author_mode": "verna_id",
    "title": "Quiet Ocean",
    "content": "I carried a quiet ocean home and did not know where to pour it.",
    "reply_count": 1
  },
  "replies": [
    {
      "id": "00000000-0000-4000-8a00-000000000006",
      "parent_post_id": "00000000-0000-4000-8a00-000000000004",
      "author_handle": null,
      "author_mode": "anonymous",
      "content": "The sky answered late,\nbut it came carrying your name.",
      "mood": "Hope",
      "tags": ["hope"]
    }
  ],
  "next_cursor": null
}
```

## Safety Test: Unsafe Poem Rejected

Endpoint:

```txt
POST /functions/v1/publish-poem
Authorization: Bearer <verna_access_token>
```

Input:

```json
{
  "content": "This line should be stopped before the feed.",
  "mood": "Crisis",
  "tags": ["crisis"],
  "author_mode": "anonymous"
}
```

Mock moderation result:

```json
{
  "is_safe": false,
  "contains_crisis": true,
  "contains_pii": false,
  "reason": "Crisis language"
}
```

Output:

```json
{
  "success": true,
  "post": {
    "moderation_status": "rejected",
    "is_visible": false
  },
  "moderation": {
    "approved": false,
    "contains_crisis": true,
    "contains_pii": false,
    "reason": "Crisis language"
  }
}
```

Stored data:

```json
{
  "poem_posts": [
    {
      "moderation_status": "rejected",
      "is_visible": false,
      "is_flagged": true,
      "moderation_reason": "Crisis language"
    }
  ]
}
```

Public feed result after unsafe post:

```json
{
  "success": true,
  "poems": [],
  "next_cursor": null
}
```

## Endpoint Catalog

All authenticated endpoints use:

```txt
Authorization: Bearer <verna_access_token>
```

### `google-oauth-url`

Purpose: create Google OAuth URL.

Input:

```json
{
  "redirect_to": "https://app.example.com/"
}
```

Output:

```json
{
  "success": true,
  "url": "https://accounts.google.com/o/oauth2/v2/auth?..."
}
```

### `google-oauth-callback`

Purpose: Google redirects here after consent.

Input:

```txt
GET /google-oauth-callback?code=<google_code>&state=<signed_state>
```

Output:

```txt
302 redirect to frontend /auth/callback#exchange_code=<code>
```

### `google-oauth-exchange`

Purpose: exchange one-time backend code for Verna app tokens.

Input:

```json
{
  "exchange_code": "<uuid>"
}
```

Output:

```json
{
  "success": true,
  "access_token": "<verna_jwt>",
  "refresh_token": "<opaque_refresh_token>",
  "profile": {
    "user_id": "<uuid>",
    "email": "poet@example.com",
    "verna_handle": "verna7"
  }
}
```

### `refresh-session`

Purpose: rotate refresh token and issue a new access token.

Input:

```json
{
  "refresh_token": "<opaque_refresh_token>"
}
```

Output:

```json
{
  "success": true,
  "access_token": "<new_verna_jwt>",
  "refresh_token": "<new_refresh_token>"
}
```

### `get-me`

Purpose: load current profile.

Input:

```json
{}
```

Output:

```json
{
  "success": true,
  "profile": {
    "id": "<uuid>",
    "verna_number": 7,
    "verna_handle": "verna7",
    "onboarding_completed": true,
    "onboarding_goal": "express_feelings",
    "preferred_moods": ["heartbreak", "hope"],
    "subscription_tier": "free",
    "subscription_status": "inactive"
  }
}
```

### `complete-onboarding`

Purpose: save why the user came and what they want to read.

Input:

```json
{
  "goal": "express_feelings",
  "preferred_moods": ["Heartbreak", "Hope"]
}
```

Output:

```json
{
  "success": true,
  "profile": {
    "onboarding_completed": true,
    "onboarding_goal": "express_feelings",
    "preferred_moods": ["heartbreak", "hope"]
  }
}
```

### `create-poem-draft`

Purpose: save rough writing or queue AI polish.

Input for saved draft:

```json
{
  "raw_text": "I carried a quiet ocean home...",
  "mood": "Heartbreak",
  "style": "verna",
  "action": "save_draft"
}
```

Output:

```json
{
  "success": true,
  "draft_id": "<uuid>",
  "status": "draft"
}
```

Input for AI polish:

```json
{
  "raw_text": "I carried a quiet ocean home...",
  "mood": "Heartbreak",
  "style": "verna",
  "action": "polish"
}
```

Output:

```json
{
  "success": true,
  "draft_id": "<uuid>",
  "job_id": "<uuid>",
  "status": "generating"
}
```

### `get-poem-draft`

Purpose: get one draft or list current user's drafts.

Input:

```json
{
  "draft_id": "<uuid>"
}
```

Output:

```json
{
  "success": true,
  "draft": {
    "id": "<uuid>",
    "raw_text": "...",
    "mood": "Heartbreak",
    "style": "verna",
    "edited_poem": "...",
    "status": "draft"
  }
}
```

### `retry-poem-draft`

Purpose: retry a failed AI poem draft.

Input:

```json
{
  "draft_id": "<uuid>"
}
```

Output:

```json
{
  "success": true,
  "draft_id": "<uuid>",
  "job_id": "<uuid>",
  "status": "generating"
}
```

### `ai-edit-poem`

Purpose: inline AI editor before publishing.

Input:

```json
{
  "mode": "edit",
  "text": "my unfinished poem text",
  "instruction": "make_more_poetic",
  "style": "verna"
}
```

Output:

```json
{
  "success": true,
  "suggestion": {
    "title": "Quiet Ocean",
    "content": "edited poem text"
  }
}
```

### `publish-poem`

Purpose: publish a new poem or poem reply.

Input for new poem:

```json
{
  "draft_id": "<uuid>",
  "title": "Quiet Ocean",
  "mood": "Heartbreak",
  "tags": ["heartbreak", "short-reads"],
  "author_mode": "verna_id"
}
```

Input for reply:

```json
{
  "parent_post_id": "<uuid>",
  "content": "The sky answered late...",
  "mood": "Hope",
  "tags": ["hope"],
  "author_mode": "anonymous"
}
```

Output:

```json
{
  "success": true,
  "post": {
    "id": "<uuid>",
    "parent_post_id": null,
    "author_mode": "verna_id",
    "author_handle": "verna7",
    "moderation_status": "approved",
    "is_visible": true
  },
  "moderation": {
    "approved": true,
    "contains_crisis": false,
    "contains_pii": false,
    "reason": null
  }
}
```

### `list-public-poems`

Purpose: public feed and Discover tabs.

Input:

```json
{
  "limit": 20,
  "sort": "latest",
  "feed_type": "feed",
  "mood": "Heartbreak",
  "tag": "short-reads"
}
```

Output:

```json
{
  "success": true,
  "poems": [],
  "next_cursor": null
}
```

### `list-following-feed`

Purpose: authenticated feed from followed profiles.

Input:

```json
{
  "limit": 20
}
```

Output:

```json
{
  "success": true,
  "poems": [],
  "next_cursor": null
}
```

### `list-poem-thread`

Purpose: root poem plus poem replies.

Input:

```json
{
  "post_id": "<uuid>",
  "limit": 20
}
```

Output:

```json
{
  "success": true,
  "root": {},
  "replies": [],
  "next_cursor": null
}
```

### `react-to-poem`

Purpose: anonymous session-based reaction.

Input:

```json
{
  "post_id": "<uuid>",
  "reaction_type": "felt_this",
  "session_id": "browser-session-id"
}
```

Output:

```json
{
  "success": true,
  "reaction_counts": {
    "felt_this": 1
  }
}
```

### `save-poem`

Purpose: save or unsave a poem.

Input:

```json
{
  "post_id": "<uuid>"
}
```

Output:

```json
{
  "success": true,
  "saved": true,
  "save_count": 1
}
```

### `list-saved-poems`

Purpose: list current user's saved poems.

Input:

```json
{
  "limit": 20
}
```

Output:

```json
{
  "success": true,
  "poems": [],
  "next_cursor": null
}
```

### `repost-poem`

Purpose: repost or unrepost a poem.

Input:

```json
{
  "post_id": "<uuid>",
  "author_mode": "verna_id"
}
```

Output:

```json
{
  "success": true,
  "reposted": true,
  "repost_count": 1
}
```

### `follow-profile`

Purpose: follow or unfollow a Verna identity.

Input:

```json
{
  "verna_handle": "verna12"
}
```

Output:

```json
{
  "success": true,
  "following": true
}
```

### `get-public-profile`

Purpose: view a public Verna profile.

Input:

```json
{
  "verna_handle": "verna7",
  "limit": 20
}
```

Output:

```json
{
  "success": true,
  "profile": {
    "verna_handle": "verna7"
  },
  "poems": [],
  "next_cursor": null
}
```

### `report-poem`

Purpose: report unsafe public content.

Input:

```json
{
  "post_id": "<uuid>",
  "reason": "self_harm",
  "details": "optional details",
  "session_id": "browser-session-id"
}
```

Output:

```json
{
  "success": true
}
```

### `moderate-poem`

Purpose: moderator review endpoint.

Input:

```json
{
  "action": "approve",
  "post_id": "<uuid>",
  "reason": "Reviewed by moderator"
}
```

Output:

```json
{
  "success": true
}
```

### `process-ai-jobs`

Purpose: worker endpoint for queued AI jobs.

Headers:

```txt
x-worker-secret: <PROCESS_AI_JOBS_SECRET>
```

Input:

```json
{}
```

Output when a job is processed:

```json
{
  "success": true,
  "job": "<uuid>",
  "draft_id": "<uuid>"
}
```

Output when no job is available:

```txt
204 No Content
```

### `create-checkout-session`

Purpose: Stripe checkout for Premium.

Input:

```json
{
  "success_url": "https://app.example.com/billing/success",
  "cancel_url": "https://app.example.com/billing/cancel"
}
```

Output:

```json
{
  "success": true,
  "checkout_url": "https://checkout.stripe.com/...",
  "session_id": "cs_..."
}
```

### `stripe-webhook`

Purpose: Stripe subscription state sync.

Input:

```txt
Stripe signed webhook payload
```

Output:

```json
{
  "received": true
}
```

### `create-flutterwave-payment-link`

Purpose: Flutterwave checkout for Premium.

Input:

```json
{
  "email": "poet@example.com",
  "name": "Poet",
  "success_url": "https://app.example.com/billing/success",
  "cancel_url": "https://app.example.com/billing/cancel"
}
```

Output:

```json
{
  "success": true,
  "checkout_url": "https://checkout.flutterwave.com/...",
  "tx_ref": "verna_premium_<user_id>_<timestamp>"
}
```

### `flutterwave-webhook`

Purpose: Flutterwave payment/subscription sync.

Input:

```txt
Flutterwave signed webhook payload
```

Output:

```json
{
  "received": true
}
```

## Test Commands

Run mock API tests:

```bash
deno task test:functions
```

Run Edge Function type checks:

```bash
deno task check:functions
```

Run backend TypeScript build:

```bash
npm.cmd --prefix backend run build
```
