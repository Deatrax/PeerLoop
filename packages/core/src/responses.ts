import { z } from "zod";
import {
  categorySchema,
  classificationSchema,
  classSchema,
  jsonSchema,
  policySchema,
  prioritySchema,
  roleSchema,
  tierSchema,
} from "./schemas";
const id = z.string().min(1),
  date = z.string(),
  nullableDate = date.nullable();
export const userResponseSchema = z.object({
  id,
  student_id: z.string(),
  name: z.string(),
  email: z.string().email(),
  avatar_initials: z.string(),
  active_space_id: id.nullable(),
  push_tokens: z.array(z.string()),
  preferences: z.object({
    theme: z.enum(["system", "light", "dark"]),
    leaderboard: z.boolean(),
    notifications: z.boolean(),
    tags_only: z.boolean(),
    tags: z.array(z.string()),
    quiet_start: z.string(),
    quiet_end: z.string(),
  }),
  created_at: date,
  org_roles: z
    .array(
      z.object({
        user_id: id,
        org_id: id,
        role: z.enum(["DEPT_ADMIN", "SYS_ADMIN"]),
      }),
    )
    .optional(),
});
export const spaceResponseSchema = z.object({
  id,
  org_id: id,
  kind: z.enum(["COURSE", "BATCH", "CLUB", "DEPARTMENT"]),
  code: z.string(),
  title: z.string(),
  term: z.string(),
  section: z.string(),
  color_token: z.enum(["flare", "sage", "indigo", "amber", "clay"]),
  join_code: z.string(),
  allow_sibling_relay: z.boolean(),
  agent_enabled: z.boolean(),
  pace_override: z.number(),
  policy_locked: z.boolean(),
  archived_at: nullableDate,
});
export const spaceSummarySchema = spaceResponseSchema.extend({
  role: z.enum(["STUDENT", "CR", "INSTRUCTOR", "DEPT_ADMIN", "SYS_ADMIN"]),
  unread_count: z.number(),
  open_count: z.number(),
  queue_count: z.number(),
  member_count: z.number(),
});
export const stateSchema = z.enum([
  "DRAFT",
  "CHECKING",
  "ANSWERED_BY_KB",
  "MERGED",
  "ROUTED",
  "IN_PROGRESS",
  "ESCALATED",
  "AWAITING_APPROVAL",
  "RESOLVED",
  "CLOSED_UNRESOLVED",
]);
export const requestResponseSchema = z.object({
  id,
  space_id: id,
  author_id: id,
  body_text: z.string(),
  normalised_question: z.string(),
  category: categorySchema,
  request_class: classSchema,
  priority: prioritySchema,
  tags: z.array(z.string()),
  audience_tier: tierSchema,
  state: stateSchema,
  parent_request_id: id.nullable(),
  merged_count: z.number(),
  policy_snapshot: policySchema,
  next_escalation_at: nullableDate,
  grace_until: nullableDate,
  responder_ids: z.array(id),
  accepted_answer_id: id.nullable(),
  resolved_at: nullableDate,
  closed_reason: z.string().nullable(),
  contains_personal_info: z.boolean(),
  needs_review: z.boolean(),
  skipped_tiers: z.array(tierSchema),
  held_reason: z.string().nullable(),
  attempt: z.number(),
  created_at: date,
  updated_at: date,
});
export const messageResponseSchema = z
  .object({
    id,
    request_id: id,
    author_id: id.nullable(),
    author_type: z.enum(["USER", "AGENT", "SYSTEM"]),
    body_markdown: z.string(),
    cited_item_ids: z.array(id),
    is_accepted: z.boolean(),
    created_at: date,
  })
  .refine(
    (m) => m.author_type !== "AGENT" || m.cited_item_ids.length > 0,
    "Agent answers require at least one source.",
  );
export const cardResponseSchema = z.object({
  id,
  space_id: id,
  kind: z.enum(["PINNED_REF", "ANSWER_CARD"]),
  title: z.string(),
  body_markdown: z.string(),
  url: z.string().nullable(),
  category: categorySchema,
  status: z.enum(["UNVERIFIED", "VERIFIED", "STALE", "RETIRED"]),
  origin: z.enum(["AUTHORED", "HARVESTED", "ANNOUNCEMENT"]),
  source_request_id: id.nullable(),
  contributor_ids: z.array(id),
  pin_order: z.number().nullable(),
  expires_at: date,
  last_retrieved_at: nullableDate,
  retrieval_hits: z.number(),
  false_positive_count: z.number(),
  created_by: id.nullable(),
  created_at: date,
  tags: z.array(z.string()),
  published: z.boolean(),
  previously_verified: z.boolean(),
});
export const eventResponseSchema = z.object({
  id,
  request_id: id,
  from_state: stateSchema,
  to_state: stateSchema,
  tier: tierSchema,
  actor_type: z.enum(["USER", "AGENT", "SYSTEM"]),
  actor_id: id.nullable(),
  reason: z.string(),
  dedupe_key: z.string(),
  at: date,
});
export const scoreResponseSchema = z.object({
  topic_affinity: z.number(),
  responsiveness: z.number(),
  recent_activity: z.number(),
  structural_proximity: z.number(),
  role_bonus: z.number(),
  load_penalty: z.number(),
  total: z.number(),
  fairness: z.boolean(),
});
export const recipientResponseSchema = z.object({
  request_id: id,
  user_id: id,
  tier: tierSchema,
  notified_at: date,
  opened_at: nullableDate,
  responded_at: nullableDate,
  score_snapshot: scoreResponseSchema.nullable(),
});
export const threadResponseSchema = z.object({
  request: requestResponseSchema,
  timeline: z.array(eventResponseSchema),
  messages: z.array(messageResponseSchema),
  recipients: z.array(recipientResponseSchema),
  cards: z.array(cardResponseSchema),
});
export const approvalResponseSchema = z.object({
  id,
  space_id: id,
  request_id: id.nullable(),
  kind: z.enum([
    "ESCALATE_TIER",
    "BROADCAST",
    "PUBLISH_CARD",
    "CLOSE_COMPLAINT",
  ]),
  payload: z.object({
    tier: tierSchema.optional(),
    card_id: id.optional(),
    rationale: z.string(),
  }),
  requested_by_type: z.enum(["USER", "AGENT"]),
  assignee_role: z.enum([
    "STUDENT",
    "CR",
    "INSTRUCTOR",
    "DEPT_ADMIN",
    "SYS_ADMIN",
  ]),
  assignee_id: id.nullable(),
  state: z.enum(["PENDING", "APPROVED", "DECLINED", "EXPIRED"]),
  decided_by: id.nullable(),
  decided_at: nullableDate,
  note: z.string().nullable(),
});
export const notificationResponseSchema = z.object({
  id,
  user_id: id,
  space_id: id,
  event_type: z.string(),
  payload: z.object({
    request_id: id.optional(),
    card_id: id.optional(),
    text: z.string(),
  }),
  read_at: nullableDate,
  delivered_channel: z.enum(["PUSH", "DIGEST", "IN_APP"]),
  delivery_state: z.enum(["PENDING", "SENT", "FAILED"]),
  created_at: date,
  delivered_at: nullableDate,
  error: z.string().nullable(),
});
export const agentRunResponseSchema = z.object({
  id,
  request_id: id,
  step: z.string(),
  model: z.string(),
  prompt_hash: z.string(),
  output_json: jsonSchema,
  latency_ms: z.number(),
  tokens_in: z.number(),
  tokens_out: z.number(),
  error: z.string().nullable(),
  created_at: date,
});
export const searchHitResponseSchema = z.object({
  item: cardResponseSchema,
  score: z.number().min(0).max(1),
  terms: z.object({
    lexical: z.number(),
    title: z.number(),
    tags: z.number(),
    verified: z.number(),
    pinned: z.number(),
    stale: z.number(),
    age: z.number(),
  }),
});
export const recurringResponseSchema = z.array(
  z.object({
    question: z.string(),
    count: z.number(),
    request_ids: z.array(id),
  }),
);
export const analyticsResponseSchema = z.object({
  total: z.number(),
  open: z.number(),
  unresolved: z.number(),
  median_first_response_minutes: z.number(),
  resolution: z.array(z.object({ tier: tierSchema, count: z.number() })),
  origins: z.array(z.object({ origin: z.string(), count: z.number() })),
  topics: z.array(
    z.object({ tag: z.string(), count: z.number(), week: z.string() }),
  ),
  recurring: recurringResponseSchema,
  cr_workload: z.number(),
});
export const createOutcomeResponseSchema = z.object({
  request: requestResponseSchema,
  agent_outcome: z.enum(["SERVE", "SUGGEST", "ROUTE", "DUPLICATE_PROMPT"]),
  answer: messageResponseSchema.optional(),
  duplicates: z
    .array(z.object({ request: requestResponseSchema, score: z.number() }))
    .optional(),
  audience_preview: z.object({
    count: z.number(),
    tier: tierSchema,
    next_escalation_at: nullableDate,
    steps: z.array(
      z.object({
        tier: tierSchema,
        dwell_minutes: z.number().nullable(),
        requires_approval: z.boolean(),
        manual_only: z.boolean().optional(),
      }),
    ),
  }),
  classification: classificationSchema,
});
export function responseSchema(method: string, path: string): z.ZodType {
  const p = new URL(path, "https://peerloop.invalid").pathname
    .replace(/^\/api\/v1/, "")
    .split("/")
    .filter(Boolean);
  if (p[0] === "auth")
    return p[1] === "request-link"
      ? z.object({ ok: z.boolean() })
      : p[1] === "refresh"
        ? z.object({ token: z.string() })
        : z.object({ token: z.string(), user: userResponseSchema });
  if (p[0] === "users")
    return p[2] === "push-token"
      ? z.object({ ok: z.boolean() })
      : userResponseSchema;
  if (p[0] === "notifications")
    return method === "GET"
      ? z.array(notificationResponseSchema)
      : notificationResponseSchema;
  if (p[0] === "requests") {
    if (p.length === 1)
      return method === "POST"
        ? createOutcomeResponseSchema
        : z.array(requestResponseSchema);
    if (p[2] === "messages") return messageResponseSchema;
    return p.length === 2 && method === "GET"
      ? threadResponseSchema
      : requestResponseSchema;
  }
  if (p[0] === "knowledge")
    return p[2] === "pin-order"
      ? z.array(cardResponseSchema)
      : cardResponseSchema;
  if (p[0] === "approvals")
    return method === "GET"
      ? z.array(approvalResponseSchema)
      : approvalResponseSchema;
  if (p[0] === "agent-runs" || path === "/dev/inspect")
    return z.array(agentRunResponseSchema);
  if (p[0] === "spaces") {
    if (p.length === 1)
      return method === "GET"
        ? z.array(spaceSummarySchema)
        : spaceResponseSchema;
    if (p.length === 2) return spaceResponseSchema;
    if (p[2] === "members") {
      if (p[3] === "import") return z.object({ imported: z.number() });
      return method === "GET"
        ? z.array(
            z.object({
              id,
              user_id: id,
              role: roleSchema,
              status: z.string(),
              name: z.string(),
            }),
          )
        : z.object({ user_id: id, role: roleSchema });
    }
    if (p[2] === "join-code") return z.object({ code: z.string() });
    if (p[2] === "mute") return z.object({ muted_until: nullableDate });
    if (p[2] === "pace") return z.object({ pace_override: z.number() });
    if (p[2] === "escalation-policy") return policySchema;
    if (p[2] === "analytics") return analyticsResponseSchema;
    if (p[2] === "announcements") return cardResponseSchema;
    if (p[2] === "knowledge") {
      if (p[3] === "recurring") return recurringResponseSchema;
      if (p[4] === "check") return z.array(searchHitResponseSchema);
      return method === "GET"
        ? z.array(cardResponseSchema)
        : cardResponseSchema;
    }
  }
  if (p[0] === "orgs") {
    if (p[2] === "spaces")
      return z.array(
        spaceResponseSchema.extend({
          health: analyticsResponseSchema,
          member_count: z.number(),
        }),
      );
    if (p[2] === "analytics")
      return z.array(
        z.object({
          space: spaceResponseSchema,
          analytics: analyticsResponseSchema,
        }),
      );
    if (p[2] === "people")
      return z.array(
        z.object({ id, name: z.string(), student_id: z.string() }),
      );
    if (p[2] === "audit")
      return z.object({
        events: z.array(eventResponseSchema),
        agent_runs: z.array(agentRunResponseSchema),
      });
    if (p[2] === "rollover") return z.array(spaceResponseSchema);
  }
  if (p[0] === "dev")
    return p[1] === "reset"
      ? z.object({ ok: z.boolean() })
      : z.object({ swept: z.number() });
  throw new Error("Missing response contract: " + method + " " + path);
}
