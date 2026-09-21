import AsyncStorage from '@react-native-async-storage/async-storage';
import { BaseRepository, Engine, seedDatabase, responseSchema, type Database } from '@peerloop/core';
// Bumped from v1: snapshots written by earlier builds are dropped rather than trusted.
const storageKey='peerloop-offline-v2';
export class LocalRepository extends BaseRepository {
  private tail:Promise<unknown>=Promise.resolve();
  private offset=0;
  constructor(private uid:()=>string,private scale:()=>number){super();}
  // A snapshot from an older build can be missing fields the UI now reads, which white-screens
  // a whole tab instead of failing loudly. Sanity-check it and fall back to a fresh seed.
  private async read():Promise<Database>{
    const saved=await AsyncStorage.getItem(storageKey);
    if(!saved)return seedDatabase(Date.now());
    try{
      const db=JSON.parse(saved) as Database;
      const fresh=seedDatabase(Date.now());
      const usable=(Object.keys(fresh) as (keyof Database)[]).every(t=>Array.isArray(db[t]))
        &&db.requests.every(r=>r.category&&r.state&&r.priority);
      return usable?db:fresh;
    }catch{return seedDatabase(Date.now());}
  }
  async call<T>(method:string,path:string,body:unknown={}):Promise<T>{const work=this.tail.then(async()=>{const db=await this.read();const engine=new Engine(db,{user_id:this.uid()||'arisha',now:Date.now()+this.offset,time_scale:this.scale()});let value:unknown;
    if(path==='/dev/reset'){value={ok:true};await AsyncStorage.setItem(storageKey,JSON.stringify(seedDatabase(Date.now())));this.offset=0;await AsyncStorage.removeItem('peerloop-clock-offset');return value as T;}
    if(path==='/dev/inspect')value=db.agent_runs.slice(-20);
    else if(path==='/dev/advance'){this.offset+=Number((body as {hours:number}).hours)*3600000;engine.ctx.now=Date.now()+this.offset;value={swept:engine.sweep(undefined,200)};await AsyncStorage.setItem('peerloop-clock-offset',String(this.offset));}
    else if(path==='/auth/dev-login'){const user=db.users.find(u=>u.student_id===(body as {studentId:string}).studentId);if(!user)throw new Error('Demo account not found.');value={user,token:'offline-demo'};}
    else value=await engine.handle(method,path,body);await AsyncStorage.setItem(storageKey,JSON.stringify(db));return responseSchema(method,path).parse(JSON.parse(JSON.stringify(value))) as T;});this.tail=work.catch(()=>undefined);return work;}
  async sweep(){this.offset=Number(await AsyncStorage.getItem('peerloop-clock-offset'))||0;return this.call('GET','/spaces');}
}
