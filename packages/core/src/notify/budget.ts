import type { Notification, Priority, Tier } from '../types';
export function notificationChannel(existing:Notification[],user_id:string,space_id:string,tier:Tier,priority:Priority,now:number,budget=6,approval=false):'PUSH'|'DIGEST'{
  if(priority==='P0'||approval)return 'PUSH';
  if(tier==='T2'||tier==='T3')return 'DIGEST';
  const day=new Date(now).toISOString().slice(0,10);
  return existing.filter(n=>n.user_id===user_id&&n.space_id===space_id&&n.created_at.startsWith(day)&&n.delivered_channel==='PUSH').length>=budget?'DIGEST':'PUSH';
}
export function digestDue(existing:Notification[],user_id:string,space_id:string,now:number){return !existing.some(n=>n.user_id===user_id&&n.space_id===space_id&&n.delivered_channel==='DIGEST'&&n.delivered_at&&now-Date.parse(n.delivered_at)<4*3600000);}
