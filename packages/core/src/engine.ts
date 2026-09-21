import { assertMethod } from "./http-contract";
import type {
  Analytics,
  ApprovalTask,
  CreateOutcome,
  Database,
  EscalationPolicy,
  Json,
  KnowledgeItem,
  Message,
  Request,
  RequestState,
  SpaceMembership,
  SpaceRole,
  SpaceSummary,
  Thread,
  Tier,
} from "./types";
import { terminalStates } from "./types";
import { DomainError, assertPermission, type permissions } from "./permissions";
import {
  cardInputSchema,
  classSchema,
  createRequestSchema,
  inputSchemas,
  pinInputSchema,
  policySchema,
} from "./schemas";
import { classify, type LLMProvider } from "./agent/classify";
import { findDuplicates } from "./knowledge/dedupe";
import { jaccard, searchKnowledge, tokenize } from "./knowledge/search";
import { harvestAnswer } from "./knowledge/ingest";
import { scoreAudience } from "./routing/score";
import { defaultPolicy, nextDeadline, inQuietHours } from "./escalation/dwell";
import {
  escalationReducer,
  type EscalationDecision,
} from "./escalation/reducer";
import { notificationChannel } from "./notify/budget";
// `?range=` accepts a day count ("30") or a shorthand ("7d", "30d"). Anything else,
// including "term", means the whole term and returns undefined.
function parseRangeDays(range: string | null): number | undefined {
  if (!range) return undefined;
  const days = Number(/^(\d+)d?$/.exec(range.trim())?.[1]);
  return Number.isFinite(days) && days > 0 ? days : undefined;
}
export interface EngineContext {
  user_id: string;
  now: number;
  time_scale?: number;
  provider?: LLMProvider;
  measure?: () => number;
}
export class Engine {
  private sequence = 0;
  private lastMeasure = 0;
  constructor(
    public db: Database,
    public ctx: EngineContext,
  ) {
    this.lastMeasure = ctx.measure?.() ?? 0;
  }
  id(prefix: string) {
    return `${prefix}-${this.ctx.now.toString(36)}-${this.ctx.user_id}-${(this.db.request_events.length + this.db.knowledge_items.length + this.db.messages.length + this.db.notifications.length).toString(36)}-${++this.sequence}`;
  }
  iso() {
    return new Date(this.ctx.now).toISOString();
  }
  user() {
    const u = this.db.users.find((u) => u.id === this.ctx.user_id);
    if (!u)
      throw new DomainError("UNAUTHENTICATED", "Sign in to continue.", 401);
    return u;
  }
  org(org_id: string) {
    const m = this.db.org_memberships.find(
      (m) => m.user_id === this.ctx.user_id && m.org_id === org_id,
    );
    if (!m)
      throw new DomainError("FORBIDDEN", "Department access is required.", 403);
    return m;
  }
  membership(space_id: string): SpaceMembership {
    this.user();
    const m = this.db.space_memberships.find(
      (m) =>
        m.space_id === space_id &&
        m.user_id === this.ctx.user_id &&
        m.status === "ACTIVE",
    );
    if (!m)
      throw new DomainError(
        "FORBIDDEN",
        "You are not a member of this hub.",
        403,
      );
    return m;
  }
  guard(space_id: string, action?: keyof typeof permissions) {
    const m = this.membership(space_id);
    if (action) assertPermission(m.role, action);
    return m;
  }
  space(id: string) {
    this.guard(id);
    const s = this.db.spaces.find((s) => s.id === id);
    if (!s) throw new DomainError("NOT_FOUND", "Hub not found.", 404);
    return s;
  }
  request(id: string) {
    const r = this.db.requests.find((r) => r.id === id);
    if (!r) throw new DomainError("NOT_FOUND", "Request not found.", 404);
    this.guard(r.space_id);
    return r;
  }
  card(id: string) {
    const k = this.db.knowledge_items.find((k) => k.id === id);
    if (!k) throw new DomainError("NOT_FOUND", "Answer not found.", 404);
    const m = this.guard(k.space_id);
    if (!k.published && m.role === "STUDENT")
      throw new DomainError(
        "NOT_FOUND",
        "This answer is awaiting review.",
        404,
      );
    return k;
  }
  event(
    r: Request,
    to: RequestState,
    reason: string,
    tier = r.audience_tier,
    key = this.id("event"),
    actor: "USER" | "AGENT" | "SYSTEM" = "USER",
  ) {
    if (this.db.request_events.some((e) => e.dedupe_key === key)) return false;
    this.db.request_events.push({
      id: this.id("evt"),
      request_id: r.id,
      from_state: r.state,
      to_state: to,
      tier,
      actor_type: actor,
      actor_id: actor === "USER" ? this.ctx.user_id : null,
      reason,
      dedupe_key: key,
      at: this.iso(),
    });
    r.state = to;
    r.updated_at = this.iso();
    if (terminalStates.includes(to)) {
      r.next_escalation_at = null;
      r.grace_until = null;
      r.held_reason = null;
      for (const task of this.db.approval_tasks.filter(a => a.request_id === r.id && a.state === "PENDING")) {
        task.state = "EXPIRED";
        task.decided_at = this.iso();
        task.note = "The request is no longer active.";
      }
    }
    return true;
  }
  requireOpen(r: Request) {
    if (terminalStates.includes(r.state)) throw new DomainError("CLOSED", "This request is already closed.");
  }
  log(r: Request, step: string, output: unknown, error: string | null = null) {
    const measured = this.ctx.measure?.() ?? 0;
    const elapsed = Math.max(0, Math.round(measured - this.lastMeasure));
    this.lastMeasure = measured;
    this.db.agent_runs.push({
      id: this.id("run"),
      request_id: r.id,
      step,
      model: this.ctx.provider?.name ?? "deterministic-v1",
      prompt_hash: `${step}-v1`,
      output_json: JSON.parse(JSON.stringify(output)) as Json,
      latency_ms: elapsed,
      tokens_in: 0,
      tokens_out: 0,
      error,
      created_at: this.iso(),
    });
  }
  notify(
    r: Request,
    user_id: string,
    event_type: string,
    text: string,
    approval = false,
  ) {
    const member = this.db.space_memberships.find(
      (m) => m.space_id === r.space_id && m.user_id === user_id,
    );
    const user = this.db.users.find((u) => u.id === user_id);
    const urgent = r.priority === "P0" || approval;
    const muted =
      !urgent &&
      r.audience_tier !== "T4" &&
      member?.muted_until &&
      Date.parse(member.muted_until) > this.ctx.now;
    // §7.3: quiet hours only apply at or below the policy's applies_below_priority; P0 ignores them.
    const quietApplies =
      r.priority !== "P0" &&
      Number(r.priority[1]) >=
        Number(r.policy_snapshot.quiet_hours.applies_below_priority[1]);
    const quiet =
      user && quietApplies
        ? inQuietHours(this.ctx.now, {
            start: user.preferences.quiet_start,
            end: user.preferences.quiet_end,
            tz: r.policy_snapshot.quiet_hours.tz,
            applies_below_priority:
              r.policy_snapshot.quiet_hours.applies_below_priority,
          })
        : false;
    const tagFiltered =
      user?.preferences.tags_only &&
      r.author_id !== user_id &&
      !r.tags.some((t) => user.preferences.tags.includes(t));
    const channel =
      !urgent &&
      (muted || user?.preferences.notifications === false || tagFiltered)
        ? "IN_APP"
        : !urgent && quiet
          ? "DIGEST"
          : notificationChannel(
              this.db.notifications,
              user_id,
              r.space_id,
              r.audience_tier,
              r.priority,
              this.ctx.now,
              member?.notification_budget_override ?? 6,
              approval,
              r.policy_snapshot.quiet_hours.tz,
            );
    this.db.notifications.push({
      id: this.id("notification"),
      user_id,
      space_id: r.space_id,
      event_type,
      payload: { request_id: r.id, text },
      read_at: null,
      delivered_channel: channel,
      delivery_state: "PENDING",
      created_at: this.iso(),
      delivered_at: null,
      error: null,
    });
  }
  audience(r: Request, tier: Tier) {
    const members = this.db.space_memberships.filter(
      (m) => m.space_id === r.space_id && m.status === "ACTIVE",
    );
    const author = members.find((m) => m.user_id === r.author_id)!;
    let picked: {
      member: SpaceMembership;
      terms:
        ReturnType<typeof scoreAudience>["shortlist"][number]["terms"] | null;
    }[] = [];
    if (tier === "T1") {
      const scored = scoreAudience(members, author, r.tags, this.ctx.now);
      tier = scored.tier;
      this.log(
        r,
        "route",
        scored.shortlist.map((s) => ({
          user_id: s.member.user_id,
          terms: s.terms,
        })),
      );
      picked =
        tier === "T1"
          ? scored.shortlist
          : members
              .filter((m) => m.role !== "INSTRUCTOR")
              .map((member) => ({ member, terms: null }));
    } else
      picked = members
        .filter((m) =>
          tier === "T2"
            ? m.role !== "INSTRUCTOR"
            : tier === "T4"
              ? m.role === "CR"
              : tier === "T5"
                ? m.role === "INSTRUCTOR"
                : false,
        )
        .map((member) => ({ member, terms: null }));
    r.audience_tier = tier;
    for (const { member, terms } of picked) {
      if (member.user_id === r.author_id && tier !== "T4" && tier !== "T5")
        continue;
      if (r.responder_ids.includes(member.user_id)) {
        if (tier === "T4" || tier === "T5")
          this.notify(r, member.user_id, "request.widened", r.body_text);
        continue;
      }
      r.responder_ids.push(member.user_id);
      this.db.request_recipients.push({
        request_id: r.id,
        user_id: member.user_id,
        tier,
        notified_at: this.iso(),
        opened_at: null,
        responded_at: null,
        score_snapshot: terms,
      });
      this.notify(r, member.user_id, "request.routed_to_you", r.body_text);
      member.notified_count_7d++;
      member.notified_count_30d++;
      member.notifications_sent_today++;
    }
    if (tier === "T6") {
      const org = this.db.spaces.find((s) => s.id === r.space_id)?.org_id;
      this.db.org_memberships
        .filter((m) => m.org_id === org)
        .forEach((m) => {
          if (!r.responder_ids.includes(m.user_id)) {
            r.responder_ids.push(m.user_id);
            this.notify(
              r,
              m.user_id,
              "request.routed_to_you",
              r.body_text,
              true,
            );
          }
        });
    }
    r.next_escalation_at = nextDeadline(
      this.ctx.now,
      tier,
      r.priority,
      r.policy_snapshot,
    );
  }
  approval(r: Request, tier: Tier, reason: string) {
    if (
      this.db.approval_tasks.some(
        (a) =>
          a.request_id === r.id &&
          a.state === "PENDING" &&
          a.payload.tier === tier,
      )
    )
      return;
    const role = tier === "T6" ? "INSTRUCTOR" : "CR";
    const task: ApprovalTask = {
      id: this.id("approval"),
      space_id: r.space_id,
      request_id: r.id,
      kind: "ESCALATE_TIER",
      payload: { tier, rationale: reason },
      requested_by_type: "AGENT",
      assignee_role: role,
      assignee_id: null,
      state: "PENDING",
      decided_by: null,
      decided_at: null,
      note: null,
    };
    this.db.approval_tasks.push(task);
    this.db.space_memberships
      .filter((m) => m.space_id === r.space_id && m.role === role)
      .forEach((m) =>
        this.notify(
          r,
          m.user_id,
          "escalation.awaiting_your_approval",
          reason,
          true,
        ),
      );
  }
  apply(r: Request, d: EscalationDecision) {
    if (d.action === "WAIT") return;
    if (
      !this.event(
        r,
        d.action === "ADVANCE"
          ? "ESCALATED"
          : d.action === "APPROVAL"
            ? "AWAITING_APPROVAL"
            : "CLOSED_UNRESOLVED",
        d.reason,
        d.tier,
        d.dedupe_key,
        "SYSTEM",
      )
    )
      return;
    r.attempt++;
    r.next_escalation_at = d.next_escalation_at;
    this.log(r, "monitor", d);
    if (d.action === "ADVANCE") this.audience(r, d.tier);
    if (d.action === "APPROVAL") this.approval(r, d.tier, d.reason);
    if (d.action === "CLOSE") this.closeSummary(r, d.reason);
  }
  closeSummary(r: Request, reason: string) {
    r.closed_reason = reason;
    const tiers = [...new Set(this.db.request_events.filter(e => e.request_id === r.id).map(e => e.tier))];
    this.db.messages.push({id: this.id("summary"), request_id: r.id, author_id: null, author_type: "SYSTEM", body_markdown: `${reason}\n\nTiers reached: ${tiers.join(" → ")}. People notified: ${r.responder_ids.length}. Elapsed: ${Math.max(0, Math.round((this.ctx.now - Date.parse(r.created_at)) / 60000))} minutes.`, cited_item_ids: [], is_accepted: false, created_at: this.iso()});
    this.notify(r, r.author_id, "request.closed", reason);
  }
  remindApprovals(space_id?: string) {
    for (const a of this.db.approval_tasks.filter(a => a.state === "PENDING" && a.assignee_role === "CR" && (!space_id || a.space_id === space_id))) {
      const r = this.db.requests.find(r => r.id === a.request_id);
      if (!r || r.state !== "AWAITING_APPROVAL") continue;
      const gate = this.db.request_events.filter(e => e.request_id === r.id && e.to_state === "AWAITING_APPROVAL").at(-1);
      const dwell = r.policy_snapshot.steps.find(s => s.tier === r.audience_tier)?.dwell_minutes ?? 720;
      if (!gate || this.ctx.now - Date.parse(gate.at) < 2 * dwell * 60000 / r.policy_snapshot.time_scale) continue;
      const event_type = `approval.reminder.${a.id}`;
      if (this.db.notifications.some(n => n.event_type === event_type)) continue;
      for (const m of this.db.space_memberships.filter(m => m.space_id === r.space_id && m.role === "INSTRUCTOR" && m.status === "ACTIVE")) this.notify(r, m.user_id, event_type, "A class representative approval is overdue. No escalation has been approved yet.", true);
    }
  }
  sweep(space_id?: string, limit = 50) {
    this.remindApprovals(space_id);
    const due = this.db.requests
      .filter(
        (r) =>
          (!space_id || r.space_id === space_id) &&
          !terminalStates.includes(r.state) &&
          r.next_escalation_at &&
          Date.parse(r.next_escalation_at) <= this.ctx.now,
      )
      .sort((a, b) =>
        a.next_escalation_at!.localeCompare(b.next_escalation_at!),
      )
      .slice(0, limit);
    const targetNow = this.ctx.now;
    for (const r of due) {
      if (!this.db.spaces.find((s) => s.id === r.space_id)?.agent_enabled)
        continue;
      for (let hop = 0; hop < 7; hop++) {
        const deadline = r.next_escalation_at;
        if (
          !deadline ||
          Date.parse(deadline) > targetNow ||
          (r.grace_until && Date.parse(r.grace_until) > targetNow)
        )
          break;
        this.ctx.now = Math.max(
          Date.parse(deadline),
          r.grace_until ? Date.parse(r.grace_until) : 0,
        );
        const decision = escalationReducer(r, r.policy_snapshot, this.ctx.now);
        if (decision.action === "WAIT") break;
        this.apply(r, decision);
      }
      this.ctx.now = targetNow;
    }
    this.ctx.now = targetNow;
    return due.length;
  }
  spaces(): SpaceSummary[] {
    const uid = this.user().id;
    return this.db.spaces
      .filter(
        (s) =>
          !s.archived_at &&
          this.db.space_memberships.some(
            (m) =>
              m.space_id === s.id && m.user_id === uid && m.status === "ACTIVE",
          ),
      )
      .map((s) => {
        const m = this.membership(s.id);
        this.sweep(s.id);
        return {
          ...s,
          role: m.role,
          unread_count: this.db.notifications.filter(
            (n) => n.space_id === s.id && n.user_id === uid && !n.read_at,
          ).length,
          open_count: this.db.requests.filter(
            (r) =>
              r.space_id === s.id &&
              r.author_id === uid &&
              !terminalStates.includes(r.state),
          ).length,
          queue_count:
            this.db.approval_tasks.filter(
              (a) => a.space_id === s.id && a.state === "PENDING",
            ).length +
            this.db.requests.filter(
              (r) =>
                r.space_id === s.id &&
                r.audience_tier === "T4" &&
                !terminalStates.includes(r.state),
            ).length,
          member_count: this.db.space_memberships.filter(
            (m) => m.space_id === s.id && m.status === "ACTIVE",
          ).length,
        };
      });
  }
  async create(input: unknown): Promise<CreateOutcome> {
    const data = createRequestSchema.parse(input);
    const member = this.guard(data.space_id, "create");
    const space = this.space(data.space_id);
    if (space.archived_at)
      throw new DomainError("ARCHIVED", "This course is archived.");
    if (
      member.creation_muted_until &&
      Date.parse(member.creation_muted_until) > this.ctx.now
    )
      throw new DomainError(
        "MUTED",
        "Your class rep has paused new requests.",
        403,
      );
    const own = this.db.requests.filter(
      (r) => r.space_id === space.id && r.author_id === this.ctx.user_id,
    );
    if (
      own.filter((r) => this.ctx.now - Date.parse(r.created_at) < 86400000)
        .length >= 10
    )
      throw new DomainError(
        "RATE_LIMIT",
        "You can ask ten requests per hub each day.",
        429,
      );
    const classification = await classify(
      data.body_text,
      { code: space.code, priority_requested: data.priority_requested },
      this.ctx.provider,
    );
    if (data.category) {
      classification.category = data.category;
      if (["LOGISTICS_AUTHORITY", "CAMPUS_ISSUE"].includes(data.category))
        classification.request_class = "AUTHORITY";
    }
    const priority = classification.priority_suggested;
    if (
      (priority === "P0" || priority === "P1") &&
      own.filter(
        (r) =>
          r.priority === priority &&
          this.ctx.now - Date.parse(r.created_at) < 7 * 86400000,
      ).length >= (priority === "P0" ? 1 : 3)
    )
      throw new DomainError(
        "QUOTA",
        "You have used your urgent requests this week. Your CR can still raise this.",
        429,
      );
    const policy = JSON.parse(
      JSON.stringify(
        this.db.escalation_policies.find(
          (p) =>
            p.space_id === space.id &&
            p.request_class === classification.request_class,
        ) ??
          defaultPolicy(space.id, classification.request_class, this.ctx.now),
      ),
    ) as EscalationPolicy;
    policy.pace_override = space.pace_override;
    policy.time_scale = this.ctx.time_scale ?? 1;
    const r: Request = {
      id: this.id("request"),
      space_id: space.id,
      author_id: this.ctx.user_id,
      body_text: data.body_text,
      normalised_question: classification.normalised_question,
      category: classification.category,
      request_class: classification.request_class,
      priority,
      tags: classification.tags,
      audience_tier: "T0",
      state: "CHECKING",
      parent_request_id: null,
      merged_count: 1,
      policy_snapshot: policy,
      next_escalation_at: null,
      grace_until: null,
      responder_ids: [],
      accepted_answer_id: null,
      resolved_at: null,
      closed_reason: null,
      contains_personal_info: classification.contains_personal_info,
      needs_review: classification.needs_review ?? false,
      skipped_tiers:
        classification.request_class === "AUTHORITY" ? ["T1", "T2", "T3"] : [],
      held_reason: null,
      attempt: 0,
      created_at: this.iso(),
      updated_at: this.iso(),
    };
    this.db.requests.push(r);
    this.log(
      r,
      "classify",
      classification,
      classification.needs_review ? "Provider failed validation twice." : null,
    );
    const hits =
      space.agent_enabled && !data.reject_knowledge
        ? searchKnowledge(
            this.db.knowledge_items,
            space.id,
            data.body_text,
            r.category,
            this.ctx.now,
          )
        : [];
    this.log(
      r,
      "retrieve",
      hits.map((h) => ({ id: h.item.id, score: h.score, terms: h.terms })),
    );
    const duplicates = findDuplicates(
      this.db.requests.filter((q) => q.id !== r.id),
      space.id,
      data.body_text,
      r.category,
      this.ctx.now,
    );
    this.log(
      r,
      "dedupe",
      duplicates.map((d) => ({ id: d.request.id, score: d.score })),
    );
    let outcome: CreateOutcome["agent_outcome"] = "ROUTE";
    let answer: Message | undefined;
    const best = hits[0];
    if (r.request_class !== "AUTHORITY" && best && best.score >= 0.55) {
      outcome = best.score >= 0.78 ? "SERVE" : "SUGGEST";
      answer = {
        id: this.id("message"),
        request_id: r.id,
        author_id: null,
        author_type: "AGENT",
        body_markdown:
          (best.item.status === "STALE" ||
          Date.parse(best.item.expires_at) <= this.ctx.now
            ? `This was answered ${Math.max(1, Math.floor((this.ctx.now - Date.parse(best.item.created_at)) / 604800000))} weeks ago; check it is still current.\n\n`
            : "") + best.item.body_markdown,
        cited_item_ids: [best.item.id],
        is_accepted: false,
        created_at: this.iso(),
      };
      this.db.messages.push(answer);
      best.item.retrieval_hits++;
      best.item.last_retrieved_at = this.iso();
    }
    if (outcome === "SERVE")
      this.event(
        r,
        "ANSWERED_BY_KB",
        "Found a sourced answer. Nobody was notified.",
        "T0",
        undefined,
        "AGENT",
      );
    else if (!data.skip_duplicate && duplicates.some((d) => d.mergeable)) {
      outcome = "DUPLICATE_PROMPT";
      this.event(
        r,
        "CHECKING",
        "A matching open thread is waiting for your choice.",
      );
    } else {
      this.event(
        r,
        "ROUTED",
        r.request_class === "AUTHORITY"
          ? "Skipped T1, T2 and T3: this needs approval, not knowledge."
          : "Asked a targeted audience.",
      );
      this.audience(
        r,
        r.request_class === "AUTHORITY" || !space.agent_enabled ? "T4" : "T1",
      );
      if (r.priority === "P0" && r.audience_tier !== "T4")
        this.db.space_memberships
          .filter(
            (m) =>
              m.space_id === r.space_id &&
              m.role === "CR" &&
              !r.responder_ids.includes(m.user_id),
          )
          .forEach((m) =>
            this.notify(
              r,
              m.user_id,
              "request.blocking",
              "A blocking request needs a look.",
              true,
            ),
          );
    }
    this.log(r, "decide", {
      action: outcome,
      cited_item_ids: answer?.cited_item_ids ?? [],
      confidence: best?.score ?? 0,
      rationale:
        outcome === "SERVE"
          ? "An existing source answers this."
          : "Human help is required.",
    });
    return {
      request: r,
      agent_outcome: outcome,
      answer,
      duplicates,
      audience_preview: {
        count: r.responder_ids.length,
        tier: r.audience_tier,
        next_escalation_at: r.next_escalation_at,
        steps: policy.steps,
      },
      classification,
    };
  }
  thread(id: string): Thread {
    let r = this.request(id);
    this.sweep(r.space_id);
    if (r.parent_request_id) r = this.request(r.parent_request_id);
    return {
      request: r,
      timeline: this.db.request_events.filter((e) => e.request_id === r.id),
      messages: this.db.messages.filter((m) => m.request_id === r.id),
      recipients: this.db.request_recipients.filter(
        (x) =>
          x.request_id === r.id &&
          (this.membership(r.space_id).role !== "STUDENT" ||
            x.user_id === this.ctx.user_id),
      ),
      cards: this.db.knowledge_items.filter(
        (k) =>
          k.source_request_id === r.id &&
          (k.published || this.membership(r.space_id).role !== "STUDENT"),
      ),
    };
  }
  message(id: string, input: unknown) {
    const r = this.request(id);
    this.guard(r.space_id, "respond");
    if (terminalStates.includes(r.state))
      throw new DomainError(
        "CLOSED",
        "This thread is closed. Ask a new request.",
      );
    const data = inputSchemas.message.parse(input);
    if (data.publish) this.guard(r.space_id, "knowledge");
    if (
      this.db.messages.filter(
        (m) =>
          m.author_id === this.ctx.user_id &&
          this.ctx.now - Date.parse(m.created_at) < 86400000,
      ).length >= 40
    )
      throw new DomainError(
        "RATE_LIMIT",
        "You can send forty replies per day.",
        429,
      );
    const m: Message = {
      id: this.id("message"),
      request_id: r.id,
      author_id: this.ctx.user_id,
      author_type: "USER",
      body_markdown: data.body,
      cited_item_ids: [],
      is_accepted: false,
      created_at: this.iso(),
    };
    this.db.messages.push(m);
    r.grace_until = new Date(
      this.ctx.now +
        (r.policy_snapshot.grace_period_minutes * 60000) /
          r.policy_snapshot.time_scale,
    ).toISOString();
    this.event(
      r,
      r.state === "AWAITING_APPROVAL" ? r.state : "IN_PROGRESS",
      "A reply added a grace period.",
    );
    const recipient = this.db.request_recipients.find(
      (x) => x.request_id === id && x.user_id === this.ctx.user_id,
    );
    if (recipient) recipient.responded_at = this.iso();
    if (r.author_id !== this.ctx.user_id)
      this.notify(
        r,
        r.author_id,
        "request.reply",
        "Someone replied to your request.",
      );
    if (data.publish) {
      this.guard(r.space_id, "knowledge");
      this.accept(id, { message_id: m.id });
      const k = this.db.knowledge_items.find(
        (k) => k.source_request_id === r.id,
      );
      if (k) {
        k.status = "VERIFIED";
        k.published = true;
        k.previously_verified = true;
      }
    }
    return m;
  }
  accept(id: string, input: unknown) {
    const r = this.request(id);
    if (r.author_id !== this.ctx.user_id) this.guard(r.space_id, "manage");
    const { message_id } = inputSchemas.accept.parse(input);
    const m = this.db.messages.find(
      (m) => m.id === message_id && m.request_id === id,
    );
    if (!m)
      throw new DomainError("NO_ANSWER", "Choose an answer from this thread.");
    if (m.author_type === "SYSTEM") throw new DomainError("NO_ANSWER", "A close-out summary is not an answer.");
    if (m.author_type === "AGENT" && !m.cited_item_ids.length)
      throw new DomainError("NO_SOURCE", "An agent answer requires a source.");
    if (r.state === "RESOLVED") return r;
    if (terminalStates.includes(r.state))
      throw new DomainError("CLOSED", "This request is already closed.");
    m.is_accepted = true;
    r.accepted_answer_id = m.id;
    r.resolved_at = this.iso();
    r.next_escalation_at = null;
    this.event(r, "RESOLVED", "An answer was accepted.");
    if (m.author_type === "USER") {
      const card = harvestAnswer(r, m, this.id("card"), this.ctx.now);
      this.db.knowledge_items.push(card);
      const helper = this.db.space_memberships.find(
        (x) => x.space_id === r.space_id && x.user_id === m.author_id,
      );
      if (helper) {
        helper.accepted_answers_30d++;
        helper.verified_helper = helper.accepted_answers_30d >= 5;
        helper.accepted_tags = [
          ...new Set([...helper.accepted_tags, ...r.tags]),
        ];
      }
      if (!card.published)
        this.db.space_memberships
          .filter((x) => x.space_id === r.space_id && x.role === "CR")
          .forEach((x) =>
            this.notify(
              r,
              x.user_id,
              "knowledge.card_needs_review",
              "A resolved answer is ready for review.",
            ),
          );
      this.log(r, "ingest", card);
    }
    for (const q of this.db.requests.filter(
      (q) => q.parent_request_id === r.id,
    )) {
      q.resolved_at = this.iso();
      q.accepted_answer_id = m.id;
      this.notify(
        r,
        q.author_id,
        "request.resolved",
        "The thread you followed has an accepted answer.",
      );
    }
    this.notify(
      r,
      r.author_id,
      "request.resolved",
      "Your request has an accepted answer.",
    );
    return r;
  }
  merge(child: Request, parent: Request) {
    if (
      child.id === parent.id ||
      child.space_id !== parent.space_id ||
      terminalStates.includes(parent.state) ||
      parent.parent_request_id
    )
      throw new DomainError(
        "INVALID_MERGE",
        "Choose another open parent in the same hub.",
      );
    if (child.parent_request_id === parent.id) return child;
    if (terminalStates.includes(child.state))
      throw new DomainError("CLOSED", "This request is already closed.");
    if (this.db.requests.some((r) => r.parent_request_id === child.id))
      throw new DomainError(
        "HAS_FOLLOWERS",
        "Merge the individual followers first.",
      );
    child.parent_request_id = parent.id;
    child.next_escalation_at = null;
    parent.merged_count++;
    this.event(
      child,
      "MERGED",
      "Following an existing thread; its clock is unchanged.",
    );
    return child;
  }
  analytics(space_id: string, since_days?: number): Analytics {
    this.guard(space_id, "analytics");
    return this.computeAnalytics(space_id, since_days);
  }
  // §13 `?range=` — a window in days. Omitted means the whole term, which is what
  // the pilot metrics in §16 are measured over.
  computeAnalytics(space_id: string, since_days?: number): Analytics {
    const cutoff = since_days ? this.ctx.now - since_days * 86400000 : null;
    const rows = this.db.requests.filter(
      (r) =>
        r.space_id === space_id &&
        (cutoff === null || Date.parse(r.created_at) >= cutoff),
    );
    const groups: { question: string; count: number; request_ids: string[] }[] =
      [];
    for (const r of rows) {
      const group = groups.find(
        (g) => jaccard(tokenize(g.question), r.tags) >= 0.65,
      );
      if (group) {
        group.count++;
        group.request_ids.push(r.id);
      } else
        groups.push({
          question: r.normalised_question,
          count: 1,
          request_ids: [r.id],
        });
    }
    const waits = rows
      .flatMap((r) => {
        const first = this.db.messages.find(
          (m) =>
            m.request_id === r.id &&
            m.author_type === "USER" &&
            m.author_id !== r.author_id,
        );
        return first
          ? [
              Math.max(
                0,
                (Date.parse(first.created_at) - Date.parse(r.created_at)) /
                  60000,
              ),
            ]
          : [];
      })
      .sort((a, b) => a - b);
    const topics = new Map<
      string,
      { tag: string; count: number; week: string }
    >();
    for (const r of rows) {
      const d = new Date(r.created_at);
      d.setUTCDate(d.getUTCDate() - d.getUTCDay());
      const week = d.toISOString().slice(0, 10);
      for (const tag of r.tags) {
        const key = `${tag}:${week}`;
        const value = topics.get(key) ?? { tag, count: 0, week };
        value.count++;
        topics.set(key, value);
      }
    }
    return {
      total: rows.length,
      open: rows.filter((r) => !terminalStates.includes(r.state)).length,
      unresolved: rows.filter((r) => r.state === "CLOSED_UNRESOLVED").length,
      median_first_response_minutes: waits.length
        ? (waits[Math.floor((waits.length - 1) / 2)] + waits[Math.floor(waits.length / 2)]) / 2
        : 0,
      resolution: (["T0", "T1", "T2", "T4", "T5", "T6"] as const).map(
        (tier) => ({
          tier,
          count: rows.filter(
            (r) => r.state === "RESOLVED" && r.audience_tier === tier,
          ).length,
        }),
      ),
      origins: ["AUTHORED", "HARVESTED", "ANNOUNCEMENT"].map((origin) => ({
        origin,
        count: rows.filter(
          (r) =>
            r.state === "RESOLVED" &&
            r.audience_tier === "T0" &&
            this.db.messages.some(
              (m) =>
                m.id === r.accepted_answer_id &&
                m.cited_item_ids.some((id) =>
                  this.db.knowledge_items.some(
                    (k) => k.id === id && k.origin === origin,
                  ),
                ),
            ),
        ).length,
      })),
      topics: [...topics.values()].sort((a, b) => b.count - a.count),
      recurring: groups.filter(
        (g) =>
          g.count >= 3 &&
          !searchKnowledge(
            this.db.knowledge_items,
            space_id,
            g.question,
            "INFORMATION",
            this.ctx.now,
          ).some((h) => h.item.status === "VERIFIED" && h.score >= 0.78),
      ),
      cr_workload: rows.filter(
        (r) => r.audience_tier === "T4" && !terminalStates.includes(r.state),
      ).length,
    };
  }
  async handle(
    method: string,
    path: string,
    input: unknown = {},
  ): Promise<unknown> {
    this.user();
    const url = new URL(path, "https://peerloop.invalid");
    const p = url.pathname
      .replace(/^\/api\/v1/, "")
      .split("/")
      .filter(Boolean);
    const q = url.searchParams;
    assertMethod(method, url.pathname.replace(/^\/api\/v1/, ""));
    if (p[0] === "users" && p[1] === "me") {
      if (p.length === 2)
        return {
          ...this.user(),
          org_roles: this.db.org_memberships.filter(
            (m) => m.user_id === this.ctx.user_id,
          ),
        };
      if (p[2] === "active-space") {
        const { space_id } = inputSchemas.activeSpace.parse(input);
        this.guard(space_id);
        this.user().active_space_id = space_id;
        return this.user();
      }
      if (p[2] === "preferences") {
        Object.assign(
          this.user().preferences,
          inputSchemas.preferences.parse(input),
        );
        return this.user();
      }
      if (p[2] === "push-token") {
        const { token, remove } = inputSchemas.push.parse(input);
        // A device belongs to one signed-in account at a time.
        for (const user of this.db.users) if (!remove || user.id === this.ctx.user_id) user.push_tokens = user.push_tokens.filter(t=>t!==token);
        if (!remove) this.user().push_tokens = [...this.user().push_tokens, token].slice(-10);
        return { ok: true };
      }
    }
    if (p[0] === "notifications") {
      if (method === "GET")
        return this.db.notifications.filter(
          (n) => n.user_id === this.ctx.user_id,
        );
      const n = this.db.notifications.find(
        (n) => n.id === p[1] && n.user_id === this.ctx.user_id,
      );
      if (!n)
        throw new DomainError("NOT_FOUND", "Notification not found.", 404);
      n.read_at = this.iso();
      return n;
    }
    if (p[0] === "spaces") {
      if (p.length === 1 && method === "GET") return this.spaces();
      if (p.length === 1 && method === "POST") {
        const data = inputSchemas.space.parse(input);
        const org = this.db.org_memberships.find(
          (m) => m.user_id === this.ctx.user_id,
        );
        if (!org)
          throw new DomainError(
            "FORBIDDEN",
            "Department creates new courses.",
            403,
          );
        assertPermission(org.role, "createSpace");
        if (data.allow_sibling_relay)
          throw new DomainError(
            "RELAY_NOT_CONFIGURED",
            "Sibling relay requires bilateral links; leave it off for this pilot.",
          );
        if (!this.db.users.some((u) => u.id === data.instructor_id))
          throw new DomainError("NOT_FOUND", "Instructor account not found.");
        const space = {
          id: this.id("space"),
          org_id: org.org_id,
          kind: "COURSE" as const,
          code: data.code,
          title: data.title,
          term: data.term,
          section: data.section,
          color_token: data.color_token,
          join_code: this.id("join"),
          allow_sibling_relay: false,
          agent_enabled: true,
          pace_override: { Relaxed: 1.5, Standard: 1, Fast: 0.6 }[
            data.template
          ],
          policy_locked: false,
          archived_at: null,
        };
        this.db.spaces.push(space);
        this.db.space_memberships.push(
          this.newMember(space.id, data.instructor_id, "INSTRUCTOR"),
        );
        this.db.escalation_policies.push(
          ...(["KNOWLEDGE", "AUTHORITY", "HYBRID"] as const).map((c) =>
            defaultPolicy(space.id, c, this.ctx.now),
          ),
        );
        return space;
      }
      if (p[1] === "join") {
        const { code } = inputSchemas.join.parse(input);
        const s = this.db.spaces.find(
          (s) => s.join_code === code && !s.archived_at,
        );
        if (!s)
          throw new DomainError(
            "NOT_FOUND",
            "This join code is not active.",
            404,
          );
        if (
          !this.db.space_memberships.some(
            (m) => m.space_id === s.id && m.user_id === this.ctx.user_id,
          )
        )
          this.db.space_memberships.push(
            this.newMember(s.id, this.ctx.user_id, "STUDENT"),
          );
        const joined = this.db.space_memberships.find(m => m.space_id === s.id && m.user_id === this.ctx.user_id)!;
        joined.status = "ACTIVE";
        return s;
      }
      const sid = p[1];
      this.guard(sid);
      const space = this.space(sid);
      if (p.length === 2 && method === "PATCH") {
        this.guard(sid, "lock");
        const data = inputSchemas.spacePatch.parse(input);
        if (data.policy_locked !== undefined)
          space.policy_locked = data.policy_locked;
        if (data.agent_enabled !== undefined)
          space.agent_enabled = data.agent_enabled;
        if (data.archived !== undefined)
          space.archived_at = data.archived ? this.iso() : null;
        return space;
      }
      if (p[2] === "members") {
        if (method === "GET")
          return this.db.space_memberships
            .filter((m) => m.space_id === sid)
            .map((m) => ({
              id: m.id,
              user_id: m.user_id,
              role: m.role,
              status: m.status,
              name:
                this.db.users.find((u) => u.id === m.user_id)?.name ?? "Member",
            }));
        if (p[3] === "import") {
          this.guard(sid, "manage");
          const { csv } = inputSchemas.roster.parse(input);
          const rows = parseCsv(csv);
          const header = rows.shift();
          if (header?.join(",") !== "student_id,name,email,section")
            throw new DomainError(
              "CSV_HEADER",
              "Use student_id,name,email,section as the header.",
            );
          for (const row of rows) {
            if (
              row.length !== 4 ||
              !row.every(Boolean) ||
              !/^\S+@\S+\.\S+$/.test(row[2])
            )
              throw new DomainError(
                "CSV_ROW",
                "Each roster row needs a student ID, name, valid email and section.",
              );
            let u = this.db.users.find(
              (u) =>
                u.student_id === row[0] ||
                u.email.toLowerCase() === row[2].toLowerCase(),
            );
            if (!u) {
              u = {
                ...this.user(),
                id: this.id("user"),
                student_id: row[0],
                name: row[1],
                email: row[2].toLowerCase(),
                avatar_initials: row[1].slice(0, 2),
                push_tokens: [],
                active_space_id: sid,
                created_at: this.iso(),
              };
              this.db.users.push(u);
            }
            if (
              !this.db.space_memberships.some(
                (m) => m.space_id === sid && m.user_id === u!.id,
              )
            ) {
              const m = this.newMember(sid, u.id, "STUDENT");
              m.status = "PENDING_INVITE";
              m.section = row[3];
              this.db.space_memberships.push(m);
            }
          }
          return { imported: rows.length };
        }
        this.guard(sid, "assign");
        const data = inputSchemas.role.parse(input);
        const m = this.db.space_memberships.find(
          (m) => m.space_id === sid && m.user_id === p[3],
        );
        if (!m) throw new DomainError("NOT_FOUND", "Member not found.", 404);
        m.role = data.role;
        return { user_id: m.user_id, role: m.role };
      }
      if (p[2] === "join-code") {
        this.guard(sid, "manage");
        space.join_code = this.id("join");
        return { code: space.join_code };
      }
      if (p[2] === "mute") {
        const { hours } = inputSchemas.mute.parse(input);
        const m = this.membership(sid);
        m.muted_until = hours
          ? new Date(this.ctx.now + hours * 3600000).toISOString()
          : null;
        return { muted_until: m.muted_until };
      }
      if (p[2] === "escalation-policy") {
        const cls = classSchema.parse(q.get("request_class") ?? "KNOWLEDGE");
        const policy = this.db.escalation_policies.find(
          (v) => v.space_id === sid && v.request_class === cls,
        )!;
        if (method === "GET")
          return { ...policy, pace_override: space.pace_override };
        this.guard(sid, "policy");
        if (space.policy_locked && this.membership(sid).role === "CR")
          throw new DomainError(
            "LOCKED",
            "Set by your course instructor.",
            403,
          );
        const data = policySchema.parse(input);
        if (
          data.space_id !== sid ||
          data.request_class !== cls ||
          data.steps.some((s) => s.tier === "T3")
        )
          throw new DomainError(
            "POLICY",
            "The policy must belong to this hub and use configured tiers.",
          );
        if (data.locked_by_instructor !== policy.locked_by_instructor)
          this.guard(sid, "lock");
        Object.assign(policy, data, {
          id: policy.id,
          updated_by: this.ctx.user_id,
          updated_at: this.iso(),
          time_scale: 1,
        });
        return policy;
      }
      if (p[2] === "pace") {
        this.guard(sid, "policy");
        if (space.policy_locked && this.membership(sid).role === "CR")
          throw new DomainError(
            "LOCKED",
            "Set by your course instructor.",
            403,
          );
        const data = inputSchemas.pace.parse(input);
        space.pace_override =
          data.override ??
          { Relaxed: 1.5, Standard: 1, Fast: 0.6 }[data.preset!];
        return { pace_override: space.pace_override };
      }
      if (p[2] === "analytics")
        return this.analytics(sid, parseRangeDays(q.get("range")));
      if (p[2] === "knowledge") {
        if (p[3] === "recurring") {
          this.guard(sid, "analytics");
          return this.computeAnalytics(sid).recurring;
        }
        if (p[3] === "review") {
          this.guard(sid, "knowledge");
          return this.db.knowledge_items.filter(
            (k) => k.space_id === sid && k.status === "UNVERIFIED",
          );
        }
        if (p[3] === "cards" && p[4] === "check") {
          this.guard(sid, "knowledge");
          return searchKnowledge(
            this.db.knowledge_items,
            sid,
            inputSchemas.check.parse(input).question,
            "INFORMATION",
            this.ctx.now,
          ).filter((h) => h.score >= 0.74);
        }
        if (method === "GET") {
          const role = this.membership(sid).role;
          return this.db.knowledge_items
            .filter(
              (k) =>
                k.space_id === sid &&
                k.status !== "RETIRED" &&
                (k.published || role !== "STUDENT") &&
                (!q.get("kind") || k.kind === q.get("kind")) &&
                (!q.get("status") || k.status === q.get("status")) &&
                (!q.get("q") ||
                  tokenize(q.get("q")!).some((t) =>
                    tokenize(k.title + " " + k.body_markdown).includes(t),
                  )),
            )
            .sort(
              (a, b) =>
                (a.pin_order ?? 999) - (b.pin_order ?? 999) ||
                Number(b.status === "VERIFIED") -
                  Number(a.status === "VERIFIED") ||
                (b.last_retrieved_at ?? b.created_at).localeCompare(
                  a.last_retrieved_at ?? a.created_at,
                ),
            );
        }
        this.guard(sid, "knowledge");
        const pin = p[3] === "pins";
        const data = pin
          ? pinInputSchema.parse(input)
          : cardInputSchema.parse(input);
        const title = "title" in data ? data.title : data.question;
        const k: KnowledgeItem = {
          id: this.id("knowledge"),
          space_id: sid,
          kind: pin ? "PINNED_REF" : "ANSWER_CARD",
          title,
          body_markdown: "note" in data ? data.note : data.body,
          url: "url" in data ? data.url : null,
          category: data.category,
          status: "VERIFIED",
          origin: "AUTHORED",
          source_request_id: null,
          contributor_ids: [this.ctx.user_id],
          pin_order: pin
            ? this.db.knowledge_items.filter(
                (k) => k.space_id === sid && k.kind === "PINNED_REF",
              ).length
            : null,
          expires_at: new Date(
            this.ctx.now +
              ("expires_in_days" in data ? data.expires_in_days : 21) *
                86400000,
          ).toISOString(),
          last_retrieved_at: null,
          retrieval_hits: 0,
          false_positive_count: 0,
          created_by: this.ctx.user_id,
          created_at: this.iso(),
          tags: tokenize(title),
          published: true,
          previously_verified: true,
        };
        if ("top_four" in data && data.top_four) {
          this.db.knowledge_items
            .filter((k) => k.space_id === sid && k.pin_order !== null)
            .forEach((k) => k.pin_order!++);
          k.pin_order = 0;
        }
        this.db.knowledge_items.push(k);
        if ("notify_space" in data && data.notify_space) this.notifyCard(k);
        return k;
      }
      if (p[2] === "announcements") {
        this.guard(sid, "lock");
        const data = inputSchemas.announcement.parse(input);
        const k = (await this.handle("POST", `/spaces/${sid}/knowledge/pins`, {
          title: data.title,
          url: data.url,
          note: data.body,
          category: "INFORMATION",
          top_four: true,
        })) as KnowledgeItem;
        k.origin = "ANNOUNCEMENT";
        this.notifyCard(k);
        return k;
      }
    }
    if (p[0] === "requests") {
      if (p.length === 1 && method === "POST") return this.create(input);
      if (p.length === 1 && method === "GET") {
        const spaces = this.spaces().map((s) => s.id);
        const sid = q.get("space_id");
        if (sid) this.guard(sid);
        return this.db.requests
          .filter(
            (r) =>
              spaces.includes(r.space_id) &&
              (!sid || r.space_id === sid) &&
              (q.get("scope") === "space" ||
                (q.get("scope") !== "helping" && r.author_id === this.ctx.user_id) ||
                (q.get("scope") === "helping" && !terminalStates.includes(r.state) && r.author_id !== this.ctx.user_id &&
                  this.db.request_recipients.some(
                    (x) =>
                      x.request_id === r.id &&
                      x.user_id === this.ctx.user_id &&
                      !x.responded_at,
                  ))) &&
              (!q.get("state") || r.state === q.get("state")),
          )
          .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      }
      const r = this.request(p[1]);
      this.sweep(r.space_id);
      if (p.length === 2 && method === "GET") return this.thread(r.id);
      if (p.length === 2 && method === "PATCH") {
        this.guard(r.space_id, "manage");
        const data = inputSchemas.requestPatch.parse(input);
        if (data.request_class && data.request_class !== r.request_class)
          throw new DomainError(
            "SNAPSHOT",
            "Close and reopen to change the escalation class.",
          );
        Object.assign(r, data);
        this.event(
          r,
          r.state,
          "Classification updated by the class representative.",
        );
        return r;
      }
      if (p[2] === "messages") return this.message(r.id, input);
      if (p[2] === "accept") return this.accept(r.id, input);
      if (p[2] === "follow") {
        const data = inputSchemas.follow.parse(input);
        if (data.request_id) {
          const child = this.request(data.request_id);
          if (child.author_id !== this.ctx.user_id)
            this.guard(r.space_id, "manage");
          return this.merge(child, r);
        }
        const existing = this.db.requests.find(
          (x) =>
            x.parent_request_id === r.id && x.author_id === this.ctx.user_id,
        );
        if (existing) return existing;
        const child = {
          ...r,
          id: this.id("request"),
          author_id: this.ctx.user_id,
          state: "CHECKING" as const,
          responder_ids: [],
          merged_count: 1,
          parent_request_id: null,
          created_at: this.iso(),
          updated_at: this.iso(),
        };
        this.db.requests.push(child);
        return this.merge(child, r);
      }
      if (p[2] === "route") {
        if (r.author_id !== this.ctx.user_id) this.guard(r.space_id, "manage");
        if (!["CHECKING", "ANSWERED_BY_KB"].includes(r.state)) return r;
        if (r.state === "ANSWERED_BY_KB")
          for (const m of this.db.messages.filter(
            (m) => m.request_id === r.id && m.author_type === "AGENT",
          ))
            for (const id of m.cited_item_ids) {
              const k = this.card(id);
              k.false_positive_count++;
              if (k.false_positive_count >= 3) {
                k.status = "UNVERIFIED";
                k.published = false;
              }
            }
        this.event(r, "ROUTED", "The requester still needs help.");
        this.audience(r, r.request_class === "AUTHORITY" || !this.space(r.space_id).agent_enabled ? "T4" : "T1");
        return r;
      }
      if (p[2] === "claim") {
        this.requireOpen(r);
        r.grace_until = new Date(
          this.ctx.now +
            (r.policy_snapshot.grace_period_minutes * 60000) /
              r.policy_snapshot.time_scale,
        ).toISOString();
        this.event(
          r,
          r.state === "AWAITING_APPROVAL" ? r.state : "IN_PROGRESS",
          `${this.user().name} is looking into this.`,
        );
        return r;
      }
      if (p[2] === "privacy") {
        if (r.author_id !== this.ctx.user_id)
          throw new DomainError(
            "FORBIDDEN",
            "Only the requester can remove the saved answer.",
            403,
          );
        this.db.knowledge_items
          .filter((k) => k.source_request_id === r.id)
          .forEach((k) => {
            k.status = "RETIRED";
            k.published = false;
          });
        this.event(r, r.state, "The requester chose not to save this answer.");
        return r;
      }
      if (p[2] === "close") {
        if (r.author_id !== this.ctx.user_id) this.guard(r.space_id, "manage");
        this.requireOpen(r);
        const data = inputSchemas.reason.parse(input);
        r.next_escalation_at = null;
        r.closed_reason = data.reason;
        this.event(r, "CLOSED_UNRESOLVED", data.reason);
        this.closeSummary(r, data.reason);
        return r;
      }
      this.guard(r.space_id, "manage");
      if (p[2] === "merge")
        return this.merge(
          r,
          this.request(inputSchemas.merge.parse(input).parent_request_id),
        );
      if (p[2] === "unmerge") {
        if (r.state !== "MERGED" || !r.parent_request_id || r.resolved_at) throw new DomainError("INVALID_UNMERGE", "Only unresolved merged requests can be separated.");
        const parent = r.parent_request_id
          ? this.request(r.parent_request_id)
          : null;
        if (parent) parent.merged_count = Math.max(1, parent.merged_count - 1);
        r.parent_request_id = null;
        this.event(r, "ROUTED", "Separated from the merged thread.");
        this.audience(r, r.request_class === "AUTHORITY" ? "T4" : "T1");
        return r;
      }
      if (p[2] === "hold") {
        this.requireOpen(r);
        r.held_reason = inputSchemas.reason.parse(input).reason;
        this.event(r, r.state, `Clock held: ${r.held_reason}`);
        return r;
      }
      if (p[2] === "resume") {
        this.requireOpen(r);
        r.held_reason = null;
        r.next_escalation_at = nextDeadline(
          this.ctx.now,
          r.audience_tier,
          r.priority,
          r.policy_snapshot,
        );
        this.event(r, r.state, "Clock resumed.");
        return r;
      }
      if (p[2] === "escalate") {
        if (terminalStates.includes(r.state) || r.state === "AWAITING_APPROVAL")
          return r;
        const idx = r.policy_snapshot.steps.findIndex(
          (s) => s.tier === r.audience_tier,
        );
        const next = r.policy_snapshot.steps[idx + 1];
        if (next?.manual_only) {
          this.guard(r.space_id, "assign");
          this.event(
            r,
            "AWAITING_APPROVAL",
            "Instructor requested department review.",
          );
          this.approval(r, next.tier, "Instructor approval required.");
          return r;
        }
        const copy = {
          ...r,
          held_reason: null,
          grace_until: null,
          next_escalation_at: this.iso(),
        };
        this.apply(r, escalationReducer(copy, r.policy_snapshot, this.ctx.now));
        return r;
      }
      if (p[2] === "move") {
        this.requireOpen(r);
        const { space_id } = inputSchemas.move.parse(input);
        this.guard(space_id, "manage");
        if (space_id === r.space_id || this.db.requests.some(q => q.parent_request_id === r.id)) throw new DomainError("INVALID_MOVE", "Choose another hub and separate followers before moving.");
        // Reopen as the original author. Never rewrite the isolation boundary of a thread.
        const actor = this.ctx.user_id;
        let replacement: Request;
        try {
          this.ctx.user_id = r.author_id;
          replacement = (await this.create({ space_id, body_text: r.body_text, category: r.category, priority_requested: r.priority, skip_duplicate: true, reject_knowledge: true })).request;
        } finally { this.ctx.user_id = actor; }
        r.closed_reason = `Moved to ${space_id}; replacement request: ${replacement.id}`;
        this.event(r, "CLOSED_UNRESOLVED", r.closed_reason);
        this.event(replacement, replacement.state, `Reopened from ${r.id} in ${r.space_id}.`);
        return replacement;
      }
    }
    if (p[0] === "knowledge") {
      const k = this.card(p[1]);
      if (p.length === 2 && method === "GET") return k;
      if (p[2] === "flag") {
        k.false_positive_count++;
        if (k.false_positive_count >= 3) {
          k.published = false;
          k.status = "UNVERIFIED";
        }
        return k;
      }
      this.guard(k.space_id, "knowledge");
      if (p.length === 2 && method === "PATCH") {
        const data = inputSchemas.cardPatch.parse(input);
        if (data.question) {
          k.title = data.question;
          k.tags = tokenize(data.question);
        }
        if (data.body) k.body_markdown = data.body;
        if (data.category) k.category = data.category;
        if (data.expires_at) k.expires_at = data.expires_at;
        return k;
      }
      if (p[2] === "pin-order") {
        const { order } = inputSchemas.order.parse(input);
        const pins = this.db.knowledge_items
          .filter(
            (x) =>
              x.space_id === k.space_id &&
              x.kind === "PINNED_REF" &&
              x.status !== "RETIRED" &&
              x.id !== k.id,
          )
          .sort((a, b) => (a.pin_order ?? 0) - (b.pin_order ?? 0));
        pins.splice(Math.min(order, pins.length), 0, k);
        pins.forEach((x, i) => (x.pin_order = i));
        return pins;
      }
      if (p[2] === "verify") {
        k.status = "VERIFIED";
        k.previously_verified = true;
        k.published = true;
        return k;
      }
      if (p[2] === "retire") {
        k.status = "RETIRED";
        k.published = false;
        return k;
      }
      if (p[2] === "refresh") {
        k.expires_at = new Date(this.ctx.now + 21 * 86400000).toISOString();
        k.status = k.previously_verified ? "VERIFIED" : "UNVERIFIED";
        return k;
      }
    }
    if (p[0] === "approvals") {
      if (method === "GET")
        return this.db.approval_tasks.filter(
          (a) =>
            a.state === "PENDING" &&
            this.db.space_memberships.some(
              (m) =>
                m.space_id === a.space_id &&
                m.user_id === this.ctx.user_id &&
                m.role === a.assignee_role && m.status === "ACTIVE" && (!a.assignee_id || a.assignee_id === m.user_id),
            ),
        );
      const a = this.db.approval_tasks.find((a) => a.id === p[1]);
      if (!a) throw new DomainError("NOT_FOUND", "Approval not found.", 404);
      const m = this.guard(a.space_id, "approve");
      if (m.role !== a.assignee_role)
        throw new DomainError(
          "FORBIDDEN",
          "This approval belongs to another role.",
          403,
        );
      if (a.state !== "PENDING") return a;
      if (a.assignee_id && a.assignee_id !== this.ctx.user_id) throw new DomainError("FORBIDDEN", "This approval belongs to another person.", 403);
      const target = a.request_id ? this.request(a.request_id) : null;
      if (target && (terminalStates.includes(target.state) || target.state !== "AWAITING_APPROVAL")) {
        a.state = "EXPIRED";
        a.decided_at = this.iso();
        a.note = "The request no longer needs this approval.";
        return a;
      }
      const data = inputSchemas.decide.parse(input);
      a.state = data.decision === "approve" ? "APPROVED" : "DECLINED";
      a.decided_by = this.ctx.user_id;
      a.decided_at = this.iso();
      a.note = data.note;
      const r = a.request_id ? this.request(a.request_id) : null;
      if (r) {
        if (data.decision === "approve" && a.payload.tier) {
          this.event(
            r,
            "ESCALATED",
            `Approved by ${this.user().name}. ${data.note}`,
            a.payload.tier,
          );
          this.audience(r, a.payload.tier);
        } else {
          r.held_reason =
            data.note || "Escalation declined; awaiting human follow-up.";
          this.event(r, "IN_PROGRESS", r.held_reason);
        }
        this.notify(
          r,
          r.author_id,
          "approval.decided",
          `Escalation ${a.state.toLowerCase()}.`,
        );
      }
      return a;
    }
    if (p[0] === "orgs") {
      this.org(p[1]);
      const spaces = this.db.spaces.filter((s) => s.org_id === p[1]);
      if (p[2] === "spaces")
        return spaces.map((s) => ({
          ...s,
          health: this.computeAnalytics(s.id),
          member_count: this.db.space_memberships.filter(
            (m) => m.space_id === s.id,
          ).length,
        }));
      if (p[2] === "analytics")
        return spaces.map((s) => ({
          space: s,
          analytics: this.computeAnalytics(s.id),
        }));
      if (p[2] === "people")
        return this.db.users
          .filter(
            (u) =>
              this.db.space_memberships.some(
                (m) =>
                  m.user_id === u.id && spaces.some((s) => s.id === m.space_id),
              ) ||
              this.db.org_memberships.some(
                (m) => m.user_id === u.id && m.org_id === p[1],
              ),
          )
          .map((u) => ({ id: u.id, name: u.name, student_id: u.student_id }));
      if (p[2] === "audit") {
        const ids = new Set(
          this.db.requests
            .filter((r) => spaces.some((s) => s.id === r.space_id))
            .map((r) => r.id),
        );
        return {
          events: this.db.request_events.filter((e) => ids.has(e.request_id)),
          agent_runs: this.db.agent_runs.filter((e) => ids.has(e.request_id)),
        };
      }
      if (p[2] === "rollover") {
        const { term } = inputSchemas.rollover.parse(input);
        const result = [];
        for (const old of spaces.filter((s) => !s.archived_at)) {
          old.archived_at = this.iso();
          const fresh = {
            ...old,
            id: this.id("space"),
            term,
            join_code: this.id("join"),
            archived_at: null,
          };
          this.db.spaces.push(fresh);
          for (const member of this.db.space_memberships.filter(
            (m) => m.space_id === old.id && m.role !== "STUDENT",
          ))
            this.db.space_memberships.push({
              ...member,
              id: this.id("membership"),
              space_id: fresh.id,
            });
          for (const k of this.db.knowledge_items.filter(
            (k) => k.space_id === old.id && k.status === "VERIFIED",
          ))
            this.db.knowledge_items.push({
              ...k,
              id: this.id("knowledge"),
              space_id: fresh.id,
              status: "UNVERIFIED",
              published: false,
              source_request_id: null,
              retrieval_hits: 0,
              created_at: this.iso(),
            });
          this.db.escalation_policies.push(
            ...(["KNOWLEDGE", "AUTHORITY", "HYBRID"] as const).map((c) =>
              defaultPolicy(fresh.id, c, this.ctx.now),
            ),
          );
          result.push(fresh);
        }
        return result;
      }
    }
    if (p[0] === "agent-runs") {
      const r = this.request(p[1]);
      this.guard(r.space_id, "manage");
      return this.db.agent_runs.filter((a) => a.request_id === r.id);
    }
    throw new DomainError("NOT_FOUND", "This endpoint does not exist.", 404);
  }
  newMember(
    space_id: string,
    user_id: string,
    role: SpaceRole,
  ): SpaceMembership {
    return {
      id: this.id("membership"),
      space_id,
      user_id,
      role,
      joined_at: this.iso(),
      helper_score: 0,
      verified_helper: false,
      notified_count_7d: 0,
      accepted_answers_30d: 0,
      notified_count_30d: 0,
      last_active_at: this.iso(),
      muted_until: null,
      lab_group: "",
      section: this.db.spaces.find((s) => s.id === space_id)?.section ?? "",
      notification_budget_override: null,
      notifications_sent_today: 0,
      accepted_tags: [],
      status: "ACTIVE",
      creation_muted_until: null,
    };
  }
  notifyCard(k: KnowledgeItem) {
    for (const m of this.db.space_memberships.filter(
      (m) => m.space_id === k.space_id && m.status === "ACTIVE",
    ))
      this.db.notifications.push({
        id: this.id("notification"),
        user_id: m.user_id,
        space_id: k.space_id,
        event_type: "knowledge.published",
        payload: { card_id: k.id, text: k.title },
        read_at: null,
        delivered_channel: "DIGEST",
        delivery_state: "PENDING",
        created_at: this.iso(),
        delivered_at: null,
        error: null,
      });
  }
}
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if (c === "\n" && !quoted) {
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else if (c !== "\r") cell += c;
  }
  if (quoted) throw new DomainError("CSV", "Unclosed quoted field.");
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
