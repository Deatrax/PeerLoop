# PeerLoop

A request-resolution layer for university course communities. A student asks once; PeerLoop
answers from knowledge the hub already holds, or routes the request to the smallest group of
people who can resolve it, and escalates on a configurable clock until it is resolved or a
human closes it.

Built for IUT CSE 4790 Industrial Training by BatteryLowInteractive.

## Repo shape

```
apps/mobile/     Expo + expo-router. Android, iOS and web from one codebase, runs in Expo Go.
apps/api/        Next.js App Router, API only, deployed to Vercel. Postgres via Drizzle.
packages/core/   Shared domain logic: types, classifier, retrieval, dedupe, routing scorer,
                 dwell calculator, escalation reducer. Zero React/Next/database dependencies.
```

`packages/core` is the point of the arrangement. The scoring and escalation rules are written
once as pure functions; the API uses them as the authority and the client imports the same
functions to render accurate previews ("8 people · widens in 6h") without a round trip.

## Quickstart

```bash
npm install                                   # installs all three workspaces
npm -w apps/api run db:migrate                # apply migrations to your Postgres
npm -w apps/api run seed                      # seed the two demo hubs
npm -w apps/api run dev                       # http://localhost:3000
npm -w apps/mobile start                      # QR code for Expo Go
```

Check the API is alive at `http://localhost:3000/health` — it returns build SHA, database
latency and last cron run.

## Connecting the phone to the API

Your phone cannot reach `localhost` on your Mac. Three options, in order of how much you
should trust them:

1. **Deployed API** — `EXPO_PUBLIC_API_URL=https://api-gamma-lilac-72.vercel.app`.
   No local backend needed. **Use this for the supervisor demo.**
2. **LAN** — `EXPO_PUBLIC_API_URL=http://<your-mac-lan-ip>:3000`, both devices on the same
   Wi-Fi. Fastest for development. Breaks on university networks that isolate clients.
3. **Tunnel** — `npx expo start --tunnel` for the bundler, plus a deployed preview URL for
   the API. Works on any network, slowest to boot.

There is also a full **offline demo mode** (`LocalRepository`) that runs the entire engine
in-process against seeded data persisted to AsyncStorage. Pick "Offline demo" on the sign-in
screen, or toggle it in the dev console. Dead conference Wi-Fi cannot kill the demo.

## Environment

`apps/api/.env` (see `.env.example`):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres. Use the Supabase **pooler** host, not the direct one — direct connections are IPv6-only and fail on IPv4-only hosts. URL-encode `@` in the password as `%40`. |
| `JWT_SECRET` | Signs session tokens. 32+ random characters. |
| `CRON_SECRET` | Bearer token guarding `/api/cron/:job`. |
| `INSTITUTIONAL_DOMAINS` | Comma-separated allowlist for magic-link sign-up. |
| `CORS_ORIGINS` | Expo dev origins. |
| `MODEL_ENDPOINT`, `MODEL_API_KEY` | Optional. When unset, the deterministic `HeuristicProvider` runs and the whole system works with zero keys. |

`apps/mobile/.env` only ever holds `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_EAS_PROJECT_ID`.
No secret, key or database URL may enter the Expo bundle — it is trivially decompilable.

## Deploying the API

```bash
npx vercel link --project api      # from the repo root
npx vercel project update api --root-directory apps/api
npx vercel --prod                  # from the repo root, so the workspace resolves
```

Deploy from the **repo root**, not from `apps/api`. The API imports `@peerloop/core`, a local
workspace package, so the whole monorepo has to be in the build context; deploying from the
app directory fails with `404 @peerloop/core` from the npm registry.

### Scheduled jobs — read this before relying on escalation

**Vercel Hobby cron fires once per day, which is useless for this product.** The escalation
engine needs a sweep every minute. There are three ways to run it and this repo uses the third:

1. Vercel Pro, with the `crons` block in `apps/api/vercel.json` (per-minute).
2. Any external pinger hitting `POST /api/cron/escalation-tick` with the `CRON_SECRET`.
3. **GitHub Actions** — `.github/workflows/cron-jobs.yml` drives all five jobs on schedule.
   Needs repo variable `API_BASE_URL` and repo secret `CRON_SECRET`. Note that GitHub's
   minimum interval is 5 minutes, not 1, so `escalation-tick` runs every 5.

`apps/api/vercel.json` therefore has no `crons` block — adding one back will break deploys on
Hobby with "Hobby accounts are limited to daily cron jobs".

None of this is load-bearing for correctness. Every handler that reads requests for a space
first runs a **lazy read-time sweep** bounded to that space, so escalation stays correct even
if cron never fires at all. Both paths call the same pure reducer and write `request_events`
with a deterministic dedupe key, so running them concurrently is a no-op.

## Demo controls

Long-press the wordmark to open the dev console:

- **Fast clock** — divides every dwell by 60 (or 3600), so a six-hour step fires in seconds
  and escalation is observable live. Honoured server-side via `X-Peerloop-Time-Scale`, only
  when `NODE_ENV !== 'production'`.
- **Act as** — switch between the four seeded accounts instantly.
- **Time travel** — advance the simulated clock 1h / 6h / 24h and run the sweep.
- **Backend toggle** — `HttpRepository` ⇄ `LocalRepository`.
- **Inspect last agent run** — classification JSON, retrieval scores with per-term
  breakdowns, routing shortlist with per-member score terms, escalation decision.
- **Reset to seed.**

Seeded accounts: Arisha (student in both hubs), Rifat (CR of both), Dr. Nasrin (instructor),
Department admin.

## Tests

```bash
npm run typecheck    # tsc --noEmit across all three workspaces, strict
npm test             # packages/core (28) + apps/api (5), no database or network needed
npm run test:e2e     # Playwright drives the web build in offline mode
npm run check        # typecheck + lint + test
```

The API tests spin up in-process PGlite and replay the real migrations, so they need no
database. Nothing in the test suite makes a network call.
