# PeerLoop — unattended implementation session

Session date: 2026-09-21 (overnight, unattended)
Operator instruction: complete the implementation; do not commit; make no model-service
calls from anywhere; database and Vercel deploys permitted; React Native tested locally only;
do not ask questions; document every decision.

**Nothing was committed.** Every change is in the working tree for your review.

---

## 1. Rules, and how each was honoured

| Rule | How |
|---|---|
| No commits | No `git commit` or `git push` after the handover. `git status` shows the full diff. |
| No model calls — not local, not terminal, not Vercel, not RN | Credentials removed from Vercel production **and** commented out in `apps/api/.env`. Detail in §2. |
| Database permitted | Used for migrations, seeding, verification. |
| Vercel deploy permitted | Used. |
| React Native local only | Expo web + Playwright locally. No EAS, no publish. |
| No questions | None asked. Every judgement call is recorded in §5. |

---

## 2. Model kill switch

The only model code path is:

`app/api/v1/[...path]/route.ts` → `provider: process.env.MODEL_ENDPOINT ? new RemoteProvider() : undefined`
→ `Engine.ctx.provider` → `engine.ts` `classify()` → `lib/agent/provider.ts` → `fetch(MODEL_ENDPOINT)`.

It fires only on `POST /api/v1/requests` (and `/requests/:id/move`, which creates internally).
Cron, sweeps, seeding and tests never construct a provider — they fall through to the
deterministic `HeuristicProvider`. `classify()` retries twice before falling back, so one
request could have been two billed calls.

Closed on both sides:

- **Vercel**: `vercel env rm MODEL_ENDPOINT production` and `vercel env rm MODEL_API_KEY production`.
  Remaining: `DATABASE_URL`, `JWT_SECRET`, `CRON_SECRET`, `INSTITUTIONAL_DOMAINS`, `APP_URL`, `CORS_ORIGINS`.
- **Local**: both lines commented out in `apps/api/.env` with a restore note. Next.js auto-loads
  that file, so `npm -w apps/api run dev` + one created request would otherwise have been a real
  billed call.

This also matches the spec, which wants the heuristic provider to be the default so the system
is "fully functional with zero keys" (Build Prompt §5.2). The remote path is untouched in code.

**To restore in the morning:** uncomment the two lines in `apps/api/.env`, then

```
cd apps/api
printf '%s' 'https://api.openai.com/v1/chat/completions' | npx vercel env add MODEL_ENDPOINT production
printf '%s' '<key>' | npx vercel env add MODEL_API_KEY production
cd .. && npx vercel --prod
```

### Rotate the key
Your OpenAI key was pasted into the session and written to `apps/api/.env`. Before the
`.vercelignore` fix landed, one deployment bundled that `.env` into its build source, so the
key sat in plaintext inside a Vercel deployment artifact. Vercel's CLI warns that removing the
variable does not revoke the credential. **Rotate it.** It was never committed to git.

---

## 3. What the audit found

Three parallel read-only audits compared `packages/core`, `apps/api` and `apps/mobile` against
the architecture doc and the build prompt. Headline: **the implementation was far more complete
than it looked.** The dense one-statement-per-line style makes real modules look like stubs.

- `packages/core` — all eight required modules are genuine implementations, not wrappers.
  The §6.3 routing scorer is correct in every term, including the fairness floor and the
  cold-start floor. Dwell multipliers, quiet hours, grace, the approval gate and the close-out
  summary are all correct. Nothing in core can make a network call.
- `apps/api` — all 30 §13 endpoints are implemented and reachable. Membership assertion is
  structural, not per-handler. Both escalation paths (cron sweep and lazy read-time sweep)
  exist and share the one pure reducer, idempotent via a deterministic dedupe key and a DB
  unique constraint.
- `apps/mobile` — every screen in the route map is real and wired to live data. All 31
  component primitives exist. `Stepper` does support the dashed `skipped` node. Design tokens
  match the prototype byte-for-byte. `LocalRepository` is a full offline engine, not a stub.
  Typecheck is clean in all three workspaces.

So this session was not "build the missing half". It was closing a specific defect list.

---

## 4. What I changed

### Correctness defects fixed

| # | Defect | Fix |
|---|---|---|
| 1 | Duplicate detection applied the same-category gate to **both** bands, so cross-category "Related" threads were silently dropped. §9 gates only the ≥0.86 merge band. | `dedupe.ts` now returns everything ≥0.74 with a `mergeable` flag; the engine keys the merge prompt off that flag. |
| 2 | Notification budget counted "per day" on the **UTC** boundary, so a Dhaka pilot reset everyone's 6/day allowance at 06:00 local. | `budget.ts` takes the space timezone and compares local day keys; the engine passes `policy_snapshot.quiet_hours.tz`. |
| 3 | Quiet-hours deferral ignored the policy's `applies_below_priority` — it was hardcoded `"P1"`, so a policy that set it to `P2` would still defer P1 pushes. | The engine now reads the snapshot value and applies the §7.3 priority gate. |
| 4 | `?range=` on `GET /spaces/:id/analytics` was silently ignored; analytics were always all-time. | Added a range parser (`30`, `30d`; anything else means the term) and a cutoff filter. |
| 5 | Notification deep links pointed at `/thread/:id`, **a route that does not exist** — every push open would have dead-ended. | Now `/request/:id`. |
| 6 | `app.config.ts` silently discarded `app.json`, so the app icon, web favicon and the entire Android adaptive-icon block were never applied. | Merged into `app.config.ts`; deleted `app.json`. Verified with `expo config`. |
| 7 | The audit export called `Share.share`, which react-native-web does not implement — it threw in the browser. | Web branch downloads a JSON file; native keeps `Share.share`. |
| 8 | The CR Queue "Stalling" panel compared against wall-clock `Date.now()`, so under the fast clock (the demo path the spec calls the highest-leverage panel) it misreported. | Threshold now scales with the active time scale. |
| 9 | `app/(student)/card/[id].tsx` and `app/(student)/request/[id].tsx` were dead files — nothing navigated to them. | Deleted. See D3. |

### Product gaps closed

- **CR knowledge composer** required an explicit "Check for existing answers" tap before a
  Publish button appeared. §8.2 describes the duplicate check as something the composer runs
  *as part of* publishing. Now one button: it runs the check, publishes immediately when
  nothing similar exists, and holds once with "Publish anyway" when it finds a near-duplicate.
  This is the path the spec calls the intended onboarding path, so the friction mattered.
- **Fetch-first promise made visible.** A served answer now says "Answered from what this hub
  already knows. Nobody was notified." The whole product thesis is that nobody got bothered;
  the UI was not saying so.
- **Seed: unread counts.** §4.4 shows an unread count per hub in the switcher, but the seed
  created zero notifications so every count rendered 0. Added four unread in-app items across
  both hubs and two accounts, seeded as already-delivered so no dispatcher ever tries to send
  them.
- **Seed: card statuses.** See D2.
- **README.** Both the root README and `apps/api/README.md` (which was still create-next-app
  boilerplate). The build prompt explicitly requires the three phone-connection modes and the
  Hobby-cron caveat to be documented.
- **Profile** no longer renders the hub switcher — §8.1 enumerates the hub-scoped screens and
  Profile is not one of them.
- **Department Admin "Defaults for new hubs"** — the one genuinely missing panel from §14.4.
  It renders the three shipped ladders (Knowledge / Authority / Hybrid), quiet hours and the
  grace period, read from `defaultPolicy()` in core so it cannot drift from what new hubs
  actually get. Read-only by design: see D9.

### Tests
Four core tests and three API tests asserted things that were only true when the seed had zero
notifications (`db.notifications.length === 0`, `notifications[6]`, `notifications[0]`). Their
intent was "this action created nothing" and "the first *digest*", so I made them delta-based
and explicit rather than weakening them. One e2e test looked for an account named `Admin` when
the seeded account is `Department admin`.

---

## 5. Decisions and judgement calls

**D1 — Disarmed the model via environment, not code.** Reversible in one command, leaves the
diff clean, cannot be silently undone by a redeploy.

**D2 — Seed card split: 7 verified + 2 unverified + 2 stale (11 cards).** The two documents
conflict: the architecture doc §20 says "9 answer cards (7 verified, 2 unverified)"; the build
prompt §9 says "9 answer cards (7 verified, 2 unverified, 2 stale)" — which sums to 11 across
9 cards, and a card's status is a single enum so it cannot be both verified and stale. I chose
to satisfy every *status count* named and let the disputed total give. The two stale cards are
authored ones that aged out, so §8.3 (stale never auto-serves; CR can refresh) is demoable from
a fresh seed rather than only after the daily job runs. Previously it was 5/2/2.

**D3 — Kept the root `card`/`request` detail routes, deleted the `(student)` copies.** The
spec's route map lists them under `(student)`, but the thread and answer-card screens are
opened by CRs and instructors too. Nesting them in the student group would render student tabs
for a CR. The root copies are role-agnostic, and they were already the ones every navigation
call targeted. Deviation from the literal route map, deliberate.

**D4 — Left the `PINNED_REF` retrieval bonus keyed on the request's category.** §8.4 reads
`+0.08 (PINNED_REF and category == MATERIAL|INFORMATION)`, which most naturally means the
item's category; but §5.1(a) documents retrieval weighting driven by the *request's* category
("MATERIAL → pinned refs ↑↑"). Both readings have textual support, the current behaviour
matches §5.1(a), and changing it would alter retrieval ranking with no clear spec win. Flagged
rather than changed.

**D5 — Left the 72h dwell ceiling applied before the quiet-hours push.** §7.3 lists the
quiet-hours offset inside the formula and then states a 72h ceiling, so a step pushed out of
quiet hours can exceed 72h by up to the quiet window. Genuinely ambiguous; documented instead
of changed, because the existing behaviour ("never escalate inside quiet hours") is the one a
student would expect.

**D6 — Did not invent a `HYBRID` heuristic rule.** The `HYBRID` ladder (T1 4h → T2 8h → T4 12h)
is implemented and tested, but the heuristic provider never emits `HYBRID`: Build Prompt §5.2's
written rules map the relevant categories to `AUTHORITY`. Mid-flight class changes are also
correctly rejected to protect the policy snapshot. So `HYBRID` is reachable only from a model
provider — which is your morning's work. Inventing a rule would have contradicted the written
heuristic. Flagged, not patched.

**D7 — Left `digestDue()` in core as redundant.** The §11.3 "one digest per 4h" throttle is
already enforced, in SQL, in `dispatch.ts` (per user per space — which is what a member
actually experiences). The core helper duplicates it and is unused outside its own test.
Removing an exported, tested function unattended seemed worse than documenting it.

**D8 — Made broken tests precise rather than deleting or relaxing them.** Where a test broke
because the seed now has notifications, I changed it to measure the delta or to select the
digest explicitly. No assertion was weakened.

**D9 — The Admin defaults panel is read-only.** Making the templates *editable* needs a place
to store org-level defaults; there is no such table, so it would mean a schema change, a
migration, an endpoint and UI — too much to build unattended and half-finish. A read-only
panel driven by `defaultPolicy()` closes the missing section honestly and cannot drift from
reality. Making it editable is a clean follow-up.

**D10 — Added no card or sheet shadows, contradicting one audit finding.** The audit flagged
that cards have no shadows and read flatter than the prototype. I checked the prototype: its
cards are flat too. The only `box-shadow`s in it are the FAB (already implemented in RN with
`Platform.select`), the native toggle knob (the RN `Switch` provides its own), the demo phone
frame (chrome, not app UI), and the active switcher tab — whose RN counterpart uses a
deliberately different dark-pill treatment. So §11's shadow rule is satisfied where the
design actually calls for it. No change.

---

## 6. Left for you (and why)

**Model work — all of it, as you asked.**
- Re-arm `MODEL_ENDPOINT` / `MODEL_API_KEY` (§2) and rotate the key first.
- `RemoteProvider` is a thin `fetch` wrapper that posts `{task, text, context}`. **It does not
  speak the OpenAI Chat Completions format** — no `model` field, no `messages` array. Pointing
  it at `api.openai.com` as-is will 400. Either add the model identifier and message shaping,
  or point it at an endpoint that speaks its current contract. This is the one thing most
  likely to bite you, and it is why `MODEL_ENDPOINT` being set is not the same as the model
  working.
- `HYBRID` classification (D6) arrives with the model provider.

**Deferred, with reasons**
- **pgvector columns and `embedding_backfill`.** §12 declares `vector(1024)` columns and the
  build prompt permits declaring them unused. They are absent entirely. Adding dead columns has
  no behavioural effect while the lexical scorer runs, and embeddings are model work. The
  retrieval interface seam already exists so pgvector can drop in without touching callers.
- **`?assignee=` on `GET /approvals`** is ignored; it always means "me". No screen sends
  anything else.
- **`POST /spaces` instructor-behind-a-flag** branch (§3.2 `[DECIDE]`, recommendation was
  dept-only in schema with an instructor flag for the demo). Currently DEPT_ADMIN only, which
  is the safe half of the recommendation.
- **Department Admin "defaults" section** (default escalation policy templates for new spaces)
  is the one genuinely missing panel in §14.4.
- **Making the Admin defaults editable** (D9) — needs an org-defaults table and a migration.
- **Font weights 500 and 700** of Instrument Sans are loaded but never used; `bold` maps to
  600. Either use them or stop loading them — a small, safe cleanup either way.
- **`T3` sibling relay** is schema-only and the UI is hidden. That matches §21's own
  recommendation ("out; ship the schema, hide the UI"), so it is intentional, not missing.

---

## 7a. Deployment state as I left it

- Production API: `https://api-gamma-lilac-72.vercel.app` — redeployed with every change in
  this session, `/health` returns 200.
- Database: re-seeded. CSE 4790 now holds 12 pinned references and 11 answer cards
  (7 verified, 2 unverified, 2 stale); 4 unread in-app notifications across both hubs.
- All five cron jobs verified against production by hand: `escalation-tick`, `digest-builder`,
  `knowledge-staleness`, `score-recompute`, `metrics-rollup` all return 200, and a request
  without the `CRON_SECRET` correctly returns 401. `/health` now reports a real
  `last_cron_run`, so the job path genuinely writes through to the database.
- The deployment no longer bundles `.env` (verified in the build log).
- No model credentials exist in the production environment.

---

## 7. Verification

| Check | Before | After |
|---|---|---|
| `npm run typecheck` (all three workspaces, strict) | clean | clean |
| `npm run lint` | clean | clean |
| `npm test` — core | 28/28 | 28/28 |
| `npm test` — api (in-process PGlite, real migrations) | 5/5 | 5/5 |
| `npm run test:e2e` (Playwright, offline mode, web) | **1/4** | **4/4** |
| Deployed `/health` | 200 | 200, with a real `last_cron_run` |

The three e2e failures were genuine, not flaky:

1. The CR could not publish an answer card at all — the composer demanded a separate
   "Check for existing answers" tap and the test (like a user) looked for Publish.
2. The served-answer screen never stated that nobody was notified.
3. The department admin account could not be selected — it is named "Department admin" and
   the test looked for "Admin".

A fourth surfaced only after those were fixed: accepting an answer pushes to the thread, which
is a detail screen with no tab bar, so the flow dead-ended until you press Back. That is
correct behaviour for a pushed detail screen, so the test now presses Back, as a user would.

Every test run was local. Nothing in the suite makes a network call, and no model call was
made at any point in this session.

### The authenticated HTTP path, verified by hand

The e2e suite drives offline mode, and the unit tests drive the engine directly, so the
authenticated HTTP layer was the one thing never exercised end to end. I ran a local API
against the real database and walked it. All of this is the deterministic heuristic path —
no model involved.

| Quality bar (Build Prompt §13) | Result |
|---|---|
| #3 A known question returns a sourced answer, notifies nobody, sets `ANSWERED_BY_KB` | `SERVE`, state `ANSWERED_BY_KB`, 1 cited item, audience 0 ✓ |
| #4 A new question shows the real shortlist, then walks T1 → T2 → T4 | shortlist **10** = `clamp(ceil(38 × 0.25), 5, 12)`; walked T1 → T2 → T4 → approval gate under time travel ✓ |
| #5 An `AUTHORITY` request skips the peer tiers | a request containing "campus" classified `CAMPUS_ISSUE` → `AUTHORITY`, created directly at T4 ✓ |
| #6 An approval-gated step creates a CR approval card and notifies nobody above the CR | `approval_tasks` row `CR / PENDING / ESCALATE_TIER`; notification counts by role were **CR 3, STUDENT 35, INSTRUCTOR 0** ✓ |
| #13 A `STUDENT` token cannot call a CR-only endpoint | verify-card, edit-policy and author-card all returned **403** for a student and **200** for the CR; no token returned **401** ✓ |

The timeline written for that walk, which is what the thread screen renders:

```
T0  CHECKING  -> ROUTED             USER    Asked a targeted audience.
T2  ROUTED    -> ESCALATED          SYSTEM  No accepted answer at T1; moved to the full space.
T4  ESCALATED -> ESCALATED          SYSTEM  No accepted answer at T2; moved to the class representative.
T5  ESCALATED -> AWAITING_APPROVAL  SYSTEM  A human must approve sending this to the instructor.
```

The database was re-seeded afterwards, so none of this test traffic is left in the demo data.
