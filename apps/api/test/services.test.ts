import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedDatabase, Engine } from '@peerloop/core';
import { buildStaffDigests } from '../lib/digests';
import { deliver } from '../lib/dispatch';
import { mint, authenticate } from '../lib/auth';
const now=Date.parse('2026-09-21T06:00:00Z');
test('staff digests are role-scoped, include unresolved work and are idempotent',()=>{
  const state=seedDatabase(now);assert.ok(buildStaffDigests(state,now).created>0);assert.equal(buildStaffDigests(state,now).created,0);
  for(const n of state.notifications){assert.ok(state.space_memberships.some(m=>m.user_id===n.user_id&&m.space_id===n.space_id&&m.role!=='STUDENT'));assert.match(n.payload.text,/Unresolved this week/);}
});
test('delivery uses real email for staff digests and honors opt-out',async()=>{
  const state=seedDatabase(now);buildStaffDigests(state,now);const n=state.notifications[0];const user=state.users.find(u=>u.id===n.user_id)!;
  const previous=process.env.EMAIL_WEBHOOK_URL;process.env.EMAIL_WEBHOOK_URL='https://mail.example.test/send';
  try {
    let calls=0;const send:typeof fetch=async (_url,init)=>{calls++;assert.equal(new Headers(init?.headers).get('Idempotency-Key'),n.id);assert.equal(JSON.parse(String(init?.body)).to,user.email);return new Response('{}',{status:200});};
    assert.equal(await deliver([{...n,user,attempts:0}],send),'DIGEST');assert.equal(calls,1);
    user.preferences.notifications=false;assert.equal(await deliver([{...n,user,attempts:0}],send),'IN_APP');assert.equal(calls,1);
  } finally {if(previous===undefined)delete process.env.EMAIL_WEBHOOK_URL;else process.env.EMAIL_WEBHOOK_URL=previous;}
});
test('push failures are surfaced; absent device tokens mean in-app, not delivered push',async()=>{
  const state=seedDatabase(now);const e=new Engine(state,{user_id:'arisha',now});e.notify(e.request('open-authority'),'rifat','request.reply','Reply');const n=state.notifications[0],user=state.users.find(u=>u.id===n.user_id)!;
  assert.equal(await deliver([{...n,user,attempts:0}]),'IN_APP');user.push_tokens=['ExpoPushToken[test]'];
  await assert.rejects(()=>deliver([{...n,user,attempts:0}],async()=>Response.json({data:[{status:'error'}]})),/did not accept/);
  assert.equal(await deliver([{...n,user,attempts:0}],async()=>Response.json({data:[{status:'ok'}]})),n.delivered_channel);
});
test('signed sessions validate issuer and reject tampered bearer tokens',async()=>{
  const previous=process.env.JWT_SECRET;process.env.JWT_SECRET='test-only-secret-at-least-thirty-two-characters';
  try {const token=await mint('arisha');assert.equal(await authenticate(new Request('http://test',{headers:{Authorization:`Bearer ${token}`}})),'arisha');await assert.rejects(()=>authenticate(new Request('http://test',{headers:{Authorization:`Bearer ${token}x`}})),/expired/);await assert.rejects(()=>authenticate(new Request('http://test')),/Sign in/);}finally{if(previous===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previous;}
});
