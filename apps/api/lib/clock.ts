import { sql } from 'drizzle-orm';
import { database } from '../db/client';
export async function serverNow(){if(process.env.NODE_ENV==='production')return Date.now();const rows=await database().execute(sql`select result from job_runs where id='dev-clock'`);const result=rows[0]?.result as {offset?:number}|undefined;return Date.now()+(result?.offset??0);}
export async function advanceClock(hours:number){const db=database();await db.execute(sql`insert into job_runs(id,finished_at,result) values('dev-clock',now(),jsonb_build_object('offset',${hours*3600000}::bigint)) on conflict(id) do update set result=jsonb_build_object('offset',coalesce((job_runs.result->>'offset')::bigint,0)+${hours*3600000}::bigint),finished_at=now()`);return serverNow();}
