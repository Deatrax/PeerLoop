import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { database } from '../../db/client';
export const dynamic='force-dynamic';
export async function GET(){const start=Date.now();try{const db=database();await db.execute(sql`select 1`);const runs=await db.execute(sql`select id,finished_at from job_runs order by finished_at desc limit 1`);return NextResponse.json({status:'ok',build_sha:process.env.VERCEL_GIT_COMMIT_SHA??'local',database_latency_ms:Date.now()-start,last_cron_run:runs[0]??null});}catch{return NextResponse.json({status:'database_unavailable',build_sha:process.env.VERCEL_GIT_COMMIT_SHA??'local',database_latency_ms:null,last_cron_run:null},{status:503});}}
