# FlipFlow

Flashcards with spaced repetition. Built as a Turborepo monorepo so the same backend (Prisma + tRPC) feeds a Next.js web client today and a React Native client in Phase 2.

## Phase 1: Web MVP

What's in the box:

- `apps/web` — Next.js 15 (App Router), Tailwind, shadcn/ui, Auth.js v5, tRPC client, TanStack Query
- `packages/api` — tRPC routers (`auth`, `categories`, `flashcards`, `practice`) — the single source of truth for the backend, ready to be consumed by the mobile app
- `packages/db` — Prisma schema and generated client
- `packages/types` — shared Zod schemas and the SM-2 spaced-repetition algorithm
- `packages/config` — shared TypeScript configs

```
apps/
  web/                Next.js App Router
packages/
  api/                tRPC router (shared with mobile in Phase 2)
  db/                 Prisma schema + client
  types/              Zod schemas + SM-2 algorithm
  config/             tsconfig presets
```

## Prerequisites

- Node.js 20+
- npm 10+
- A Postgres database (we recommend [Neon](https://neon.tech) for Phase 1 — free tier, branching, serverless-friendly)
- Optional: a Google OAuth client and/or a Resend API key for sign-in

## Setup

```bash
# 1. Install
npm install

# 2. Copy env template and fill in your values
cp .env.example .env.local

# 3. Generate the Prisma client and push the schema to your DB
npm run db:generate
npm run db:push   # or: npm run db:migrate for migration history

# 4. (optional) Seed a demo deck
npm run db:seed

# 5. Run the dev server
npm run dev
```

The web app is at `http://localhost:3000`.

## Environment variables

All variables live in `.env.local` at the repo root (Turbo passes them through to each workspace).

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Pooled Postgres URL (Neon "Pooled connection") |
| `DIRECT_URL` | Unpooled URL for `prisma migrate` |
| `AUTH_SECRET` | Random string for Auth.js (`openssl rand -base64 32`) |
| `AUTH_URL` | Base URL of the app (`http://localhost:3000` in dev) |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth credentials |
| `AUTH_RESEND_KEY` | Resend API key for magic-link email |
| `EMAIL_FROM` | "From" address for magic-link emails |

If a provider's env vars are missing, that sign-in option is hidden — the app still runs.

### Setting up Google OAuth

1. Create an OAuth client at <https://console.cloud.google.com/apis/credentials>
2. Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
3. Paste the client ID and secret into `.env.local`

### Setting up magic-link email (Resend)

1. Create an API key at <https://resend.com/api-keys>
2. Verify a sending domain (or use the `onboarding@resend.dev` test sender)
3. Set `AUTH_RESEND_KEY` and `EMAIL_FROM` in `.env.local`

## Useful scripts

```bash
npm run dev              # turbo: run all `dev` tasks (just the web app for now)
npm run build            # production build
npm run typecheck        # tsc across every workspace
npm run lint             # next lint + future packages
npm run db:studio        # Prisma Studio
npm run db:migrate       # create + apply a migration
npm run db:seed          # seed a demo deck
```

## How the spaced-repetition piece works

`packages/types/src/sm2.ts` implements the SM-2 algorithm. Each `Flashcard` row tracks `repetitions`, `easeFactor`, `interval`, and `nextReview`. When the user rates a card 0–5, `practice.submitReview` runs SM-2 and persists the new schedule. The practice queue endpoint (`practice.queue`) returns cards where `nextReview` is `null` (never seen) or `<= now`.

## Phase 2 preview

Adding the React Native client is mostly:

1. Add `apps/mobile` (Expo) to the workspace.
2. Install `@flipflow/api`, `@flipflow/types` in it.
3. Use `@trpc/client` with the same `AppRouter` type — autocomplete and type safety drop in for free.
4. Authenticate via `expo-auth-session` against the same Auth.js endpoints.

No backend code changes required. That's the whole point of the monorepo.
