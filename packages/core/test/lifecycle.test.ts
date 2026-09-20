import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine, seedDatabase, type ApprovalTask, type Request } from '../src/index';
const now=Date.parse('2026-09-20T06:00:00Z');
function setup(){const db=seedDatabase(now);return {db,e:new Engine(db,{user_id:'arisha',now})};}
async function awaiting(){const {db,e}=setup();const r=(await e.create({space_id:'cse4790',body_text:'Can we get permission to extend the laboratory deadline?'})).request;e.ctx.now=Date.parse(r.next_escalation_at!);e.sweep(r.space_id);return {db,e,r,task:db.approval_tasks.find(a=>a.request_id===r.id)!};}
test('closing expires approvals, posts a summary, and cannot be reopened by claim or approval',async()=>{
  const {db,e,r,task}=await awaiting();
  await e.handle('POST',`/requests/${r.id}/close`,{reason:'No longer needed'});
  assert.equal(task.state,'EXPIRED');assert.equal(r.next_escalation_at,null);
  assert.match(db.messages.find(m=>m.request_id===r.id&&m.author_type==='SYSTEM')!.body_markdown,/People notified/);
  await assert.rejects(()=>e.handle('POST',`/requests/${r.id}/claim`),/closed/);
  e.ctx.user_id='rifat';await e.handle('POST',`/approvals/${task.id}/decide`,{decision:'approve'});
  assert.equal(r.state,'CLOSED_UNRESOLVED');
  for(const action of ['hold','resume','unmerge'])await assert.rejects(()=>e.handle('POST',`/requests/${r.id}/${action}`,{reason:'test'}));
});
test('accepting an answer expires an outstanding escalation',async()=>{
  const {e,r,task}=await awaiting();e.ctx.user_id='rifat';const m=e.message(r.id,{body:'The existing deadline still applies.'});e.ctx.user_id='arisha';e.accept(r.id,{message_id:m.id});assert.equal(task.state,'EXPIRED');
});
test('legacy stale approvals cannot resurrect a resolved request',async()=>{
  const {e,r,task}=await awaiting();r.state='RESOLVED';e.ctx.user_id='rifat';const result=await e.handle('POST',`/approvals/${task.id}/decide`,{decision:'approve'}) as ApprovalTask;assert.equal(result.state,'EXPIRED');assert.equal(r.state,'RESOLVED');
});
test('overdue approvals remind instructor once without escalating',async()=>{
  const {e,db,r,task}=await awaiting();const start=e.ctx.now;e.ctx.now=start+24*3600000;e.sweep();e.sweep();assert.equal(db.notifications.filter(n=>n.event_type===`approval.reminder.${task.id}`).length,1);assert.equal(r.state,'AWAITING_APPROVAL');assert.equal(r.audience_tier,'T4');
});
test('Helping excludes own, answered and closed threads',async()=>{
  const {e,db}=setup();e.ctx.user_id='rifat';const r=(await e.create({space_id:'cse4790',body_text:'How does orbital xenon synchronization work?',reject_knowledge:true})).request;
  if(!db.request_recipients.some(x=>x.request_id===r.id&&x.user_id==='arisha'))db.request_recipients.push({request_id:r.id,user_id:'arisha',tier:'T1',notified_at:e.iso(),opened_at:null,responded_at:null,score_snapshot:null});
  e.ctx.user_id='arisha';let rows=await e.handle('GET','/requests?scope=helping') as Request[];assert.ok(rows.some(q=>q.id===r.id));assert.ok(rows.every(q=>q.author_id!=='arisha'));
  e.message(r.id,{body:'Checking the notes.'});rows=await e.handle('GET','/requests?scope=helping') as Request[];assert.ok(!rows.some(q=>q.id===r.id));
});
test('move is close-and-reopen, preserves author and records both references',async()=>{
  const {e,db}=setup();const r=(await e.create({space_id:'cse4790',body_text:'Where is the zirconium workbook?',reject_knowledge:true})).request;
  e.ctx.user_id='rifat';const moved=await e.handle('POST',`/requests/${r.id}/move`,{space_id:'cse4712'}) as Request;
  assert.equal(r.space_id,'cse4790');assert.equal(r.state,'CLOSED_UNRESOLVED');assert.equal(moved.space_id,'cse4712');assert.equal(moved.author_id,'arisha');assert.match(r.closed_reason!,new RegExp(moved.id));assert.ok(db.request_events.some(v=>v.request_id===moved.id&&v.reason.includes(r.id)));
});
test('cross-hub move requires authority in both hubs',async()=>{
  const {e}=setup();e.ctx.user_id='nasrin';await assert.rejects(()=>e.handle('POST','/requests/open-authority/move',{space_id:'cse4712'}),/member|role/);
});
test('rejecting knowledge respects a newly disabled agent',async()=>{
  const {e,db}=setup();const r=(await e.create({space_id:'cse4790',body_text:'Does anyone have the CSE 4790 Week 6 slides?'})).request;db.spaces.find(s=>s.id===r.space_id)!.agent_enabled=false;await e.handle('POST',`/requests/${r.id}/route`);assert.equal(r.audience_tier,'T4');
});
test('student publish fails before adding a message',()=>{
  const {e,db}=setup();const before=db.messages.length;assert.throws(()=>e.message('open-horizontal',{body:'Unapproved official answer',publish:true}),/role/);assert.equal(db.messages.length,before);
});
test('joining activates an existing pending invitation',async()=>{
  const {e,db}=setup();db.space_memberships.find(m=>m.user_id==='arisha'&&m.space_id==='cse4790')!.status='PENDING_INVITE';await e.handle('POST','/spaces/join',{code:db.spaces[0].join_code});assert.equal(e.membership('cse4790').status,'ACTIVE');
});
