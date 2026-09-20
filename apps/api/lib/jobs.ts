import { Engine, scoreAudience } from "@peerloop/core";
import { sql } from "drizzle-orm";
import { database } from "../db/client";
import { transact } from "./store";
import { dispatchNotifications } from "./dispatch";
import { buildStaffDigests } from "./digests";
import { rollupMetrics } from "./metrics";
export async function runJob(job: string) {
  const now = Date.now();
  const result = job === 'escalation-tick' ? await sweepDue(now) : job === 'metrics-rollup' ? await rollupMetrics() : await transact(
    async (state) => {
      const e = new Engine(state, { user_id: "system", now });
      if (job === "escalation-tick") {
        const swept = e.sweep(undefined, 200);
        return { swept };
      }
      if (job === "digest-builder")
        return buildStaffDigests(state, now);
      if (job === "knowledge-staleness") {
        let stale = 0;
        for (const k of state.knowledge_items)
          if (
            k.status !== "RETIRED" &&
            Date.parse(k.expires_at) <= now &&
            k.status !== "STALE"
          ) {
            k.previously_verified = k.status === "VERIFIED";
            k.status = "STALE";
            stale++;
          }
        return { stale };
      }
      if (job === "score-recompute") {
        for (const m of state.space_memberships) {
          const recipients = state.request_recipients.filter(
            (r) =>
              r.user_id === m.user_id &&
              state.requests.some(
                (q) => q.id === r.request_id && q.space_id === m.space_id,
              ),
          );
          m.notified_count_7d = recipients.filter(
            (r) => now - Date.parse(r.notified_at) < 7 * 86400000,
          ).length;
          m.notified_count_30d = recipients.filter(
            (r) => now - Date.parse(r.notified_at) < 30 * 86400000,
          ).length;
          m.notifications_sent_today = state.notifications.filter(
            (n) =>
              n.user_id === m.user_id &&
              n.space_id === m.space_id &&
              n.delivered_channel === "PUSH" &&
              n.created_at.startsWith(new Date(now).toISOString().slice(0, 10)),
          ).length;
          m.accepted_answers_30d = state.messages.filter(
            (a) =>
              a.author_id === m.user_id &&
              a.is_accepted &&
              now - Date.parse(a.created_at) < 30 * 86400000 &&
              state.requests.some(
                (r) => r.id === a.request_id && r.space_id === m.space_id,
              ),
          ).length;
          m.verified_helper = m.accepted_answers_30d >= 5;
          const author = state.space_memberships.find(
            (a) => a.space_id === m.space_id && a.user_id !== m.user_id,
          );
          m.helper_score = author
            ? (scoreAudience([m, author], author, [], now).shortlist.find(
                (s) => s.member.id === m.id,
              )?.terms.total ?? 0)
            : 0;
        }
        return { members: state.space_memberships.length };
      }
      throw new Error("Unknown job");
    },
    { cron: job === "escalation-tick" },
  );
  const delivery = ['escalation-tick','digest-builder'].includes(job) ? await dispatchNotifications(now,job==='digest-builder') : {};
  await database().execute(
    sql`insert into job_runs(id,finished_at,result) values(${job},now(),${JSON.stringify(result)}::jsonb) on conflict(id) do update set finished_at=now(),result=excluded.result`,
  );
  return {...result,...delivery};
}
async function sweepDue(now:number) {
  const due=await database().execute(sql`select distinct space_id from (select space_id from requests where next_escalation_at<=now() and state in ('ROUTED','ESCALATED','IN_PROGRESS') order by next_escalation_at limit 200) due union select space_id from approval_tasks where state='PENDING' limit 200`);
  let swept=0;
  for(const row of due){
    const space_id=String(row.space_id);
    swept+=await transact(state=>new Engine(state,{user_id:'system',now}).sweep(space_id,Math.max(0,200-swept)),{scope:{space_id,user_id:'system'}});
  }
  return {swept};
}
