import { sql } from 'drizzle-orm';
import { database } from '../db/client';

// Creation-day cohorts are recomputed so late resolutions update historical rows.
export const metricsRollupSQL=sql`insert into metrics_daily(space_id,day,requests_created,kb_resolved,peer_resolved,cr_resolved,unresolved,median_first_response_minutes,duplicate_rate,escalation_rate)
select r.space_id,to_char(r.created_at at time zone 'UTC','YYYY-MM-DD'),count(*)::int,
count(*) filter(where r.state='RESOLVED' and r.audience_tier='T0')::int,
count(*) filter(where r.state='RESOLVED' and r.audience_tier in ('T1','T2','T3'))::int,
count(*) filter(where r.state='RESOLVED' and r.audience_tier='T4')::int,
count(*) filter(where r.state='CLOSED_UNRESOLVED')::int,
coalesce(percentile_cont(0.5) within group(order by greatest(0,extract(epoch from (reply.at-r.created_at))/60)) filter(where reply.at is not null),0),
count(*) filter(where r.state='MERGED')::float/count(*),
count(*) filter(where exists(select 1 from request_events e where e.request_id=r.id and e.to_state='ESCALATED'))::float/count(*)
from requests r left join lateral(select min(m.created_at) as at from messages m where m.request_id=r.id and m.author_type='USER' and m.author_id<>r.author_id) reply on true
group by r.space_id,to_char(r.created_at at time zone 'UTC','YYYY-MM-DD')
on conflict(space_id,day) do update set requests_created=excluded.requests_created,kb_resolved=excluded.kb_resolved,peer_resolved=excluded.peer_resolved,cr_resolved=excluded.cr_resolved,unresolved=excluded.unresolved,median_first_response_minutes=excluded.median_first_response_minutes,duplicate_rate=excluded.duplicate_rate,escalation_rate=excluded.escalation_rate
returning space_id,day`;
export async function rollupMetrics(){const rows=await database().execute(metricsRollupSQL);return {cohorts:rows.length};}
