# Vercel Deployment

Verna uses Vercel for the public React/Vite web app and Supabase for backend
Edge Functions. Do not deploy the Supabase functions to Vercel.

The frontend is intentionally portfolio-safe: it runs as an interactive demo in
the browser even before the backend is deployed. Reviewers can post poems,
reply, save, repost, follow profiles, and try the AI-style editor without
needing real Google OAuth or Supabase secrets.

## Recommended Setup

Import the GitHub repo into Vercel:

```txt
Repository: Ayo1mide/verna
Framework Preset: Other
Root Directory: ./
Install Command: npm install
Build Command: npm --prefix frontend run build
Output Directory: frontend/dist
```

The root `vercel.json` already contains these settings, so Vercel should detect
the correct build behavior automatically.

## Environment Variables

For the current portfolio demo, no backend environment variable is required.
You may still add these as future production wiring notes:

```txt
VITE_VERNA_FUNCTIONS_BASE=https://your-project.supabase.co/functions/v1
VITE_VERNA_DEMO_MODE=true
```

For a portfolio deployment where the backend is not live yet, omit backend
wiring entirely. The app will still work as a polished browser demo.

For local frontend development, copy:

```txt
frontend/.env.example
```

to:

```txt
frontend/.env.local
```

and set the same value.

## Backend Deployment

Backend deployment is only required when you want real accounts, real AI,
database persistence, moderation, and production feeds. Deploy backend functions
separately from `backend/` using Supabase:

```bash
cd backend
supabase functions deploy google-oauth-url --project-ref your-project-ref
supabase functions deploy google-oauth-callback --project-ref your-project-ref
supabase functions deploy google-oauth-exchange --project-ref your-project-ref
supabase functions deploy refresh-session --project-ref your-project-ref
supabase functions deploy get-me --project-ref your-project-ref
supabase functions deploy ai-edit-poem --project-ref your-project-ref
supabase functions deploy publish-poem --project-ref your-project-ref
supabase functions deploy list-public-poems --project-ref your-project-ref
supabase functions deploy list-following-feed --project-ref your-project-ref
supabase functions deploy list-poem-thread --project-ref your-project-ref
supabase functions deploy react-to-poem --project-ref your-project-ref
supabase functions deploy save-poem --project-ref your-project-ref
supabase functions deploy repost-poem --project-ref your-project-ref
supabase functions deploy follow-profile --project-ref your-project-ref
supabase functions deploy get-public-profile --project-ref your-project-ref
supabase functions deploy report-poem --project-ref your-project-ref
supabase functions deploy moderate-poem --project-ref your-project-ref
supabase functions deploy process-ai-jobs --project-ref your-project-ref
```

## Google OAuth Redirects

Add both local and production callback URLs in Google Cloud Console:

```txt
http://127.0.0.1:5173/auth/callback
https://your-vercel-domain.vercel.app/auth/callback
https://your-custom-domain.com/auth/callback
```

The backend `GOOGLE_REDIRECT_URI` should point to the Supabase callback function:

```txt
https://your-project.supabase.co/functions/v1/google-oauth-callback
```

## Production Checklist

- Vercel serves the React demo successfully.
- Optional future production wiring has `VITE_VERNA_FUNCTIONS_BASE`.
- Supabase Edge Function secrets are configured.
- Google OAuth redirect URIs match exactly.
- Database schema from `backend/supabase/sql/verna-schema.sql` is applied.
- Frontend build passes with `npm --prefix frontend run build`.
- Backend TypeScript build passes with `npm --prefix backend run build`.
