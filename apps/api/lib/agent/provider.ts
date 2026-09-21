import type { ClassifyContext, LLMProvider } from '@peerloop/core';

// §10 Step 1. The model only ever classifies — it never answers, never routes and never
// escalates. An answer comes from retrieved knowledge or not at all, and routing is
// deterministic code so a CR can be shown why someone was picked.
const CONTRACT = `You classify requests from a university course hub. Reply with JSON only, matching exactly:
{"category":"MATERIAL|INFORMATION|ACADEMIC_HELP|COORDINATION|LOGISTICS_AUTHORITY|CAMPUS_ISSUE",
 "request_class":"KNOWLEDGE|AUTHORITY|HYBRID",
 "priority_suggested":"P0|P1|P2|P3",
 "priority_reason":"at most 12 words",
 "tags":["lowercase topic words"],
 "normalised_question":"at most 140 characters",
 "detected_space_hint":"a course code mentioned in the text that is NOT the current hub, else null",
 "contains_personal_info":true|false}

category: MATERIAL asks for slides, notes, recordings or templates. INFORMATION asks where,
when or which. ACADEMIC_HELP asks to explain or understand. COORDINATION asks who is doing
what. LOGISTICS_AUTHORITY asks permission or a change to a deadline, room or rule.
CAMPUS_ISSUE reports something broken or unsafe.

request_class is the escalation axis and matters most:
- KNOWLEDGE: anyone holding the information can resolve it. Widens across peers.
- AUTHORITY: only someone with power to decide can resolve it. Skips peers entirely.
  Always use this for LOGISTICS_AUTHORITY and CAMPUS_ISSUE.
- HYBRID: peers may hold part of the answer but a decision is eventually needed. Use this
  when the text both asks something answerable by classmates and implies a decision someone
  in authority must make.

priority: P0 only for work blocked right now with a deadline inside three hours. P1 for a
deadline today or tomorrow. P3 when the asker says it is not urgent. Otherwise P2. Do not
raise priority because the asker sounds anxious; require an actual time signal.

contains_personal_info is true for anything carrying an email, phone number, student ID,
medical detail or an individual's grades.`;

type Usage = { tokens_in: number; tokens_out: number };

export class RemoteProvider implements LLMProvider {
  name = `openai:${process.env.MODEL_NAME ?? 'gpt-5.6-sol'}`;
  lastUsage: Usage = { tokens_in: 0, tokens_out: 0 };
  async classify(text: string, ctx: ClassifyContext): Promise<unknown> {
    const endpoint = process.env.MODEL_ENDPOINT, key = process.env.MODEL_API_KEY;
    if (!endpoint || !key) throw new Error('Model provider is not configured.');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.MODEL_NAME ?? 'gpt-5.6-sol',
        messages: [
          { role: 'system', content: CONTRACT },
          { role: 'user', content: `Course hub: ${ctx.code}\n${ctx.priority_requested ? `The asker chose priority ${ctx.priority_requested}.\n` : ''}Request:\n${text}` },
        ],
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Model HTTP ${response.status}`);
    const body = await response.json() as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    this.lastUsage = { tokens_in: body.usage?.prompt_tokens ?? 0, tokens_out: body.usage?.completion_tokens ?? 0 };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error('Model returned no content.');
    // Invalid JSON throws here; core's classify() retries once, then falls back to the
    // heuristic and flags the request for CR review. A bad model never blocks a student.
    return JSON.parse(content);
  }
}
