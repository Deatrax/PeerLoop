import { z } from 'zod';
export const roleSchema = z.enum(['STUDENT','CR','INSTRUCTOR']);
export const categorySchema = z.enum(['MATERIAL','INFORMATION','ACADEMIC_HELP','COORDINATION','LOGISTICS_AUTHORITY','CAMPUS_ISSUE']);
export const classSchema = z.enum(['KNOWLEDGE','AUTHORITY','HYBRID']);
export const prioritySchema = z.enum(['P0','P1','P2','P3']);
export const tierSchema = z.enum(['T0','T1','T2','T3','T4','T5','T6']);
export const textSchema = z.string().trim().min(1).max(12000);
export const classificationSchema = z.object({ category: categorySchema, request_class: classSchema, priority_suggested: prioritySchema, priority_reason: z.string().refine(s => s.split(/\s+/).length <= 12), tags: z.array(z.string()).max(30), normalised_question: z.string().max(140), detected_space_hint: z.string().nullable(), contains_personal_info: z.boolean(), needs_review: z.boolean().optional() });
const httpUrl = z.string().url().refine(s => /^https?:\/\//i.test(s), 'Use an http or https link');
export const createRequestSchema = z.object({ space_id: z.string(), body_text: textSchema, priority_requested: prioritySchema.default('P2'), category: categorySchema.optional(), skip_duplicate: z.boolean().default(false), reject_knowledge: z.boolean().default(false) }).strict();
export const cardInputSchema = z.object({ question: textSchema, body: textSchema, category: categorySchema, expires_in_days: z.number().int().min(1).max(366).default(21), notify_space: z.boolean().default(false) }).strict();
export const pinInputSchema = z.object({ title: textSchema, url: httpUrl, note: z.string().max(12000).default(''), category: categorySchema, top_four: z.boolean().default(false) }).strict();
export const policySchema = z.object({ id: z.string(), space_id: z.string(), request_class: classSchema, steps: z.array(z.object({ tier: tierSchema, dwell_minutes: z.number().min(20).max(4320).nullable(), requires_approval: z.boolean(), manual_only: z.boolean().optional() })).min(1).max(7), quiet_hours: z.object({ start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), tz: z.string().refine(s => { try { new Intl.DateTimeFormat('en',{timeZone:s}); return true; } catch { return false; } }), applies_below_priority: prioritySchema }), grace_period_minutes: z.number().min(0).max(180), locked_by_instructor: z.boolean(), pace_override: z.number().min(.5).max(2), final_action: z.literal('CLOSE_UNRESOLVED_WITH_SUMMARY'), updated_by: z.string().nullable(), updated_at: z.string(), time_scale: z.number().positive() }).superRefine((p, ctx) => { const tiers=p.steps.map(s=>s.tier); if(new Set(tiers).size!==tiers.length || p.steps.some(s=>((s.tier==='T5'||s.tier==='T6')&&!s.requires_approval)||(s.tier==='T6'&&!s.manual_only))) ctx.addIssue({code:'custom',message:'Unique tiers and human approval above CR are required'}); });
export const inputSchemas = {
  devLogin: z.object({ studentId: textSchema }), magicLink: z.object({ email: z.string().email() }), verifyLink: z.object({ token: textSchema }),
  join: z.object({code:textSchema}), activeSpace: z.object({space_id:textSchema}), message: z.object({body:textSchema,publish:z.boolean().optional()}), accept: z.object({message_id:textSchema}), reason: z.object({reason:textSchema}),
  requestPatch: z.object({priority:prioritySchema.optional(),category:categorySchema.optional(),request_class:classSchema.optional()}),
  follow: z.object({request_id:z.string().optional()}), merge: z.object({parent_request_id:textSchema}), move: z.object({space_id:textSchema}),
  cardPatch: z.object({question:textSchema.optional(),body:textSchema.optional(),category:categorySchema.optional(),expires_at:z.string().datetime().optional()}), order:z.object({order:z.number().int().min(0)}), check:z.object({question:textSchema}),
  pace:z.object({preset:z.enum(['Relaxed','Standard','Fast']).optional(),override:z.number().min(.5).max(2).optional()}).refine(x=>x.preset!==undefined||x.override!==undefined),
  decide:z.object({decision:z.enum(['approve','decline']),note:z.string().max(2000).default('')}),
  role:z.object({role:roleSchema}), roster:z.object({csv:textSchema}),
  space:z.object({code:textSchema,title:textSchema,term:textSchema,section:textSchema,instructor_id:textSchema,color_token:z.enum(['flare','sage','indigo','amber','clay']).default('flare'),allow_sibling_relay:z.boolean().default(false),template:z.enum(['Relaxed','Standard','Fast']).default('Standard')}),
  spacePatch:z.object({policy_locked:z.boolean().optional(),agent_enabled:z.boolean().optional(),archived:z.boolean().optional()}),
  announcement:z.object({title:textSchema,body:textSchema,url:httpUrl}),
  preferences:z.object({theme:z.enum(['system','light','dark']).optional(),leaderboard:z.boolean().optional(),notifications:z.boolean().optional(),tags_only:z.boolean().optional(),tags:z.array(z.string()).optional(),quiet_start:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),quiet_end:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional()}),
  mute:z.object({hours:z.number().min(0).max(24)}), push:z.object({token:z.string().regex(/^(ExponentPushToken|ExpoPushToken)\[.+\]$/)}), advance:z.object({hours:z.number().min(0).max(720)}), rollover:z.object({term:textSchema}),
};
export const errorSchema=z.object({error:z.object({code:z.string(),message:z.string()})});
// Transport responses are validated as JSON at the serialization boundary;
// endpoint-specific typed methods below narrow their data shape.
export const jsonSchema = z.json();
