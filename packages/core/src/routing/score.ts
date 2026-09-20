import type { SpaceMembership, ScoreBreakdown } from '../types';
import { jaccard } from '../knowledge/search';
export function scoreAudience(members:SpaceMembership[],author:SpaceMembership,tags:string[],now:number){
  const eligible=members.filter(m=>m.space_id===author.space_id&&m.status==='ACTIVE'&&m.user_id!==author.user_id&&m.role!=='INSTRUCTOR'&&(!m.muted_until||Date.parse(m.muted_until)<=now));
  const counts=eligible.map(m=>m.notified_count_7d).sort((a,b)=>a-b);const quartile=counts[Math.max(0,Math.ceil(counts.length/4)-1)]??0;
  const scored=eligible.map(member=>{const terms:ScoreBreakdown={topic_affinity:member.accepted_tags.length?jaccard(tags,member.accepted_tags):.25,responsiveness:(member.accepted_answers_30d+1)/(member.notified_count_30d+3),recent_activity:2**(-Math.max(0,now-Date.parse(member.last_active_at))/(72*3600000)),structural_proximity:member.section===author.section?(member.lab_group&&member.lab_group===author.lab_group?1:.6):.3,role_bonus:member.role==='CR'?.5:member.verified_helper?.4:0,load_penalty:Math.min(1,member.notifications_sent_today/(member.notification_budget_override??6)),total:0,fairness:false};terms.total=.35*terms.topic_affinity+.20*terms.responsiveness+.15*terms.recent_activity+.15*terms.structural_proximity+.15*terms.role_bonus-.30*terms.load_penalty;return {member,terms};}).sort((a,b)=>b.terms.total-a.terms.total||a.member.user_id.localeCompare(b.member.user_id));
  const n=Math.min(12,Math.max(5,Math.ceil(members.filter(m=>m.space_id===author.space_id&&m.status==='ACTIVE').length*.25)));
  if(scored.filter(s=>s.terms.total>.2).length<5)return {tier:'T2' as const,shortlist:scored,n};
  const floor=scored.filter(s=>s.member.notified_count_7d<=quartile).slice(0,2);floor.forEach(s=>{s.terms.fairness=true;});
  const shortlist=[...floor,...scored.filter(s=>!floor.includes(s))].slice(0,n).sort((a,b)=>b.terms.total-a.terms.total);
  return {tier:'T1' as const,shortlist,n};
}
