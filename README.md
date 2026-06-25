<div align="center">

<img src="apps/web/src/app/logo-small.png" alt="Ensemble icon" width="80">

<img src="apps/web/src/app/logo.png" alt="Ensemble" width="300">

**Spaced-repetition flashcards, on the web and in your pocket.**

[**Web → ensemblelanguage.com**](https://ensemblelanguage.com/) · [**iOS → App Store**](https://apps.apple.com/us/app/ensemble-language/id6770618195)

A type-safe TypeScript monorepo where one backend powers two clients — a Next.js web app and an Expo / React Native mobile app — with the SM-2 algorithm, Google Translate, Google Cloud Text-to-Speech, and Wiktionary baked in.

</div>

---

## Highlights

- **One backend, two clients.** A single tRPC router is consumed by both the web app and the native mobile app, so every feature ships everywhere with no duplicated business logic.
- **End-to-end type safety.** Zod schemas, Prisma models, and tRPC procedures form an unbroken type chain from Postgres to the React Native screen.
- **Spaced repetition that actually adapts.** The SM-2 algorithm schedules each card based on the user's self-rated recall, so review queues stay short and effective.
- **Pronunciation, translation, and dictionary lookups built in.** Google Cloud Translate auto-fills card backs, Google Cloud Text-to-Speech reads cards aloud in the deck's target language, and Wiktionary surfaces definitions and example sentences inline.
- **Auth done once.** Auth.js v5 with Google OAuth and Resend magic links — and the mobile app reuses the same session table via a tiny deep-link handoff, so there is zero auth code duplicated across platforms.
- **Collaborative group decks.** Users can create a group and invite others to build out a shared deck together — useful for classrooms, study groups, or language-exchange partners.
- **Public deck library.** Users can flip a deck public and share it with the world; private is the safe default.

---

## Architecture

<p align="center">
  <img src="docs/architecture.svg" alt="Ensemble architecture: web and mobile clients consume shared TypeScript packages, which back a tRPC handler and Auth.js on Vercel, talking to Postgres, Google Translate, Google TTS, and Wiktionary." width="100%">
</p>

The web and mobile apps are siblings under `apps/`. Everything reusable — the Prisma schema, the tRPC router, the SM-2 implementation, the Zod input/output schemas — lives under `packages/` and is imported as a workspace dependency.

```
apps/
  web/      Next.js 15 (App Router) · Auth.js v5 · shadcn/ui
  mobile/   Expo SDK 54 · Expo Router · NativeWind · SecureStore
packages/
  api/      tRPC routers — auth, categories, folders, flashcards,
            practice, dictionary, translate, tts, groups
  db/       Prisma schema + generated client
  types/    Zod schemas · SM-2 spaced-repetition algorithm
  config/   Shared tsconfig presets
```

Turborepo orchestrates builds, typechecks, and dev tasks across the workspaces, so a change to a shared package is seen by both clients on the next compile.

---

## Tech stack

<table>
<tr><th align="left" width="180">Layer</th><th align="left">Choices</th></tr>
<tr><td><b>Language</b></td><td>TypeScript 5 · strict mode end-to-end</td></tr>
<tr><td><b>Web client</b></td><td>Next.js 15 (App Router) · React 19 · Tailwind CSS · shadcn/ui · Radix UI · React Hook Form · TanStack Query</td></tr>
<tr><td><b>Mobile client</b></td><td>Expo SDK 54 · React Native 0.81 · Expo Router · NativeWind · React Native Reanimated · TanStack Query</td></tr>
<tr><td><b>API layer</b></td><td>tRPC v11 · Zod input validation · superjson · cookie-or-bearer auth</td></tr>
<tr><td><b>Auth</b></td><td>Auth.js v5 · Google OAuth · Resend magic-link email · Prisma adapter</td></tr>
<tr><td><b>Database</b></td><td>Postgres (Neon serverless) · Prisma 5 ORM · pooled + direct URLs for migrations</td></tr>
<tr><td><b>External APIs</b></td><td>Google Cloud Translate · Google Cloud Text-to-Speech · Wiktionary parse API</td></tr>
<tr><td><b>Tooling</b></td><td>Turborepo · npm workspaces · ESLint · Prettier (with Tailwind plugin)</td></tr>
<tr><td><b>Hosting</b></td><td>Vercel (web + API) · Neon (database) · EAS (mobile builds)</td></tr>
</table>

---

## Feature tour

**Decks, folders, and cards.** Users organize flashcards into decks (categories), and group decks into folders. Each card holds a front, a back, optional pronunciation, part-of-speech, gender, verb-type metadata, and arrays of example sentences for both sides — enough structure to act like a lightweight language-learning workbook without ever feeling like a database admin tool.

**Spaced-repetition practice.** `packages/types/src/sm2.ts` implements the [SM-2 algorithm](https://en.wikipedia.org/wiki/SuperMemo#Description_of_SM-2_algorithm). When the user rates a card 0–5, `practice.submitReview` updates `repetitions`, `easeFactor`, `interval`, and `nextReview`. The practice queue endpoint returns cards where `nextReview` is null (never seen) or has come due. Failed recalls reset the streak; passes grow the interval geometrically.

**Collaborative group decks.** Users can create a group, invite others by email or link, and collectively build out a shared deck. Any group member can add, edit, or remove cards, and everyone's practice progress is tracked individually against the same shared content — ideal for classrooms, study circles, or language-exchange partners.

**Translation-assisted card creation.** Toggle on a target language (French, Spanish, or German), type the front in English, and the back is auto-filled by the `translate.translate` tRPC mutation, which proxies Google Cloud Translate. The Translate API key is server-side only — the client just feature-detects via `translate.isAvailable` and hides the toggle if it isn't configured.

**Audio pronunciation.** Each deck has a BCP-47 `backLanguage` (e.g. `fr-FR`, `es-ES`, `ja-JP`). The practice screen calls `tts.synthesize`, which hits Google Cloud Text-to-Speech and returns a base64-encoded MP3, played inline on web with a plain `<audio>` element and on mobile via `expo-av`. The same key powers translation _and_ TTS, so most users plug in one secret and get both.

**Inline dictionary lookups.** The dictionary router parses Wiktionary's wikitext for the requested headword and language section, returning structured definitions, examples, and word-class info. The card editor shows it inline, so adding a card to a French deck surfaces the French entry without leaving the page.

**Public deck library.** Decks are private by default (the schema has a `private: Boolean @default(true)` guard). Flipping a deck public lists it on `/library`, where any signed-in user can clone it into their own collection.

**Mobile auth without duplicating Auth.js.** The native app opens an in-app browser to `/auth/mobile?scheme=ensemble`. The web route checks the user's Auth.js session, looks up the matching `Session` row, and redirects back to `ensemble://auth?token=…`. The mobile app stores that token in `expo-secure-store` and sends it as `Authorization: Bearer …` on every tRPC request. The tRPC handler accepts either a cookie session (web) or a bearer token (mobile), resolved against the same session table. Result: zero duplicate auth code, and Google OAuth needs only the web client ID.

**Graceful degradation by feature flag.** Each integration has an `isAvailable` query, so if the deployer doesn't set a Google API key, the translate toggle and audio button simply don't render. Nothing breaks.

---

## How a request flows

A single SM-2 review request — the same code path on web and on mobile — touches every layer of the stack:

```
  User taps "Good" (quality = 4)
        │
        ▼
  TanStack Query  ──►  POST /api/trpc/practice.submitReview
                            (cookie session on web · Bearer token on mobile)
        │
        ▼
  tRPC handler resolves the session  ──►  ctx.user
        │
        ▼
  Zod validates { cardId, quality }   ──►  @ensemble/types
        │
        ▼
  reviewCard(prev, q)                 ──►  SM-2 next state
        │
        ▼
  prisma.flashcard.update(...)        ──►  @ensemble/db  ──►  Postgres (Neon)
        │
        ▼
  Typed Flashcard flows back through tRPC, into the cache, onto the screen.
```

Because the client, the router, the schemas, and the database all share a single source of types, renaming a field or tightening a Zod constraint surfaces as a TypeScript error in every place that needs to change — across web _and_ mobile — before the build succeeds.

---

## Repository layout, in one screenful

```
ensemble/
├── apps/
│   ├── web/              Next.js 15 · App Router
│   │   └── src/
│   │       ├── app/      Routes (incl. /api/trpc, /api/auth, /auth/mobile)
│   │       ├── features/ Practice, cards, categories, folders, groups, settings
│   │       ├── components/ui  shadcn/ui primitives
│   │       └── server/   Auth handlers, tRPC context
│   └── mobile/           Expo SDK 54 · Expo Router
│       ├── app/          File-based routes (signin, decks, practice, …)
│       └── src/
│           ├── features/practice
│           ├── components
│           └── lib       Auth bridge, secure-store, tRPC client
├── packages/
│   ├── api/src/routers/  auth · categories · folders · flashcards
│   │                     practice · dictionary · translate · tts · groups
│   ├── db/prisma/        schema.prisma + seed.ts
│   ├── types/src/        sm2.ts · schemas.ts · languages.ts · wordClass.ts
│   └── config/           tsconfig presets
├── turbo.json            Pipeline definitions
└── package.json          npm workspaces + Turborepo scripts
```

---

## Local development

A short version, for the curious. The repo runs on Node 20+ and a Postgres database (Neon's free tier works well).

```bash
npm install
cp .env.example .env.local      # fill in DATABASE_URL, AUTH_*, optional Google + OPENAI keys
npm run db:push                  # sync Prisma schema
npm run dev                      # web app on http://localhost:3000
```

To run the mobile app, point Expo at the LAN IP of your dev machine and scan the QR code with Expo Go:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.42:3000 \
  npm --workspace=@ensemble/mobile run start
```

The web app and mobile app share the same backend at `EXPO_PUBLIC_API_URL`, so authenticating once on the phone hits the same Postgres rows that the web client writes to.

---

## Shipping a new iOS release

The mobile app is built and submitted through [EAS](https://docs.expo.dev/eas/) (Expo Application Services). The whole flow is two npm scripts, but here is the full sequence end to end.

**1. Bump the version.** Open `apps/mobile/app.json` and raise the marketing `version` (e.g. `1.0.0` → `1.0.1`). You do **not** touch the iOS build number — the `production` profile in `eas.json` has `autoIncrement: true`, so EAS bumps the build number for you on every build. Commit the version bump:

```bash
git add apps/mobile/app.json
git commit -m "Release iOS 1.0.1"
```

**2. Build the production binary in the cloud.** From the repo root:

```bash
npm run mobile:build
# → eas build --platform ios --profile production
```

EAS provisions credentials, compiles the app against `EXPO_PUBLIC_API_URL=https://ensemblelanguage.com`, and produces a signed `.ipa`. The first run will offer to manage signing credentials for you — let it. Builds take a few minutes; you can watch progress in the terminal or on the EAS dashboard.

**3. Submit the build to App Store Connect.** Once the build finishes:

```bash
npm run mobile:submit
# → eas submit --platform ios --profile production
```

This uploads the finished `.ipa` straight to App Store Connect using the `submit.production.ios` config in `eas.json`. (You can also chain build + submit in one shot with `eas build --auto-submit`.)

**4. Release in App Store Connect.** The uploaded build needs a few minutes to finish processing, then:

- Open [App Store Connect](https://appstoreconnect.apple.com/) → **Ensemble Language** → **+ Version** and enter the new version number.
- Attach the processed build under **Build**.
- Fill in **What's New in This Version**, plus any screenshot or metadata changes.
- Click **Add for Review** → **Submit for Review**.

Apple review typically takes a day or so. If you set the release to "Automatically release," it goes live as soon as it's approved; otherwise you press **Release** yourself.

> **TestFlight first (optional).** Builds submitted via `eas submit` show up in TestFlight automatically. To smoke-test before a public release, add yourself as an internal tester and install from the TestFlight app before doing step 5.

---

<div align="center">

Built by [Jeremy Collyer](mailto:collyerdesign@gmail.com)

[ensemblelanguage.com](https://ensemblelanguage.com/) · [Download on the App Store](https://apps.apple.com/us/app/ensemble-language/id6770618195)

</div>
