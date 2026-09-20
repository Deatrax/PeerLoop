import type { Repository } from '@peerloop/core';
import { HttpRepository } from './http';
import { LocalRepository } from './local';
let configuration={backend:'http' as 'http'|'local',uid:'',scale:1};
const http=new HttpRepository(()=>configuration.uid,()=>configuration.scale);
const local=new LocalRepository(()=>configuration.uid,()=>configuration.scale);
export function configureRepository(next:Partial<typeof configuration>){configuration={...configuration,...next};}
export function getRepository():Repository{return configuration.backend==='local'?local:http;}
export function getCached<T>(path:string){return configuration.backend==='http'?http.cached<T>(path):Promise.resolve(null);}
export async function sweepOnResume(){if(configuration.backend==='local')await local.sweep();else if(configuration.uid)await http.listSpacesForUser();}
export { apiUrl, saveToken } from './http';
