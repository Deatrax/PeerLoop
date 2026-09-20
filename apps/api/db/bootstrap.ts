import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { database } from './client';
import { Engine } from '@peerloop/core';
import { transact } from '../lib/store';

// Non-destructive pilot bootstrap: never loads demo content or resets a database.
const config=z.object({ORGANIZATION_ID:z.string().min(1),ADMIN_EMAIL:z.email(),ADMIN_NAME:z.string().min(1),INSTRUCTOR_EMAIL:z.email(),INSTRUCTOR_NAME:z.string().min(1),COURSE_CODE:z.string().min(1),COURSE_TITLE:z.string().min(1),COURSE_TERM:z.string().min(1),COURSE_SECTION:z.string().min(1)}).parse(process.env);
await database().transaction(async tx=>{
  for(const [email,name,admin] of [[config.ADMIN_EMAIL,config.ADMIN_NAME,true],[config.INSTRUCTOR_EMAIL,config.INSTRUCTOR_NAME,false]] as const){
    const id=randomUUID();
    const preferences={theme:'system',leaderboard:false,notifications:true,tags_only:false,tags:[],quiet_start:'23:00',quiet_end:'07:00'};
    const rows=await tx.execute(sql`insert into users(id,student_id,name,email,avatar_initials,push_tokens,preferences,created_at) values(${id},${email.toLowerCase()},${name},${email.toLowerCase()},${name.split(' ').map(s=>s[0]).slice(0,2).join('')},'[]'::jsonb,${JSON.stringify(preferences)}::jsonb,now()) on conflict(email) do update set name=excluded.name returning id`);
    if(admin)await tx.execute(sql`insert into org_memberships(user_id,org_id,role) values(${rows[0].id},${config.ORGANIZATION_ID},'DEPT_ADMIN') on conflict(user_id,org_id) do nothing`);
  }
});
await transact(async state=>{
  if(state.spaces.some(s=>s.org_id===config.ORGANIZATION_ID&&s.code===config.COURSE_CODE&&s.term===config.COURSE_TERM&&s.section===config.COURSE_SECTION))return;
  const admin=state.users.find(u=>u.email===config.ADMIN_EMAIL.toLowerCase())!;
  const instructor=state.users.find(u=>u.email===config.INSTRUCTOR_EMAIL.toLowerCase())!;
  const engine=new Engine(state,{user_id:admin.id,now:Date.now()});
  await engine.handle('POST','/spaces',{code:config.COURSE_CODE,title:config.COURSE_TITLE,term:config.COURSE_TERM,section:config.COURSE_SECTION,instructor_id:instructor.id});
});
console.log('Pilot accounts prepared. No existing course data was removed.');
process.exit(0);
