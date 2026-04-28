# FlipFlow

Flashcards with spaced repetition. Turborepo monorepo — one Prisma + tRPC backend feeds both a Next.js web client and an Expo / React Native mobile client. Every procedure is type-shared between the two.

## What's in the box

- `apps/web` — Next.js 15 (App Router), Tailwind, shadcn/ui, Auth.js v5, tRPC client, TanStack Query
- `apps/mobile` — Expo SDK 51 + Expo Router, NativeWind, tRPC + TanStack Query, SecureStore, Auth via `expo-web-browser`
- `packages/api` — tRPC routers (`auth`, `categories`, `flashcards`, `practice`) — the single source of truth for the backend
- `packages/db` — Prisma schema and generated client
- `packages/types` — shared Zod schemas and the SM-2 spaced-repetition algorithm
- `packages/config` — shared TypeScript configs

```
apps/
  web/                Next.js App Router
  mobile/             Expo Router (React Native)
packages/
  api/                tRPC router (consumed by web + mobile)
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

| Variable                                | Purpose                                                          |
| --------------------------------------- | ---------------------------------------------------------------- |
| `DATABASE_URL`                          | Pooled Postgres URL (Neon "Pooled connection")                   |
| `DIRECT_URL`                            | Unpooled URL for `prisma migrate`                                |
| `AUTH_SECRET`                           | Random string for Auth.js (`openssl rand -base64 32`)            |
| `AUTH_URL`                              | Base URL of the app (`http://localhost:3000` in dev)             |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth credentials                                         |
| `AUTH_RESEND_KEY`                       | Resend API key for magic-link email                              |
| `EMAIL_FROM`                            | "From" address for magic-link emails                             |
| `GOOGLE_TRANSLATE_API_KEY`              | Optional. Enables the translation toggle on the New Card dialog. |

If a provider's env vars are missing, that sign-in option is hidden — the app still runs. Same goes for `GOOGLE_TRANSLATE_API_KEY`: when it's not set, the new-card dialog quietly omits the translation toggle.

### Setting up Google OAuth

1. Create an OAuth client at <https://console.cloud.google.com/apis/credentials>
2. Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
3. Paste the client ID and secret into `.env.local`

### Setting up magic-link email (Resend)

1. Create an API key at <https://resend.com/api-keys>
2. Verify a sending domain (or use the `onboarding@resend.dev` test sender)
3. Set `AUTH_RESEND_KEY` and `EMAIL_FROM` in `.env.local`

### Setting up Google Translate (optional)

The New Card dialog has an opt-in translation mode that auto-fills the back of a flashcard with a translation of the front (assumed English) into French, Spanish, or German. The toggle and chosen language are persisted per deck in `localStorage`.

1. In Google Cloud Console, enable the **Cloud Translation API** for your project.
2. Create an API key at <https://console.cloud.google.com/apis/credentials>. Restrict it to the Translation API.
3. Set `GOOGLE_TRANSLATE_API_KEY` in `.env.local`.

Translation calls go through the `translate.translate` tRPC mutation — the key never leaves the server. The web dialog feature-detects the key via `translate.isAvailable`, so when it's not set the toggle is hidden and everything else still works. Mobile parity will land in a follow-up.

## Useful scripts

```bash
npm run dev              # turbo: runs dev tasks in every app that has one
npm run build            # production build
npm run typecheck        # tsc across every workspace
npm run lint             # next lint + future packages
npm run db:studio        # Prisma Studio
npm run db:migrate       # create + apply a migration
npm run db:seed          # seed a demo deck
```

`npm run dev` only starts the _web_ dev server; the mobile app runs separately because Metro has its own lifecycle and QR-code UI.

## How the spaced-repetition piece works

`packages/types/src/sm2.ts` implements the SM-2 algorithm. Each `Flashcard` row tracks `repetitions`, `easeFactor`, `interval`, and `nextReview`. When the user rates a card 0–5, `practice.submitReview` runs SM-2 and persists the new schedule. The practice queue endpoint (`practice.queue`) returns cards where `nextReview` is `null` (never seen) or `<= now`.

## Mobile app (Expo)

The mobile app lives in `apps/mobile`. It has feature parity with the web: deck list, deck detail with card CRUD, and the SM-2 practice flow. Authentication is delegated to the web app via a hosted bridge, so there's no duplicate auth code to maintain.

### Running the mobile app

You need two terminals: one for the web server (the mobile app talks to it), one for Expo.

```bash
# Terminal 1 — web backend
npm run dev --workspace=@flipflow/web

# Terminal 2 — Expo
npm --workspace=@flipflow/mobile run start
```

Then scan the QR code with the **Expo Go** app on iOS or Android.

### `EXPO_PUBLIC_API_URL` — pointing the phone at the web server

On your phone, `localhost` means "this phone," not your dev machine. Set the API URL to your machine's LAN IP:

```bash
# Find your LAN IP
ipconfig getifaddr en0        # macOS wifi
hostname -I | awk '{print $1}' # Linux

# Start Expo with the pointed URL
EXPO_PUBLIC_API_URL=http://192.168.1.42:3000 npm --workspace=@flipflow/mobile run start
```

If you don't set `EXPO_PUBLIC_API_URL`, the mobile app falls back to deriving the host from the Expo dev server, which works in the common case of running Metro and Next.js on the same machine.

### Using tunnel mode (coffee-shop / restrictive Wi-Fi / different networks)

If your phone can't reach your dev machine on the LAN, tunnel through ngrok:

```bash
npm --workspace=@flipflow/mobile run tunnel
```

In tunnel mode, set `EXPO_PUBLIC_API_URL` to a publicly reachable URL for your Next.js server (e.g. an `ngrok http 3000` tunnel or a Vercel preview deploy) — the phone can't hit your LAN IP in that scenario.

### Deep link scheme

The app is registered as `flipflow://` in `apps/mobile/app.json`. The sign-in flow opens `https://<web>/auth/mobile?scheme=flipflow` in an in-app browser, and Auth.js redirects back to `flipflow://auth?token=…&expires=…`. The mobile app parses the token, persists it via `expo-secure-store`, and injects it as a `Bearer` header on every tRPC request.

### How mobile auth works (no new tRPC procedures)

1. Mobile calls `WebBrowser.openAuthSessionAsync("${API_URL}/auth/mobile?scheme=flipflow")`.
2. The new `/auth/mobile` route in `apps/web` checks the user's session. If signed out, it bounces to `/signin` with a callback. If signed in, it looks up the corresponding `Session` row and redirects to `flipflow://auth?token=<sessionToken>&expires=<iso>`.
3. Mobile stores `token` + `expires` in `expo-secure-store`, then sends `Authorization: Bearer <token>` on every tRPC request.
4. The tRPC handler (`apps/web/src/app/api/trpc/[trpc]/route.ts`) accepts _either_ a cookie session (web) _or_ a bearer token (mobile) — bearer tokens are resolved against the same `Session` table Auth.js already maintains.

Result: zero changes to `@flipflow/api`, and mobile sign-out is just `clearStoredSession()`.

### Google OAuth redirects for mobile

The in-app browser flow reuses the web app's Google OAuth config — no separate iOS / Android OAuth clients are needed. Just make sure your Google OAuth client has `http://<your-web-origin>/api/auth/callback/google` listed as an authorized redirect URI for whichever origin Expo will hit (LAN IP in dev, production URL in prod).

### Useful mobile scripts

```bash
# From the repo root
npm --workspace=@flipflow/mobile run start      # Metro + QR code
npm --workspace=@flipflow/mobile run ios        # open iOS simulator
npm --workspace=@flipflow/mobile run android    # open Android emulator
npm --workspace=@flipflow/mobile run tunnel     # ngrok-backed tunnel
npm --workspace=@flipflow/mobile run typecheck  # tsc
npm --workspace=@flipflow/mobile run clean      # wipe .expo + node_modules
```
