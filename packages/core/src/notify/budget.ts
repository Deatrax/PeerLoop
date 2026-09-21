import type { Notification, Priority, Tier } from '../types';
// §11.3 counts "per user per space per day" — the day boundary is the space's local midnight,
// not UTC, or a Dhaka pilot would reset everyone's budget at 06:00 local.
function dayKey(timestamp:number,tz:string){return new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(timestamp);}
export function notificationChannel(existing:Notification[],user_id:string,space_id:string,tier:Tier,priority:Priority,now:number,budget=6,approval=false,tz='Asia/Dhaka'):'PUSH'|'DIGEST'{
  if(priority==='P0'||approval)return 'PUSH';
  if(tier==='T2'||tier==='T3')return 'DIGEST';
  const day=dayKey(now,tz);
  return existing.filter(n=>n.user_id===user_id&&n.space_id===space_id&&dayKey(Date.parse(n.created_at),tz)===day&&n.delivered_channel==='PUSH').length>=budget?'DIGEST':'PUSH';
}
export function digestDue(existing:Notification[],user_id:string,space_id:string,now:number){return !existing.some(n=>n.user_id===user_id&&n.space_id===space_id&&n.delivered_channel==='DIGEST'&&n.delivered_at&&now-Date.parse(n.delivered_at)<4*3600000);}
