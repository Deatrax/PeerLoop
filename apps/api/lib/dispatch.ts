import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { Notification, User } from '@peerloop/core';
import { database } from '../db/client';

type Delivery = Notification & { attempts: number; user: User };
export async function deliver(entries: Delivery[], send: typeof fetch = fetch) {
  const first = entries[0], user = first.user;
  const email = first.event_type.startsWith('digest.');
  const text = entries.map(n => n.payload.text).join('\n\n');
  if (!user.preferences.notifications) return 'IN_APP' as const;
  if (email) {
    if (!process.env.EMAIL_WEBHOOK_URL) throw new Error('EMAIL_WEBHOOK_URL is not configured');
    const response = await send(process.env.EMAIL_WEBHOOK_URL, {
      method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${process.env.EMAIL_WEBHOOK_SECRET ?? ''}`, 'Idempotency-Key':first.id},
      body:JSON.stringify({to:user.email, subject:'Your PeerLoop course digest', text}), signal:AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Email delivery returned ${response.status}`);
    return 'DIGEST' as const;
  }
  if (!user.push_tokens.length) return 'IN_APP' as const;
  const response = await send('https://exp.host/--/api/v2/push/send', {
    method:'POST', headers:{'Content-Type':'application/json', ...(process.env.EXPO_ACCESS_TOKEN ? {Authorization:`Bearer ${process.env.EXPO_ACCESS_TOKEN}`} : {})},
    body:JSON.stringify(user.push_tokens.slice(-10).map(to => ({to,title:'PeerLoop',body:entries.length > 1 ? `${entries.length} updates in your course hub` : first.payload.text.slice(0,200),data:first.payload,sound:'default',channelId:'peerloop'}))), signal:AbortSignal.timeout(8000),
  });
  const body = await response.json() as {data?: {status:string}[]};
  if (!response.ok || !Array.isArray(body.data) || body.data.length !== Math.min(10,user.push_tokens.length) || body.data.some(ticket => ticket.status !== 'ok')) throw new Error(`Expo did not accept all notification tickets (${response.status})`);
  return first.delivered_channel;
}

// Delivery is at-least-once. No network request occurs inside a domain transaction.
// A lease prevents overlapping after()/cron workers; failed rows retry.
export async function dispatchNotifications(now: number, digests = false) {
  const db = database(), owner = randomUUID();
  const lease = await db.execute(sql`insert into job_leases(id,owner,expires_at) values('notification-delivery',${owner},now()+interval '90 seconds') on conflict(id) do update set owner=excluded.owner,expires_at=excluded.expires_at where job_leases.expires_at<now() returning id`);
  if (!lease.length) return {sent:0,failed:0,busy:true};
  let sent=0,failed=0;
  try {
    const rows = await db.execute(sql`select row_to_json(n) as notification,row_to_json(u) as person from notifications n join users u on u.id=n.user_id where (n.delivery_state='PENDING' or n.delivery_state='FAILED' and n.attempts<5) and (n.next_attempt_at is null or n.next_attempt_at<=now()) and (n.delivered_channel='PUSH' or ${digests} and n.delivered_channel='DIGEST') and (n.delivered_channel<>'DIGEST' or n.event_type like 'digest.%' or not exists(select 1 from notifications recent where recent.user_id=n.user_id and recent.space_id=n.space_id and recent.delivered_channel='DIGEST' and recent.delivered_at>now()-interval '4 hours')) order by n.created_at limit 100`);
    const groups = new Map<string,Delivery[]>();
    for (const row of rows) {
      const n={...(row.notification as Delivery),user:row.person as User};
      const key=n.delivered_channel==='DIGEST'&&!n.event_type.startsWith('digest.')?`${n.user_id}:${n.space_id}`:n.id;
      groups.set(key,[...(groups.get(key)??[]),n]);
    }
    const started=Date.now();
    for (const entries of groups.values()) {
      if (Date.now()-started>40000) break;
      try {
        const channel=await deliver(entries);
        for (const n of entries) await db.execute(sql`update notifications set delivery_state='SENT',delivered_channel=${channel},delivered_at=${new Date(now).toISOString()},error=null,attempts=attempts+1,next_attempt_at=null where id=${n.id}`);
        sent+=entries.length;
      } catch (error) {
        for (const n of entries) await db.execute(sql`update notifications set delivery_state='FAILED',error=${error instanceof Error ? error.message : 'Delivery failed'},attempts=attempts+1,next_attempt_at=now()+${Math.min(3600,60*2**n.attempts)}*interval '1 second' where id=${n.id}`);
        failed+=entries.length;
      }
    }
    return {sent,failed};
  } finally { await db.execute(sql`delete from job_leases where id='notification-delivery' and owner=${owner}`); }
}
