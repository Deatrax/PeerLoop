import { sql } from 'drizzle-orm';
import type { Database } from '@peerloop/core';
import { database } from '../db/client';
export const tableOrder:(keyof Database)[]=['users','spaces','org_memberships','space_memberships','escalation_policies','requests','request_events','request_recipients','messages','knowledge_items','approval_tasks','notifications','agent_runs'];
const keys:Partial<Record<keyof Database,string[]>>={org_memberships:['user_id','org_id'],request_recipients:['request_id','user_id']};
type Row=Record<string,unknown>;
export async function transact<T>(operation:(state:Database)=>Promise<T>|T,options:{cron?:boolean;reset?:Database}={}):Promise<T>{
  const db=database();
  return db.transaction(async tx=>{
    // One pilot-sized transaction lock protects cross-table invariants, quotas,
    // merge counts and the outbox. The row lock below also supports cron workers.
    await tx.execute(sql`select pg_advisory_xact_lock(47904712)`);
    if(options.cron)await tx.execute(sql`select id from requests where next_escalation_at <= now() and state in ('ROUTED','ESCALATED','IN_PROGRESS') order by next_escalation_at limit 200 for update skip locked`);
    const raw:Record<string,unknown>={};for(const table of tableOrder){const rows=await tx.execute(sql`select row_to_json(t) as row from ${sql.identifier(table)} t`);raw[table]=rows.map(r=>r.row);}
    // PostgreSQL JSON serialization boundary: schema.ts defines the stored shapes.
    const before=raw as unknown as Database;
    const state=options.reset??JSON.parse(JSON.stringify(before)) as Database;
    const result=await operation(state);
    if(options.reset)await tx.execute(sql`truncate table ${sql.join([...tableOrder].reverse().map(t=>sql.identifier(t)),sql`, `)} cascade`);
    for(const table of tableOrder){const pk=keys[table]??['id'];const oldRows=before[table] as unknown as Row[];const rows=state[table] as unknown as Row[];
      for(const row of rows){const old=options.reset?undefined:oldRows.find(r=>pk.every(k=>r[k]===row[k]));if(old&&JSON.stringify(old)===JSON.stringify(row))continue;if(old&&(table==='request_events'||table==='agent_runs'))throw new Error('Audit records are append-only.');
        const cols=Object.keys(row);const conflict=pk.map(k=>sql.identifier(k));const update=cols.filter(c=>!pk.includes(c)).map(c=>sql`${sql.identifier(c)} = excluded.${sql.identifier(c)}`);
        // json_populate_record delegates JSON/date conversion to the actual table types.
        const tail=table==='request_events'||table==='agent_runs'?sql`do nothing`:sql`do update set ${sql.join(update,sql`, `)}`;
        await tx.execute(sql`insert into ${sql.identifier(table)} (${sql.join(cols.map(c=>sql.identifier(c)),sql`, `)}) select ${sql.join(cols.map(c=>sql.identifier(c)),sql`, `)} from json_populate_record(null::${sql.identifier(table)}, ${JSON.stringify(row)}::json) on conflict (${sql.join(conflict,sql`, `)}) ${tail}`);
      }
    }
    return result;
  });
}
