# Verna Project Structure

Verna is organized as a two-part app. Each side has its own `package.json`, so
commands run correctly from either the repo root or the app folder.

```txt
verna/
|-- backend/
|   |-- package.json
|   |-- src/
|   |   `-- server.ts
|   |-- scripts/
|   |   `-- test_flow.ts
|   |-- supabase/
|   |   |-- .env.local
|   |   |-- .env.local.example
|   |   |-- sql/
|   |   |   `-- verna-schema.sql
|   |   `-- functions/
|   |       |-- _shared/
|   |       |-- google-oauth-url/
|   |       |-- google-oauth-callback/
|   |       |-- google-oauth-exchange/
|   |       |-- publish-poem/
|   |       |-- list-public-poems/
|   |       `-- ...
|   `-- tsconfig.json
|-- frontend/
|   |-- package.json
|   |-- index.html
|   |-- VernApp.jsx
|   `-- src/
|       `-- main.jsx
|-- package.json
|-- package-lock.json
|-- README.md
`-- STRUCTURE.md
```

## Backend

Backend code lives under `backend/`.

- `backend/src/server.ts` is the small local Node server.
- `backend/supabase/sql/verna-schema.sql` is the database schema.
- `backend/supabase/functions/` contains Supabase Edge Functions.
- `backend/supabase/functions/_shared/` contains shared auth, JWT, OAuth, and moderation helpers.
- `backend/supabase/.env.local` contains local secrets and is ignored by git.

Run backend commands from `backend/`:

```bash
cd backend
npm run build
npm run dev
npm run start
```

Or from the repo root:

```bash
npm run build
npm run dev
npm run start
```

Run Supabase commands from `backend/`:

```bash
cd backend
supabase functions serve
supabase functions deploy publish-poem --project-ref your-project-ref
```

## Frontend

Frontend code lives under `frontend/`.

- `frontend/index.html` is the Vite HTML entry.
- `frontend/src/main.jsx` mounts React.
- `frontend/VernApp.jsx` is the current app shell.

Run frontend commands from `frontend/`:

```bash
cd frontend
npm run dev
npm run build
npm run preview
```

Or from the repo root:

```bash
npm run web:dev
npm run web:build
npm run web:preview
```

## Root

The root keeps shared project files:

- `package.json` and `package-lock.json` keep root-level convenience scripts.
- `README.md` explains product/backend setup.
- `STRUCTURE.md` is this file.
