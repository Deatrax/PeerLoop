import { terminalStates, type Database } from '@peerloop/core';

export function buildStaffDigests(state: Database, now: number) {
  const day = new Date(now).toISOString().slice(0,10);
  const monday = new Date(now).getUTCDay() === 1;
  let created=0;
  for (const member of state.space_memberships) {
    if (member.status !== 'ACTIVE' || member.role === 'STUDENT' || member.role === 'INSTRUCTOR' && !monday) continue;
    const space=state.spaces.find(s => s.id === member.space_id && !s.archived_at);
    const user=state.users.find(u => u.id === member.user_id);
    if (!space || !user?.preferences.notifications) continue;
    const event_type=member.role==='CR'?'digest.cr_daily':'digest.instructor_weekly';
    const id=`${event_type}:${day}:${space.id}:${member.user_id}`;
    if (state.notifications.some(n => n.id === id)) continue;
    const requests=state.requests.filter(r => r.space_id===space.id);
    const open=requests.filter(r => !terminalStates.includes(r.state));
    const unresolved=requests.filter(r => r.state==='CLOSED_UNRESOLVED' && now-Date.parse(r.updated_at)<7*86400000);
    const pending=state.approval_tasks.filter(a => a.space_id===space.id && a.state==='PENDING' && a.assignee_role===member.role).length;
    const review=state.knowledge_items.filter(k => k.space_id===space.id && k.status==='UNVERIFIED').length;
    const text=`${space.code} · ${space.title}\n${open.length} open requests · ${pending} approvals waiting · ${review} answers to review\nUnresolved this week: ${unresolved.length}\n${unresolved.slice(0,10).map(r => `• ${r.normalised_question}`).join('\n')}\nOpen PeerLoop to review your course hub.`;
    state.notifications.push({id,user_id:user.id,space_id:space.id,event_type,payload:{text},read_at:null,delivered_channel:'DIGEST',delivery_state:'PENDING',created_at:new Date(now).toISOString(),delivered_at:null,error:null});
    created++;
  }
  return {created};
}
