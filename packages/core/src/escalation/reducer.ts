import type { EscalationPolicy, Request, Tier } from '../types';
import { terminalStates } from '../types';
import { nextDeadline } from './dwell';
export type EscalationDecision={action:'WAIT';reason:string}|{action:'ADVANCE'|'APPROVAL'|'CLOSE';tier:Tier;next_escalation_at:string|null;reason:string;dedupe_key:string};
export function escalationReducer(request:Request,policy:EscalationPolicy,now:number):EscalationDecision{
  if(terminalStates.includes(request.state)||['ANSWERED_BY_KB','CHECKING','DRAFT','AWAITING_APPROVAL'].includes(request.state)||request.held_reason||!request.next_escalation_at||Date.parse(request.next_escalation_at)>now)return {action:'WAIT',reason:'No step is due.'};
  if(request.grace_until&&Date.parse(request.grace_until)>now)return {action:'WAIT',reason:'A substantive reply or claim has paused the clock.'};
  const index=policy.steps.findIndex(s=>s.tier===request.audience_tier);const next=policy.steps[index+1];
  const key=`${request.id}:${next?.tier??'closed'}:${request.attempt+1}`;
  if(!next)return {action:'CLOSE',tier:request.audience_tier,next_escalation_at:null,dedupe_key:key,reason:`Closed after reaching ${policy.steps.slice(0,index+1).map(s=>s.tier).join(', ')}; ${request.responder_ids.length} people notified over ${Math.round((now-Date.parse(request.created_at))/60000)} minutes.`};
  if(next.manual_only)return {action:'WAIT',reason:'The instructor must initiate the department step.'};
  if(next.requires_approval||next.tier==='T5'||next.tier==='T6')return {action:'APPROVAL',tier:next.tier,next_escalation_at:null,dedupe_key:key,reason:`A human must approve sending this to ${next.tier==='T5'?'the instructor':'the department'}.`};
  return {action:'ADVANCE',tier:next.tier,next_escalation_at:nextDeadline(now,next.tier,request.priority,policy),dedupe_key:key,reason:`No accepted answer at ${request.audience_tier}; moved to ${next.tier==='T2'?'the full space':'the class representative'}.`};
}
