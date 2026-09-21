import type { Repository } from '@peerloop/core';
import { HttpRepository } from './http';
import { LocalRepository } from './local';
let configuration={backend:'http' as 'http'|'local',uid:'',scale:1};
const http=new HttpRepository(()=>configuration.uid,()=>configuration.scale);
const local=new LocalRepository(()=>configuration.uid,()=>configuration.scale);
export function configureRepository(next:Partial<typeof configuration>){configuration={...configuration,...next};}
export function getRepository():Repository{return configuration.backend==='local'?local:http;}
export function getCached<T>(path:string){return configuration.backend==='http'?http.cached<T>(path):Promise.resolve(null);}
// Over HTTP the server sweeps on any space read, and every caller of this follows it with
// refresh(), which reads spaces anyway — so fetching here just doubled the request.
export async function sweepOnResume(){if(configuration.backend==='local')await local.sweep();}
export { apiUrl, saveToken } from './http';
