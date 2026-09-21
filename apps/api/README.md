# PeerLoop API

Next.js App Router, API only. No UI beyond `/health`, which returns build SHA, database
latency and last cron run. See the [root README](../../README.md) for setup, environment
variables and deployment.

## Shape

```
app/api/v1/[...path]/   one catch-all shell: CORS, body limit, auth, error mapping
app/api/cron/[job]/     the five scheduled jobs, guarded by CRON_SECRET
app/health/             liveness + database latency
db/                     schema.ts, migrations, seed runner
lib/                    auth, store (transaction wrapper), dispatch (delivery), jobs, digests
```

The route handlers are deliberately thin. All §13 domain logic lives in
`packages/core/src/engine.ts`, so the same code serves the HTTP API and the client's offline
mode. Two contract layers gate every call: an allow-list of path/verb pairs, and a response
schema that throws if a path has no declared contract.

Every space-scoped read and write asserts membership before touching a row. That assertion is
structural — `space()`, `request()` and `card()` all run the guard — not a per-handler `if`.

## Local commands

```bash
npm -w apps/api run dev         # http://localhost:3000
npm -w apps/api run db:migrate  # apply migrations
npm -w apps/api run seed        # reset to the demo seed (idempotent)
npm -w apps/api test            # in-process PGlite, no database or network needed
```

## Scheduled jobs

`vercel.json` has **no `crons` block on purpose**. Vercel Hobby cron fires only once per day,
which is useless for an escalation engine that needs a minute-level sweep, and deploys are
rejected outright with "Hobby accounts are limited to daily cron jobs". The five jobs are
driven by `.github/workflows/cron-jobs.yml` instead; on a Pro plan you can move them back
into `vercel.json`.

Correctness does not depend on any of that. Every handler that reads requests for a space
first runs a lazy read-time sweep for that space, bounded to 50 requests, so escalation stays
correct even if cron never fires. The cron path and the lazy path call the same pure reducer
and write `request_events` with a deterministic dedupe key, so concurrent execution is a no-op.

Jobs: `escalation-tick`, `digest-builder`, `knowledge-staleness`, `score-recompute`,
`metrics-rollup`. Invoke one directly with:

```bash
curl -X POST "$API/api/cron/escalation-tick" -H "Authorization: Bearer $CRON_SECRET"
```
