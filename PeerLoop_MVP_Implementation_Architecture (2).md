# PeerLoop — MVP Implementation Architecture

**Team:** BatteryLowInteractive · **Course:** IUT CSE 4790 Industrial Training
**Document status:** build specification, v1.0 (2026-09-20)
**Audience:** an implementing AI agent (Fable / GPT-6 Astra class) + the human dev team

---

## 0. How to read this document

This is a *build spec*, not a pitch. Every section is written so it can be handed to a coding agent with minimal interpretation.

- **MUST / SHOULD / MAY** are used in the RFC-2119 sense.
- Anything marked `[DECIDE]` is an open product decision — the agent must not silently invent an answer; surface it.
- Anything marked `[DEMO]` exists only to make the supervisor demo work and can be feature-flagged off in a real pilot.
- Names in `code font` are canonical identifiers — use them verbatim in the schema, API, and UI code.

The accompanying file `peerloop-ui-prototype-v2.html` is the **visual + interaction contract**. Where this document and the prototype disagree on wording, this document wins; where they disagree on layout, the prototype wins.

---

## 1. What we are building (and not building)

### 1.1 One-line definition
PeerLoop is a request-resolution layer for a university course community. A student asks once; PeerLoop answers from what it already knows, or routes the request to the smallest group of people who can resolve it, and keeps escalating until it is resolved or a human closes it.

### 1.2 MVP scope (this build)
1. **Multi-space support.** The app is no longer hardcoded to CSE 4790. A user belongs to N spaces and can switch between them.
2. **Ask flow with explicit space targeting** — a space selector directly under the compose box.
3. **Fetch-first knowledge check** before any human is notified.
4. **Two-axis escalation** (horizontal widening + vertical authority) driven by a *configurable* policy per space, with request-class and priority-tier multipliers.
5. **Knowledge hub per space**: pinned references (link-only, max 4 surfaced, full list behind an expand) + auto-generated answer cards from resolved requests.
6. **Four role-specific interfaces**: Student, Class Representative (CR), Course Instructor, Department.
7. **Duplicate consolidation** into a single thread.
8. **Private-by-default contribution tracking.**

### 1.3 Explicit non-goals for MVP
- No file hosting. PeerLoop stores **links and its own generated text only**. Course material stays in Google Classroom / Drive.
- No LMS/Classroom API integration (Phase 3). Roster import is CSV + join code.
- One Expo codebase for Android, iOS and web, running in Expo Go — no custom native modules and no app-store submission for the pilot.
- No public leaderboards, no karma economy, no anonymous posting.
- No DMs. PeerLoop is not a chat app; threads are request-scoped.
- No cross-university federation.

### 1.4 Pilot shape
- **1 real space**: one course, one batch/section, ~30–45 students, 1 CR, 1 instructor.
- **1 demo space** `[DEMO]`: a second course seeded with synthetic data so the space switcher, cross-space home feed, and department view are demonstrable.
- Duration: 2–3 weeks. Success metrics in §16.

---

## 2. Domain model & vocabulary

| Term | Meaning | Notes |
|---|---|---|
| `Space` | A hub — the unit of membership, routing, and knowledge isolation | MVP: one space == one course offering |
| `SpaceMembership` | A user's role *inside* one space | A user can be a student in one space and a CR in another |
| `Request` | Something a student needs resolved | Has class, category, priority, state |
| `Thread` | The conversation attached to a request | Merged duplicates share one thread |
| `AudienceTier` | A named group of people a request can be pushed to | See §6.2 |
| `EscalationPolicy` | The per-space, per-class timing ruleset | Editable by CR, lockable by instructor |
| `KnowledgeItem` | A retrievable unit in a space's knowledge base | Two kinds: `PINNED_REF`, `ANSWER_CARD` |
| `Notification` | One push/badge event to one user | Rate-budgeted per §11.3 |

**Isolation rule (MUST):** knowledge retrieval, routing, and search never cross a space boundary unless `space.allow_sibling_relay = true` *and* the sibling link is explicitly configured. Default `false`.

---

## 3. Roles & permissions

### 3.1 Role list
Space-scoped roles (stored on `space_memberships.role`):
- `STUDENT` — default member.
- `CR` — class representative. 1–2 per space.
- `INSTRUCTOR` — course teacher. 1–3 per space.

Org-scoped roles (stored on `org_memberships.role`):
- `DEPT_ADMIN` — department/coordinator. Creates spaces, assigns instructors, sees cross-space analytics.
- `SYS_ADMIN` — platform operator (us, during pilot).

Derived attributes (not roles — never used for permission checks):
- `helper_score` (float, per space) — drives targeted routing.
- `verified_helper` (bool, per space) — cosmetic badge, ≥5 accepted answers.

### 3.2 Permission matrix

| Action | STUDENT | CR | INSTRUCTOR | DEPT_ADMIN |
|---|---|---|---|---|
| Create request | ✅ | ✅ | ✅ | ➖ |
| Answer / comment | ✅ | ✅ | ✅ | ➖ |
| Accept answer on own request | ✅ | ✅ | ✅ | ➖ |
| Force-resolve someone else's request | ❌ | ✅ | ✅ | ❌ |
| Merge / unmerge duplicates | ❌ | ✅ | ✅ | ❌ |
| Re-prioritise a request | ❌ | ✅ | ✅ | ❌ |
| Pin a reference link | ❌ | ✅ | ✅ | ❌ |
| Author an answer card unprompted | ❌ | ✅ | ✅ | ❌ |
| Verify an answer card | ❌ | ✅ | ✅ | ❌ |
| Retire / flag-stale an answer card | ❌ | ✅ | ✅ | ❌ |
| Approve escalation past CR | ❌ | ✅ (initiates) | ✅ (receives) | ✅ |
| Edit escalation policy | ❌ | ✅ (unless locked) | ✅ | ✅ |
| Lock escalation policy | ❌ | ❌ | ✅ | ✅ |
| Broadcast announcement to space | ❌ | ✅ (w/ instructor ack for >P2) | ✅ | ✅ |
| Create a space / course | ❌ | ❌ | ✅ `[DECIDE]` | ✅ |
| Assign CR | ❌ | ❌ | ✅ | ✅ |
| Import roster / regenerate join code | ❌ | ✅ | ✅ | ✅ |
| View cross-space analytics | ❌ | ❌ | own spaces | ✅ |
| See another student's contribution stats | ❌ | ✅ (aggregate only) | ✅ (aggregate only) | ✅ (anonymised) |

**`[DECIDE]` — who creates courses?** Recommendation: `DEPT_ADMIN` creates the space and assigns the `INSTRUCTOR`; the instructor (or CR, delegated) imports the roster and names the CR. Rationale: keeps the space namespace clean and prevents duplicate spaces for the same course. For the demo, give the `INSTRUCTOR` role a "Create course" button behind a feature flag so a single demo account can show the whole flow.

### 3.3 The AI's own permissions (hard limits, MUST)
The agent may, unattended:
- read the space knowledge base and request history,
- classify, tag, deduplicate, and score,
- notify `T1`/`T2` audiences,
- post an answer **attributed to the knowledge base with a source link**,
- advance the escalation clock up to and including *notifying* the CR.

The agent may **never**, unattended:
- notify anyone above the CR (`T5`+),
- send a space-wide broadcast,
- close a request another human flagged as unresolved,
- commit the class to anything (deadline change, room booking, policy statement),
- alter a student's visible contribution record,
- expose a member's contact details.

Every blocked action becomes an **approval card** in the CR or instructor queue with the agent's proposed payload, a one-line rationale, and Approve / Edit / Decline.

---

## 4. Spaces (hubs) — the multi-space architecture

### 4.1 Why this changed
The previous prototype hardcoded `CSE 4790`. Everything below replaces that assumption.

### 4.2 Space object
```
Space {
  id, org_id
  kind: COURSE | BATCH | CLUB | DEPARTMENT   // MVP creates only COURSE
  code: "CSE 4790"            // display code
  title: "Industrial Training"
  term: "2026-Fall"
  section: "Batch 47 · Sec A" // nullable
  color_token: enum(flare|sage|indigo|amber|clay)  // for the switcher chips
  join_code: "4790-A7KQ"      // rotatable
  visibility: PRIVATE          // MVP: always private, join-code or roster only
  allow_sibling_relay: false
  policy_locked: false
  archived_at: null
}
```

A **space is the isolation boundary.** `request.space_id` is mandatory and immutable after creation (a CR may *move* a request, which is implemented as close-and-reopen with a back-reference, not an update).

### 4.3 Membership & joining
Three paths, in order of preference:
1. **Roster import** — CR/instructor uploads CSV (`student_id, name, email, section`). Creates `PENDING_INVITE` memberships; converted on first login matched by student ID or email.
2. **Join code** — student enters `4790-A7KQ` in "Join a space". Rotatable by CR; auto-expires at term end.
3. **Manual add** `[DEMO]` — instructor adds a user by student ID.

`space_memberships` carries: `role`, `joined_at`, `helper_score`, `notification_budget_override`, `muted_until`, `last_active_at`.

### 4.4 Space switching — UX contract
- **Home tab is cross-space.** It shows *the user's own* requests (created by them, or where they are an assigned responder) from **all** spaces, each card stamped with a space chip. This is deliberately the one global surface.
- **Hub tab is single-space.** A switcher sits at the top of the Hub. Tapping it opens a sheet listing every space the user belongs to (code, title, unread count, role chip) + `Join a space` + `Browse` for `DEPT_ADMIN`.
- The active hub is persisted per user (`users.active_space_id`) and survives app restart.
- **The switcher is global, not a screen.** Every hub-scoped screen — for every role — carries the switcher in its header: a compact space chip with a chevron that opens the same `SpaceSwitcherSheet`. A CR running two courses must be able to change hubs from Queue, Requests, Knowledge or Hub settings without navigating back to a home screen. Switching keeps the user on the **same screen in the new hub** (Knowledge → Knowledge), never bouncing them to a default tab; if the user's role differs in the target hub, the tab bar re-renders for that role and the closest equivalent screen is selected. The only screens without a switcher are the genuinely cross-hub ones: student Home, instructor Overview and "Needs you", and the whole Department group.
- **Ask tab targets a space explicitly** via a selector rendered *directly below the compose box* (pattern: the model switcher in Claude's composer). Default = `active_space_id`. The AI may *suggest* a different space if the text contains another space's course code; the suggestion appears as an inline chip ("Looks like CSE 4712 — switch?") and is never auto-applied.
- Changing the hub never changes what is on Home.

### 4.5 Sibling spaces (Phase 2, spec'd now)
`space_links (space_id, sibling_space_id, relation: SAME_COURSE_OTHER_SECTION | SAME_BATCH, relay_enabled)`. Used only by audience tier `T3`. Requires both CRs to opt in.

---

## 5. Request model

### 5.1 The three orthogonal axes
Do not collapse these. They drive different behaviour.

**(a) `category` — what kind of thing it is.** Drives tags, knowledge retrieval weighting, and analytics.
| `category` | Example | Retrieval weight |
|---|---|---|
| `MATERIAL` | "Anyone have the Week 6 slides?" | pinned refs ↑↑ |
| `INFORMATION` | "Where is the ITR submission form?" | pinned refs ↑, answer cards ↑ |
| `ACADEMIC_HELP` | "Explain this scheduling algorithm" | answer cards ↑, humans ↑↑ |
| `COORDINATION` | "Who is collecting the assignment?" | humans ↑↑ |
| `LOGISTICS_AUTHORITY` | "Can we get a Lab 3 extension?" | skip peers |
| `CAMPUS_ISSUE` | "Projector dead in Lab 3" | skip peers, vertical |

**(b) `request_class` — who can possibly resolve it.** This is the *escalation axis selector*, and it is the single most important classification the agent makes.
- `KNOWLEDGE` → anyone with the information can resolve → **horizontal** path (widen the audience over time).
- `AUTHORITY` → only someone with power to decide can resolve → **vertical** path (skip peers entirely, start at CR).
- `HYBRID` → peers may have a partial answer but a decision is eventually needed → start horizontal, hard-cut to vertical at `T4` on a shortened clock.

**(c) `priority` — how fast it must move.** Student proposes, agent validates, CR can override. Priority does not change the *path*, only the *clock* (and, at P0, the entry tier).

| `priority` | Label in UI | Clock multiplier | Entry behaviour |
|---|---|---|---|
| `P3` | Whenever | ×2.0 | normal |
| `P2` | Normal | ×1.0 | normal (default) |
| `P1` | Needed today | ×0.5 | normal |
| `P0` | Blocking now | ×0.15 | also pings CR immediately, in parallel |

**Anti-abuse (MUST):** a student may set at most 1 × `P0` and 3 × `P1` per space per rolling 7 days. On exhaustion the UI greys the option with "You've used your urgent requests this week — your CR can still raise this." The agent MAY downgrade a claimed priority if the text contains no deadline signal; the downgrade is shown to the requester with a one-line reason and an "Ask my CR to re-raise" action.

### 5.2 Request state machine
```
DRAFT
  └─> CHECKING           (agent retrieval running, no humans notified)
        ├─> ANSWERED_BY_KB     (confidence ≥ high; requester confirms → RESOLVED)
        ├─> MERGED             (duplicate of an open request; follows parent)
        └─> ROUTED             (pushed to an audience tier)
              ├─> IN_PROGRESS  (someone claimed it / replied)
              ├─> ESCALATED    (clock expired, moved to next tier)   ⟲ loops
              ├─> AWAITING_APPROVAL  (needs a human gate to go higher)
              ├─> RESOLVED     (accepted answer / CR force-resolve)
              └─> CLOSED_UNRESOLVED  (final tier exhausted, or requester withdrew)
```
Terminal: `RESOLVED`, `CLOSED_UNRESOLVED`, `MERGED`.
Every transition writes an immutable row to `request_events` (`from_state`, `to_state`, `actor_type: USER|AGENT|SYSTEM`, `actor_id`, `reason`, `at`). The thread timeline is rendered from this table — it is the audit trail the trust story depends on.

### 5.3 Fields
```
Request {
  id, space_id, author_id
  body_text
  category, request_class, priority
  tags: string[]                  // agent-extracted topics
  audience_tier: T0..T6
  state
  parent_request_id               // set when MERGED
  merged_count                    // denormalised, on the parent
  escalation_policy_snapshot_id   // policy is snapshotted at creation
  next_escalation_at              // nullable; the engine's only index
  grace_until                     // activity pause, see §7.5
  responder_ids[]                 // who has been notified so far (for dedupe)
  accepted_answer_id
  resolved_at, closed_reason
  created_at, updated_at
}
```

---

## 6. Routing architecture — who gets it first

### 6.1 The question this answers
*"Who are the first recipients, and who is the broader audience after the 6-hour timer?"*

**First recipients (`T1`) = a scored shortlist of ≤12 members of the space.**
**Broader audience (`T2`) = every member of the space.**
Everything above `T2` is vertical.

### 6.2 Audience tiers

| Tier | Name | Who | Typical size | Notification style |
|---|---|---|---|---|
| `T0` | Knowledge base | nobody | 0 | none |
| `T1` | Targeted peers | top-N scored members, same space | ≤12 | push, individual |
| `T2` | Full space | all `STUDENT` + `CR` members | 30–45 | push, batched digest |
| `T3` | Sibling spaces | linked sections/batch | 30–90 | digest only, opt-in |
| `T4` | Class representative | `CR` of the space | 1–2 | push, individual, always |
| `T5` | Instructor / coordinator | `INSTRUCTOR` | 1–3 | push, **requires CR approval** |
| `T6` | Department | `DEPT_ADMIN` | 1–2 | manual only, instructor-initiated |

### 6.3 `T1` candidate scoring (MUST implement exactly)
For every active member `m` of the space, excluding the author and anyone `muted_until > now`:

```
score(m) =  0.35 * topic_affinity(m, request.tags)
          + 0.20 * responsiveness(m)
          + 0.15 * recent_activity(m)
          + 0.15 * structural_proximity(m, author)
          + 0.15 * role_bonus(m)
          - 0.30 * load_penalty(m)
```

- `topic_affinity` — cosine similarity between the request embedding and the centroid of the member's last 20 accepted answers. Cold start (no answers) → 0.25 flat, so new members are not permanently invisible.
- `responsiveness` — `accepted_answers / notified_count` over the last 30 days, Laplace-smoothed (`(a+1)/(n+3)`).
- `recent_activity` — exponential decay on `last_active_at`, half-life 72h.
- `structural_proximity` — 1.0 same section + same lab group, 0.6 same section, 0.3 same space.
- `role_bonus` — `CR` 0.5, `verified_helper` 0.4, `INSTRUCTOR` 0.0 (instructors are **never** in `T1`; keeping them out of the peer tier is the whole point of the product).
- `load_penalty` — `notifications_sent_today(m) / daily_budget(m)`, clamped to 1.

Take `N = clamp(ceil(space_member_count * 0.25), 5, 12)`. If fewer than 5 candidates score above `0.2`, fall back to `T2` immediately rather than notifying a weak shortlist.

**Fairness floor (MUST):** at least 2 of the N slots are reserved for members whose `notified_count` in the last 7 days is in the bottom quartile. Without this, the same three helpful students absorb every request and burn out — the single most likely failure mode of this product.

### 6.4 Vertical entry
`request_class = AUTHORITY` skips `T1`/`T2`/`T3` and is created directly at `T4`. The UI must say so explicitly on the thread ("skipped the peer stage — this needs approval, not knowledge"), because silent skipping reads as a bug.

---

## 7. Escalation architecture

### 7.1 Policy object (per space, per `request_class`)
```
EscalationPolicy {
  id, space_id, request_class
  locked_by_instructor: bool
  quiet_hours: { start: "23:00", end: "07:00", tz: "Asia/Dhaka", applies_below_priority: "P1" }
  grace_period_minutes: 45
  steps: [
    { tier: "T1", dwell_minutes: 360,  requires_approval: false },
    { tier: "T2", dwell_minutes: 1440, requires_approval: false },
    { tier: "T4", dwell_minutes: 1440, requires_approval: false },
    { tier: "T5", dwell_minutes: null, requires_approval: true  },
    { tier: "T6", dwell_minutes: null, requires_approval: true, manual_only: true }
  ]
  final_action: CLOSE_UNRESOLVED_WITH_SUMMARY
}
```

### 7.2 Shipped defaults

**`KNOWLEDGE` (horizontal)**
| Step | Tier | Dwell (P2 baseline) |
|---|---|---|
| 1 | `T1` targeted peers | 6h |
| 2 | `T2` full space | 24h |
| 3 | `T4` class rep | 24h |
| 4 | `T5` instructor | approval-gated |
| 5 | close with summary | — |

**`AUTHORITY` (vertical)**
| Step | Tier | Dwell |
|---|---|---|
| 1 | `T4` class rep | 12h |
| 2 | `T5` instructor | approval-gated, auto-prompt at 12h |
| 3 | `T6` department | manual only |

**`HYBRID`**: `T1` 4h → `T2` 8h → `T4` 12h → `T5` approval-gated.

### 7.3 Effective dwell computation (MUST)
```
effective_dwell = base_dwell
                * priority_multiplier          // P3 2.0 | P2 1.0 | P1 0.5 | P0 0.15
                * (space.pace_override ?? 1.0) // CR-tunable global slider, 0.5–2.0
                + quiet_hours_offset           // see below
```
- `quiet_hours_offset`: if the computed `next_escalation_at` lands inside quiet hours **and** `priority` is at or below `applies_below_priority`, push it to `quiet_hours.end`. `P0` ignores quiet hours entirely.
- Floor: `effective_dwell >= 20 minutes` for any tier. Never allow a policy edit to produce a sub-20-minute cascade — it becomes a notification storm.
- Ceiling: 72h per step.

### 7.4 Who can change the timers, and how it looks
- CR: a **Response pace** panel in the CR interface with (a) a three-way preset — *Relaxed / Standard / Fast* mapping to `pace_override` 1.5 / 1.0 / 0.6 — and (b) an "Advanced" disclosure exposing each step's dwell as a number input with the floors/ceilings enforced client- and server-side.
- Instructor: same panel, plus a **Lock** toggle. When locked, the CR panel goes read-only with "Set by your course instructor."
- Per-request override: CR can `Hold` (pause the clock indefinitely, with a required reason shown on the thread) or `Escalate now` (jump to the next tier immediately). Both write `request_events`.
- Policy edits apply to **new** requests only. In-flight requests keep their `escalation_policy_snapshot`. This is non-negotiable — otherwise a CR fiddling with a slider retroactively fires twenty escalations.

### 7.5 The engine
- Single indexed column drives everything: `requests(next_escalation_at) WHERE state IN ('ROUTED','ESCALATED')`.
- Worker polls every 60s (`SELECT ... FOR UPDATE SKIP LOCKED`, batch 200). Idempotent: each tick writes `request_events` with a deterministic key `(request_id, tier, attempt)`; duplicate keys are no-ops.
- **Grace:** any substantive activity (a reply, a claim, an @-mention response) sets `grace_until = now + grace_period_minutes` and the engine skips the request until then. A reaction or a "following" tap is *not* substantive.
- **Approval gate:** when the next step has `requires_approval`, the engine does not notify. It sets `state = AWAITING_APPROVAL`, creates an `approval_tasks` row targeted at the CR, and notifies only the CR. If the CR does not act within `2 × dwell`, the instructor is notified that an approval is pending (this is a *notification*, not an escalation — the agent still hasn't acted alone).
- **Final action:** `CLOSE_UNRESOLVED_WITH_SUMMARY` — the agent writes a short summary of what was tried (tiers reached, people notified, elapsed time), posts it to the thread, sets `CLOSED_UNRESOLVED`, and files the request into the CR's weekly digest under "unresolved this week". Unresolved requests must be *visible*, not deleted — they are the evidence for the pilot metrics.

---

## 8. Knowledge architecture

### 8.1 Two tiers, one retrieval index

| Kind | `PINNED_REF` | `ANSWER_CARD` |
|---|---|---|
| Created by | CR / instructor, manually | Harvested from a resolved request, **or authored directly by a CR / instructor** |
| Contains | title, URL, note, category | question form, answer text, source attribution |
| Stores a file? | **Never** — URL only | **Never** — generated text only |
| Verification | implicit (a human pinned it) | `UNVERIFIED` → `VERIFIED` → `STALE`/`RETIRED` |
| Surfaced on | Hub → Pinned (max 4 + expand) | Hub → Already answered |

Both kinds live in one table with one embedding column, so retrieval is a single query.

**`origin` — two ways an answer card is born.** Harvesting from resolved requests is not the only path, and a knowledge base that can only grow *reactively* stays empty in week one, which is exactly when a pilot is judged.

| `origin` | Who | When | Initial status |
|---|---|---|---|
| `HARVESTED` | the agent | a request reaches `RESOLVED` | `UNVERIFIED` (or CR review queue) |
| `AUTHORED` | CR or instructor | any time, unprompted | `VERIFIED`, attributed to the author |
| `ANNOUNCEMENT` | instructor | posting an announcement | `VERIFIED`, also pinned + notified |

`source_request_id` is therefore **nullable**. An `AUTHORED` card skips the review queue — a human with the authority to verify wrote it — but is subject to every other rule: staleness, `false_positive_count` strikes, retirement, and the same retrieval scoring. It carries `created_by` as visible attribution ("From Rifat · class rep"), so a student can tell an authored answer from a harvested one.

A CR seeding fifteen authored cards on day one is the intended onboarding path, not an edge case. The analytics in §17 split resolution-at-`T0` by origin, because "answered from what the CR wrote down" and "answered from what the community produced" are different signals about whether the loop is actually closing.

### 8.2 Answer card lifecycle — *"how do new answers get added, and on which screen?"*

Path A — **authored**, from CR Knowledge → **Add knowledge** → *Write an answer*. Question, answer, category, expiry. Published `VERIFIED` immediately; no request involved, nobody notified unless the author opts in. Before publishing, the composer runs §8.4 retrieval against the draft question and, on a hit above 0.74, offers to **edit the existing card instead of creating a near-duplicate** — the same guard students get, pointed at the people most able to pollute the index.

Path B — **harvested**, automatically:

```
Request RESOLVED
   │
   ├─ requester accepted a human answer ─────┐
   └─ CR force-resolved with an answer ──────┤
                                             ▼
                              Agent drafts an ANSWER_CARD
                              (normalised question + answer +
                               source: thread link, responder credit)
                                             │
                          ┌──────────────────┴──────────────────┐
                          ▼                                      ▼
            auto_publish_unverified = true            auto_publish = false
            (default for MATERIAL/INFORMATION)        (default for ACADEMIC_HELP,
                          │                            always for anything the CR
                          ▼                            flagged sensitive)
      Appears immediately in Hub → Already answered              │
      with an "unverified" dot + "from a resolved request"       ▼
                          │                         Sits in CR queue →
                          └────────────┬────────────  "Answers to review"
                                       ▼
                        CR/instructor taps Verify
                                       ▼
                        VERIFIED — badge shown, retrieval
                        confidence boosted by +0.12
```

**Screens involved (explicit, because this was the open question):**
1. **Student — thread screen.** On resolution the thread shows an inline card: *"Saved to CSE 4790 knowledge so nobody has to ask again."* with a link to the created card, and a **"Don't save this"** control for the requester (privacy escape hatch — some requests are personal). One tap, no dialog.
2. **Student — Hub → Already answered.** The live list. Sorted by `verified DESC, last_retrieved_at DESC`. Each row: question, source line, verified/unverified dot. Tapping opens a read-only **Answer card screen** with the answer, its source thread, who contributed, and a "Still doesn't answer it → ask anyway" button that pre-fills the compose box.
3. **Student — Hub → search field.** Searches both tiers of the active space. Must be reachable in one tap from Home too (search icon in the Home topline) — the knowledge base is useless if it is three taps deep.
4. **CR — Knowledge tab → "Answers to review"** queue: Verify / Edit / Merge into an existing card / Discard.
5. **CR/Instructor — Knowledge tab → "Pinned references"**: add link, reorder (first 4 are what students see), retire.
6. **Instructor — "Recurring questions"** panel: clusters of ≥3 similar requests in the term with no `VERIFIED` card. This is the instructor's highest-value screen — it converts student confusion into a course fix.

### 8.3 Staleness (MUST)
Time-sensitive categories decay. `ANSWER_CARD.expires_at`:
- `MATERIAL`, `COORDINATION`, deadline-bearing `INFORMATION` → 21 days.
- `ACADEMIC_HELP`, conceptual `INFORMATION` → end of term.
On expiry → `STALE`: still retrievable, but the agent must prefix the served answer with "This was answered N weeks ago — check it's still current" and must **not** auto-resolve on it (confidence hard-capped at the "suggest" band). A CR tap refreshes `expires_at`.

### 8.4 Retrieval & confidence gating
Hybrid: BM25 over `title + body` ⊕ cosine over a 1024-dim embedding, reciprocal-rank-fused, filtered by `space_id` and `status != RETIRED`.

```
adjusted = base_similarity
         + 0.12 (VERIFIED)
         + 0.08 (PINNED_REF and category == MATERIAL|INFORMATION)
         - 0.15 (STALE)
         - 0.10 (card older than 60 days)
```

| Band | Action | Requester sees |
|---|---|---|
| `≥ 0.78` | **Serve.** No humans notified. State `ANSWERED_BY_KB`. | Answer + source + "That's what I needed" / "Still need help" |
| `0.55 – 0.78` | **Suggest + route in parallel.** | "This might be it… meanwhile we've asked 8 people" |
| `< 0.55` | **Route only.** | "Nothing on file yet — sending to 8 people in CSE 4790" |

If the requester taps "Still need help" after a serve, log `kb_false_positive` on that card; three strikes auto-flags it for CR review. This is the quality loop — without it the knowledge base rots silently.

---

## 9. Duplicate detection & consolidation

1. On create, embed the request and compare against **open** requests in the same space from the last 14 days.
2. `similarity ≥ 0.86` **and** same `category` → offer merge *before* notifying anyone: "3 others are asking this. Follow that one instead?" → `Follow` (state `MERGED`, `parent_request_id` set) or `Ask separately` (proceeds, and suppresses the prompt for that pair).
3. `0.74 – 0.86` → show as "Related" on the thread; no prompt.
4. CR can merge/unmerge manually from the queue at any time.
5. **Merged requests do not restart the clock.** The parent keeps its original `next_escalation_at`; `merged_count` increments and is shown to the audience ("4 people are waiting on this") — social proof is the cheapest escalation lever we have.
6. On resolution, every follower is notified simultaneously and every follower's Home card flips to Resolved.

---

## 10. Agent pipeline

Five deterministic steps. Each is a separate model call with a strict JSON contract — do **not** implement this as one mega-prompt; partial failure must be recoverable.

### Step 1 — `classify`
Input: `body_text`, space context (course code, current week, active deadlines from pinned refs), author's section.
Output (MUST validate against schema; on validation failure retry once, then fall back to `category=INFORMATION, request_class=KNOWLEDGE, priority=P2` and flag for CR):
```json
{
  "category": "MATERIAL|INFORMATION|ACADEMIC_HELP|COORDINATION|LOGISTICS_AUTHORITY|CAMPUS_ISSUE",
  "request_class": "KNOWLEDGE|AUTHORITY|HYBRID",
  "priority_suggested": "P0|P1|P2|P3",
  "priority_reason": "string, ≤12 words",
  "tags": ["string", "..."],
  "normalised_question": "string, ≤140 chars",
  "detected_space_hint": "CSE 4712 | null",
  "contains_personal_info": true|false
}
```
`contains_personal_info: true` ⇒ never auto-publish an answer card, and warn the author inline.

### Step 2 — `retrieve` (tool call, not generation)
`search_knowledge(space_id, query_embedding, query_text, k=8)` → ranked items with scores. Deterministic, logged.

### Step 3 — `decide`
Input: retrieval results + classification. Output:
```json
{ "action": "SERVE|SUGGEST|ROUTE", "answer_markdown": "…|null",
  "cited_item_ids": ["…"], "confidence": 0.0-1.0, "rationale": "≤20 words" }
```
Hard rule: `answer_markdown` MUST cite at least one `cited_item_id`, and every factual claim in it must be traceable to a cited item. **No answer may be generated from model world-knowledge.** If nothing was retrieved, the only legal action is `ROUTE`.

### Step 4 — `route` (deterministic code, no model)
Runs §6.3 scoring. Model is not in this loop — routing must be reproducible and explainable to a CR ("why did I get this?" → show the top three scoring terms).

### Step 5 — `monitor` (cron, no model)
The escalation engine of §7.5. Model is invoked again only for `CLOSE_UNRESOLVED_WITH_SUMMARY` and for drafting answer cards.

### Agent guardrails (MUST)
- Every agent-authored message in a thread is visually marked as agent-authored and carries its sources.
- Log every call: `agent_runs(request_id, step, model, prompt_hash, input_tokens, output_tokens, latency_ms, output_json, error)`. This table is the demo's credibility — supervisors will ask "how do you know it works?"
- Kill switch: `space.agent_enabled = false` degrades PeerLoop to manual routing without data loss.

---

## 11. Notifications

### 11.1 Channels (MVP)
In-app (authoritative) + Web Push. Email digest for CR/instructor only. `[DECIDE]` WhatsApp/Telegram bridge is deferred — it re-introduces the exact problem we are solving.

### 11.2 Events
`request.routed_to_you`, `request.widened`, `request.reply`, `request.resolved`, `request.merged_follow`, `escalation.awaiting_your_approval`, `approval.decided`, `knowledge.card_needs_review`, `digest.cr_daily`, `digest.instructor_weekly`.

### 11.3 Budget (MUST)
- Default 6 individual pushes per user per space per day. On exhaustion, further items go into that user's next digest instead of being dropped.
- `T2` broadcasts are **always** digest-batched (max one space-wide digest per 4h), except `P0`.
- Per-user controls: mute a space for 1h/8h/until tomorrow; "only notify me for my tags"; quiet hours.
- CRs cannot be muted below `T4` traffic — but their `P0` and approval pushes bypass everything.

---

## 12. Data model (Postgres 15+, `pgvector`)

```sql
-- identity
users(id pk, student_id uniq, name, email uniq, avatar_initials, active_space_id fk, created_at)
org_memberships(user_id, org_id, role)                         -- DEPT_ADMIN | SYS_ADMIN
spaces(id pk, org_id, kind, code, title, term, section, color_token,
       join_code uniq, allow_sibling_relay bool, agent_enabled bool default true,
       pace_override numeric default 1.0, policy_locked bool, archived_at)
space_memberships(id pk, space_id fk, user_id fk, role, joined_at,
                  helper_score numeric default 0, verified_helper bool default false,
                  notified_count_7d int, accepted_answers_30d int, notified_count_30d int,
                  last_active_at, muted_until, lab_group text,
                  unique(space_id, user_id))
space_links(space_id, sibling_space_id, relation, relay_enabled)

-- requests
requests(id pk, space_id fk, author_id fk, body_text, normalised_question,
         category, request_class, priority, tags text[],
         audience_tier, state, parent_request_id fk null, merged_count int default 0,
         policy_snapshot jsonb, next_escalation_at timestamptz, grace_until timestamptz,
         accepted_answer_id fk null, resolved_at, closed_reason,
         embedding vector(1024), created_at, updated_at)
request_events(id pk, request_id fk, from_state, to_state, tier, actor_type, actor_id,
               reason, dedupe_key uniq, at)
request_recipients(request_id fk, user_id fk, tier, notified_at, opened_at, responded_at,
                   score_snapshot jsonb, unique(request_id, user_id))
messages(id pk, request_id fk, author_id fk null, author_type USER|AGENT,
         body_markdown, cited_item_ids uuid[], is_accepted bool, created_at)

-- knowledge
knowledge_items(id pk, space_id fk, kind PINNED_REF|ANSWER_CARD, title, body_markdown,
                url text null, category, status UNVERIFIED|VERIFIED|STALE|RETIRED,
                origin HARVESTED|AUTHORED|ANNOUNCEMENT,
                source_request_id fk null, contributor_ids uuid[],
                pin_order int null, expires_at, last_retrieved_at,
                retrieval_hits int, false_positive_count int,
                embedding vector(1024), created_by fk, created_at)

-- governance
escalation_policies(id pk, space_id fk, request_class, steps jsonb, quiet_hours jsonb,
                    grace_period_minutes int, locked_by_instructor bool, updated_by, updated_at)
approval_tasks(id pk, space_id fk, request_id fk null, kind ESCALATE_TIER|BROADCAST|PUBLISH_CARD|CLOSE_COMPLAINT,
               payload jsonb, requested_by_type USER|AGENT, assignee_role, assignee_id,
               state PENDING|APPROVED|DECLINED|EXPIRED, decided_by, decided_at, note)
notifications(id pk, user_id fk, space_id fk, event_type, payload jsonb,
              read_at, delivered_channel, created_at)
agent_runs(id pk, request_id fk, step, model, prompt_hash, output_json jsonb,
           latency_ms, tokens_in, tokens_out, error, created_at)
metrics_daily(space_id, day, requests_created, kb_resolved, peer_resolved, cr_resolved,
              unresolved, median_first_response_minutes, duplicate_rate, escalation_rate)
```

**Indexes that matter:** `requests(next_escalation_at) WHERE state IN ('ROUTED','ESCALATED')`; `requests(space_id, state, created_at DESC)`; `requests(author_id, created_at DESC)` (Home feed); HNSW on both `embedding` columns; `request_recipients(user_id, notified_at DESC)`.

---

## 13. API surface (REST, `/api/v1`)

**Spaces**
```
GET    /spaces                        → user's spaces + unread counts (powers the switcher)
POST   /spaces                        → DEPT_ADMIN | INSTRUCTOR(flagged)
POST   /spaces/join           {code}
GET    /spaces/:id/members
POST   /spaces/:id/members/import     (CSV)
PATCH  /spaces/:id/members/:uid       {role}            → assign CR
POST   /spaces/:id/join-code/rotate
PATCH  /users/me/active-space {space_id}
```
**Requests**
```
POST   /requests              {space_id, body_text, priority_requested}
       → 200 { request, agent_outcome: SERVE|SUGGEST|ROUTE|DUPLICATE_PROMPT, … }
GET    /requests?scope=mine|space&space_id=&state=
GET    /requests/:id          → request + timeline(request_events) + messages
POST   /requests/:id/messages {body}
POST   /requests/:id/accept   {message_id}
POST   /requests/:id/follow            → merge into parent
POST   /requests/:id/escalate          → CR/instructor: jump a tier
POST   /requests/:id/hold     {reason} → pause the clock
PATCH  /requests/:id          {priority, category, request_class}   → CR/instructor
POST   /requests/:id/close    {reason}
```
**Knowledge**
```
GET    /spaces/:id/knowledge?kind=&status=&q=
POST   /spaces/:id/knowledge/pins     {title, url, note, category}
POST   /spaces/:id/knowledge/cards    {question, body, category, expires_in_days,
                                       notify_space:bool}   → AUTHORED, VERIFIED, CR+
POST   /spaces/:id/knowledge/cards/check {question} → near-duplicate check before publish
PATCH  /knowledge/:id                 {question?, body?, category?, expires_at?}
PATCH  /knowledge/:id/pin-order       {order}
POST   /knowledge/:id/verify | /retire | /refresh
GET    /spaces/:id/knowledge/review    → CR queue of UNVERIFIED cards
GET    /spaces/:id/knowledge/recurring → instructor cluster view
```
**Governance**
```
GET/PUT /spaces/:id/escalation-policy?request_class=
PUT     /spaces/:id/pace              {preset|override}
GET     /approvals?assignee=me
POST    /approvals/:id/decide {approve|decline, note}
GET     /spaces/:id/analytics?range=
GET     /orgs/:id/analytics            → DEPT_ADMIN cross-space
```
Auth: session cookie + per-space role check in middleware. **Every** handler must assert `space_membership` before touching a space-scoped row — this is the only thing standing between the pilot and a privacy incident.

---

## 14. Screen specifications

Navigation is role-switched at the tab bar. A user with multiple roles (CR of one space, student of another) sees a **role chip** in the Hub switcher and the tab bar reflects the role *in the active space*.

### 14.1 Student (4 tabs: Home · Ask · Hub · Profile)

**Home — cross-space.**
- Topline: wordmark, search icon (→ global knowledge search), notification bell.
- Greeting + one-line status ("2 of your requests need a look").
- Segmented: `Open` / `Resolved` / `Helping` — the third is requests where the user is in `request_recipients` and hasn't responded. This tab is how a helper finds work without a leaderboard.
- Cards carry a **space chip** (code + colour), title, tags, state pill, "updated Xm ago", and `merged_count` when >1.
- FAB → Ask.

**Ask.**
- Compose textarea.
- **Space selector directly below the box** — a pill button showing the active space code; tap opens a sheet of the user's spaces. Matches the Claude model-switcher pattern: always visible, never modal-blocking, one tap to change.
- Auto-extracted chips appear after typing pauses (course, category, section) — each tappable to correct.
- Priority selector: `Whenever / Normal / Needed today / Blocking now` with remaining-quota hint on the urgent options.
- Primary button: **Check for an answer** (never "Post" — the fetch-first promise is in the verb).
- Outcome A (KB hit): answer card, source line, confidence phrasing, `That's what I needed` / `Still need help`.
- Outcome B (no hit): routing preview — *"Sending to 8 people in CSE 4790 · Batch 47"* + the escalation preview line generated from the actual policy ("quiet for 6h → widens to 43 people; needs approval → goes straight to your CR").
- Outcome C (duplicate): the existing thread, `merged_count`, `Follow it` / `Ask separately`.

**Hub — single-space.**
- **Space switcher at the top**: chip with code + title + chevron → sheet listing all spaces (code, title, role chip, unread dot) + `Join a space`.
- Search field (scoped to this space).
- **Pinned by your CR** — section header with a right-aligned **`All (12) ›`** button. Shows **max 4** rows. Expand → *Pinned references* screen: full list, grouped by category, each row link-out, with `Added by · date`.
- **Already answered** — max 5 rows + `All ›` → *Answered* screen with filter chips (`All / Verified / This week`). Each row → Answer card screen.
- Empty state matters: a brand-new space must say what will appear here and offer `Ask something` — not a blank panel.

**Answer card screen.** Question, answer body, source attribution ("From a resolved request · 3 days ago", contributor initials), verified badge or unverified dot, `Open source thread`, `Still doesn't answer it` → prefilled compose.

**Thread screen.** Stepper reflecting the *actual* tier path (horizontal threads show Open → Widened → With CR → Resolved; vertical threads show Open → Peers (skipped) → With CR → Resolved, with the skipped node dashed). Plain-language explainer of why it moved. Merge banner when `merged_count > 1`. Messages with agent messages visually distinct + sourced. `Mark as resolved` disabled until an answer exists.

**Profile.** Private stats (helped, closed, median wait for you), Verified helper badge, opt-in leaderboard toggle (off), notification controls, per-space mute, `My spaces` list.

### 14.2 Class Representative (5 tabs: Queue · Requests · Knowledge · Space · Profile)

The CR interface is the operational cockpit. It must make the CR's job *smaller*, not bigger.

**Queue** — everything needing the CR personally, in priority order:
1. `Needs your approval` — approval cards (escalate to instructor, broadcast, publish sensitive card, close complaint). Each shows the agent's proposed payload + rationale + Approve / Edit / Decline.
2. `Escalated to you` — requests that reached `T4`. Actions: `Answer`, `Pin as reference`, `Reassign to a peer`, `Hold` (reason required), `Escalate now`.
3. `Answers to review` — `UNVERIFIED` cards: Verify / Edit / Merge / Discard.
4. `Stalling` — requests in `T1`/`T2` within 1h of their next escalation, so the CR can pre-empt. This is the panel that actually prevents escalations.
- Header strip: median response time this week vs last, open count, unresolved count.

All five CR tabs carry the header hub switcher (§4.4) — a rep with two courses switches in place, without losing the screen they were on.

**Requests** — full space list with filters (state, tier, category, priority, mine/all), bulk merge, and a single-tap `Move to…` for misfiled requests.

**Knowledge** — pinned reference manager (add link, reorder — an explicit "shown to students" divider after row 4, retire), answer-card review queue, stale-card list with one-tap refresh, and a `Post an answer without a question` composer for proactive FAQs.

**Space** — members (role assignment for co-CR only), join code + rotate, roster import, **Response pace** panel (§7.4) with the Advanced disclosure, quiet-hours editor, and a read-only banner when the instructor has locked the policy.

### 14.3 Course Instructor (4 tabs: Overview · Needs me · Insights · Course)

Instructors will not do daily triage. Design for weekly attention.

**Overview.** Cards per space they teach: open/unresolved counts, median first response, escalations to them this week, top 3 recurring topics.

**Needs me.** Only `T5` items and approvals that reached them. Actions: `Answer`, `Answer and publish as a verified card` (single tap — this is how official answers enter the knowledge base), `Delegate back to CR`, `Decline with note`.

**Insights.** The differentiating screen:
- **Recurring questions** — clusters of ≥3 similar requests with no verified card. Actions: `Publish an official answer`, `Pin a reference`, `Mark as addressed in class`.
- **Confusion timeline** — request volume by topic by week, overlaid with assessment dates. Answers "what did my students not understand after Week 6?"
- **Escalation health** — how many requests peers resolved without the CR (the number that proves the product works), and how many died unresolved.

**Course.** Escalation policy editor + **Lock** toggle, announcement composer (goes out as a `PINNED_REF` + notification, never as a bare push), CR assignment, roster.

### 14.4 Department (3 tabs: Spaces · Analytics · Admin)

**Spaces.** All spaces in the department: code, instructor, CR, members, health dot (green/amber/red from unresolved rate + median response). `Create course` → form (code, title, term, section, instructor, colour) → issues a join code. `Archive`.

**Analytics.** Cross-space, anonymised. Response-time distribution, unresolved rate by course, top systemic issues (topics recurring across ≥2 spaces — e.g. "submission portal" appearing in four courses is a department problem, not a course problem), CR workload comparison (to spot an overloaded rep).

**Admin.** Instructor and dept-admin accounts, default escalation policy templates applied to new spaces, term rollover (archive all, carry forward verified knowledge cards `[DECIDE]`), data export, agent kill switch per space.

---

## 15. Background jobs

| Job | Cadence | Does |
|---|---|---|
| `escalation_tick` | 60s | §7.5 engine |
| `notification_dispatch` | 30s | drains the queue, enforces budgets |
| `digest_builder` | hourly | space digests, CR daily, instructor weekly |
| `embedding_backfill` | on write + 5m sweep | requests and knowledge items |
| `knowledge_staleness` | daily 03:00 | flips `expires_at` → `STALE` |
| `score_recompute` | daily 03:30 | `helper_score`, responsiveness, 7d/30d counters |
| `metrics_rollup` | daily 04:00 | `metrics_daily` |
| `quota_reset` | daily | P0/P1 rolling windows |

---

## 16. Metrics & instrumentation

**Primary pilot hypotheses and their tests:**
| Hypothesis | Metric | Target vs baseline |
|---|---|---|
| Requests get answered faster than in group chat | median time to first useful response | ≤ 50% of the class's self-reported chat baseline |
| Fetch-first removes work | % requests resolved at `T0` with no human notified | ≥ 20% by week 3 |
| Duplicates shrink | repeat-question rate (clusters ≥2 / total) | ↓ week over week |
| Escalation ends abandonment | `CLOSED_UNRESOLVED` rate | ≤ 10% |
| CR workload drops | requests resolved before reaching `T4` | ≥ 65% |
| Notification fatigue is controlled | median pushes per student per day | ≤ 3 |

Event stream (client + server): `request_created`, `kb_served`, `kb_accepted`, `kb_rejected`, `duplicate_prompt_shown/accepted`, `tier_notified{tier,size}`, `first_response{minutes}`, `answer_accepted`, `escalated{from,to,auto|manual}`, `approval_requested/decided`, `card_created/verified/retired`, `space_switched`, `notification_sent/opened/muted`.

**Baseline capture (do this in week 0):** survey 20–30 students — "how long did your last group-chat question take to get answered, and did it ever?" Without the baseline, none of the above numbers mean anything to a supervisor.

---

## 17. Trust, privacy, safety

- **No file storage, ever.** Enforce at the API: the pin endpoint accepts a URL, not an upload. Say it in the UI where CRs pin.
- **Attribution on every agent answer**, with a link to the source item. No source ⇒ no answer.
- **Personal-info gate:** `contains_personal_info` requests are never auto-published as cards and show an inline warning before sending.
- **Contribution stats are private by default.** Leaderboard is opt-in per student, per space, and shows only opted-in members.
- **Roster data is minimal**: name, student ID, email, section. No phone numbers, no photos in MVP.
- **Request visibility:** all requests in a space are visible to space members. State this at join time — there is no anonymous mode, and pretending otherwise would be worse.
- **Audit:** `request_events` + `agent_runs` are append-only and exportable. A CR can always answer "why did this happen?"
- **Rate limits:** 10 requests/user/day/space, 40 messages/user/day. Abuse → CR can mute a member from creating requests for 24h (not from reading).

---

## 18. Stack & repo layout

Two apps in one repo, sharing one package of domain logic.

**Frontend: Expo (React Native) — Android, iOS and web from one codebase.**
- `npx create-expo-app@latest --template blank-typescript`, plus `expo-router` for file-based navigation.
- Must run unmodified in **Expo Go** (no custom native modules, no `expo prebuild`, no config plugins needing a dev client). The supervisor demo happens by scanning a QR code from a Mac terminal.
- Web target via `react-native-web`, so the phone demo and the laptop demo are the same build.
- Fonts `@expo-google-fonts/fraunces` + `@expo-google-fonts/instrument-sans`; state via `zustand`; local cache via `@react-native-async-storage/async-storage`; the session token in `expo-secure-store`. **Never** `localStorage` — it does not exist on native.

**Backend: Next.js (App Router) on Vercel.**
- Route handlers under `app/api/v1/…` implementing §13 exactly. No pages, no UI — this deployment is an API, plus a thin `/health` page.
- Postgres (Neon or Supabase Postgres used purely as a database) with **Drizzle** or **Prisma**; `pgvector` only if a hosted embedding endpoint is wired up, otherwise the lexical scorer in §8.4 runs in SQL + TypeScript and the column stays unused.
- Auth: institutional-email magic link → signed JWT (`jose`), 30-day refresh, `Authorization: Bearer` from the app.
- **Every agent call happens server-side** in a route handler. Model keys live in Vercel environment variables and never enter the Expo bundle, which is trivially decompilable.

**The serverless constraint that shapes the escalation engine.** There is no long-running process on Vercel, so §7.5's worker becomes two things that must both exist:
1. `POST /api/cron/escalation-tick` — an idempotent sweep, protected by a `CRON_SECRET` header, driven by Vercel Cron (`vercel.json`). Note the plan limits: Hobby cron fires **once a day**, which is useless here. Either run Pro (per-minute cron) or point an external pinger at the endpoint during the pilot.
2. **Lazy evaluation on read.** Any handler that reads requests for a space first runs the sweep for that space. This makes escalation correct even if cron never fires, and it is what keeps the demo honest on a Hobby plan.
Both paths call the same pure function and write `request_events` with a deterministic dedupe key, so running them concurrently is a no-op.

**Shared logic lives in `packages/core`** and is imported by both apps: types, the classifier, the retrieval scorer, the duplicate detector, the routing scorer, the dwell calculator and the escalation reducer. The mobile app uses them to render accurate previews ("8 people, widens in 6h") without a round trip; the API uses them as the authority. One implementation, two consumers — never two copies that drift.

```
apps/mobile/            Expo + expo-router
  app/                  routes, grouped by role
  components/           design-system primitives
  theme/tokens.ts       mirrors the prototype CSS vars
  lib/repo/             http.ts local.ts index.ts
  data/seed.ts          offline demo data
  store/                zustand slices
apps/api/               Next.js on Vercel
  app/api/v1/…          route handlers per §13
  app/api/cron/…        escalation-tick, digest-builder, staleness
  db/                   schema.ts, migrations, seed.ts
  lib/agent/            provider.ts (server-side model calls only)
  vercel.json           cron schedules
packages/core/          types + all shared domain logic
```

## 19. Build order (3–4 week MVP)

**Sprint 0 — skeleton (2 days).** Schema, auth, space membership, join code, seed script. Acceptance: two users in two spaces, switcher works, no requests yet.

**Sprint 1 — request spine (4 days).** Create → `ROUTED` → thread → reply → accept → `RESOLVED`. `request_events` timeline. Home cross-space feed. Acceptance: a request can complete its life with zero AI.

**Sprint 2 — knowledge + fetch-first (4 days).** Pinned refs (max-4 + expand), retrieval, confidence gating, answer-card generation, review queue. Acceptance: asking a previously-answered question returns a sourced answer and notifies nobody.

**Sprint 3 — routing + escalation (5 days).** `T1` scoring, engine, policy editor, pace presets, priority multipliers, approval gates. Acceptance: with dwell set to 2 minutes, a request visibly walks `T1 → T2 → T4` and stops at the approval gate.

**Sprint 4 — role interfaces (4 days).** CR cockpit, instructor Insights, department Spaces/Analytics. Acceptance: each role can complete its top-3 jobs without touching another role's screen.

**Sprint 5 — polish + pilot prep (3 days).** Duplicates, notification budgets, metrics dashboard, empty states, demo seed data, kill switch. Acceptance: a cold supervisor can be walked through all four roles in 8 minutes.

**Demo shortcut `[DEMO]`:** a `?demo=fast` flag that divides every dwell by 60 (6h → 6min) so escalation is observable live. Ship it behind an env var.

---

## 20. Seed data for the demo

- **Space A (real pilot):** `CSE 4790 · Industrial Training · Batch 47 Sec A` — 38 students, CR `Rifat`, instructor `Dr. Nasrin`. Colour `flare`.
- **Space B `[DEMO]`:** `CSE 4712 · Software Engineering · Batch 47 Sec A` — 41 students, same CR, instructor `Dr. Kamal`. Colour `indigo`.
- Pre-seed Space A with: 12 pinned references (so the "max 4 + expand" is real), 9 answer cards (7 verified, 2 unverified), 6 resolved requests, 2 open requests — one horizontal at `T2`, one vertical at `T4` — and one 4-way merged thread.
- Pre-seed Space B thinly, so the switcher shows a genuinely different hub rather than a clone.
- One recurring cluster ("Where do we submit the ITR report?" × 4) so the instructor Insights screen has something real to show.

---

## 21. Open decisions (`[DECIDE]`) — resolve before Sprint 3

1. **Course creation authority.** Dept-only (clean) vs instructor-can-create (faster demo). Recommendation: dept-only in the schema, instructor behind a flag.
2. **Term rollover.** Do verified answer cards carry into next term's space? Recommendation: yes, copied as `UNVERIFIED` for re-verification — deadlines change, concepts don't.
3. **`T3` sibling relay.** In or out of MVP? Recommendation: out; ship the schema, hide the UI.
4. **External bridge.** A WhatsApp/Telegram notification bridge would boost adoption but weakens the "stop living in chat" thesis. Recommendation: a read-only daily digest link at most.
5. **CR count.** 1 or 2 per space, and does `T4` notify both or round-robin? Recommendation: both notified, first responder claims.
6. **Anonymous asking.** Repeatedly requested by students, repeatedly corrosive to accountability. Recommendation: no in MVP; revisit with "visible to CR only" as the middle ground.
7. **Instructor visibility of who asked.** Full names vs aggregate. Recommendation: names on `T5` items they receive, aggregate everywhere else.

---

## 22. Definition of done for the MVP

A student in either space can ask a question and get a sourced answer with nobody notified; ask a new question and watch it reach 8 named peers, widen to the batch, land with the CR, and stop at an approval gate; a CR can tune the pace, verify an answer, and approve an escalation; an instructor can see what their class keeps getting stuck on and publish an official answer in one tap; a department admin can create a second course and see both. Every one of those steps is recorded in `request_events` and reproducible from `agent_runs`.
