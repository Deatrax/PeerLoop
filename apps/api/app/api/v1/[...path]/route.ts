import { NextRequest, NextResponse, after } from 'next/server';
import { DomainError, Engine, inputSchemas, seedDatabase, responseSchema } from '@peerloop/core';
import { ZodError } from 'zod';
import { withAuth, authRoute } from '../../../../lib/auth';
import { transact, requestScope } from '../../../../lib/store';
import { dispatchNotifications } from '../../../../lib/dispatch';
import { RemoteProvider } from '../../../../lib/agent/provider';
import { serverNow, advanceClock } from '../../../../lib/clock';
export const runtime='nodejs';
function cors(req:Request){const origin=req.headers.get('origin')??'';const allowed=(process.env.CORS_ORIGINS??'http://localhost:8081,http://localhost:19006').split(',');const dev=process.env.NODE_ENV!=='production'&&/^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(origin);return {'Access-Control-Allow-Origin':allowed.includes(origin)||dev?origin:allowed[0],Vary:'Origin','Access-Control-Allow-Methods':'GET,POST,PATCH,PUT,OPTIONS','Access-Control-Allow-Headers':'Authorization,Content-Type,X-Peerloop-Time-Scale,Idempotency-Key'};}
export async function OPTIONS(req:NextRequest){return new NextResponse(null,{status:204,headers:cors(req)});}
async function handler(req:NextRequest){
  try{
    const path=req.nextUrl.pathname.replace('/api/v1/','');
    let body:unknown={};
    if(['POST','PUT','PATCH'].includes(req.method)){if(Number(req.headers.get('content-length')??0)>100000)throw new DomainError('BODY_TOO_LARGE','Request bodies must be under 100 KB.',413);const text=await req.text();if(text.length>100000)throw new DomainError('BODY_TOO_LARGE','Request bodies must be under 100 KB.',413);if(text){try{body=JSON.parse(text);}catch{throw new DomainError('JSON','Send a valid JSON body.');}}}
    if(path.startsWith('auth/')){if(req.method!=='POST')throw new DomainError('METHOD','Use POST.',405);return NextResponse.json(await authRoute(path.slice(5),req,body),{headers:cors(req)});}
    return await withAuth(async(request,user_id)=>{
      const development=process.env.NODE_ENV!=='production';
      if(path.startsWith('dev/')&&!development)throw new DomainError('NOT_FOUND','Not found.',404);
      if(path==='dev/reset'){if(req.method!=='POST')throw new DomainError('METHOD','Use POST.',405);const now=await serverNow();return NextResponse.json(await transact(()=>({ok:true}),{reset:seedDatabase(now)}),{headers:cors(req)});}
      let now=await serverNow();
      if(path==='dev/advance'){if(req.method!=='POST')throw new DomainError('METHOD','Use POST.',405);now=await advanceClock(inputSchemas.advance.parse(body).hours);}
      const scope=await requestScope(path,body,user_id);
      const result=await transact(async db=>{
        const scale=development?Math.min(3600,Math.max(1,Number(request.headers.get('X-Peerloop-Time-Scale'))||1)):1;
        const engine=new Engine(db,{user_id,now,time_scale:scale,provider:process.env.MODEL_ENDPOINT?new RemoteProvider():undefined,measure:()=>performance.now()});
        if(path==='dev/inspect')return db.agent_runs.slice(-20);
        if(path==='dev/advance')return {swept:engine.sweep(undefined,200)};
        return responseSchema(req.method,req.nextUrl.pathname).parse(await engine.handle(req.method,req.nextUrl.pathname+req.nextUrl.search,body));
      },{scope});
      after(async()=>{await dispatchNotifications(Date.now()).catch(error=>console.error('Notification dispatch failed',String(error)));});
      return NextResponse.json(result,{headers:cors(req)});
    })(req);
  }catch(error){
    const status=error instanceof DomainError?error.status:error instanceof ZodError?400:503;
    const message=error instanceof DomainError?error.message:error instanceof ZodError?error.issues.map(i=>i.message).join('; '):'The API could not complete this operation. Check its database and server configuration.';
    if(status>=500)console.error(error);
    return NextResponse.json({error:{code:error instanceof DomainError?error.code:status===400?'VALIDATION':'SERVICE_UNAVAILABLE',message}},{status,headers:cors(req)});
  }
}
export const GET=handler;
export const POST=handler;
export const PATCH=handler;
export const PUT=handler;
