import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SpaceSummary, User } from '@peerloop/core';
import { configureRepository, getRepository, saveToken } from '../lib/repo';
interface Session { user:User|null; spaces:SpaceSummary[]; active:string; backend:'http'|'local'; scale:number; ready:boolean; revision:number; error:string|null; toast:string|null; hydrate:()=>Promise<void>; login:(studentId:string)=>Promise<void>; setBackend:(mode:'http'|'local')=>Promise<void>; switchSpace:(id:string)=>Promise<void>; refresh:()=>Promise<void>; setScale:(scale:number)=>void; logout:()=>Promise<void>; notify:(message:string)=>void; fail:(error:unknown)=>void }
export const useSession=create<Session>((set,get)=>({user:null,spaces:[],active:'',backend:'http',scale:1,ready:false,revision:0,error:null,toast:null,
  async hydrate(){try{const saved=await AsyncStorage.getItem('peerloop-session');if(saved){const session=JSON.parse(saved) as {backend:'http'|'local';user:User;scale:number};set({backend:session.backend,user:session.user,active:session.user.active_space_id??'',scale:session.scale});configureRepository({backend:session.backend,uid:session.user.id,scale:session.scale});await get().refresh();}}catch(error){get().fail(error);}finally{set({ready:true});}},
  async login(studentId){const result=await getRepository().call<{user:User;token:string}>('POST','/auth/dev-login',{studentId});if(get().backend==='http')await saveToken(result.token);configureRepository({uid:result.user.id});set({user:result.user,active:result.user.active_space_id??'',error:null});await get().refresh();},
  async setBackend(backend){configureRepository({backend,uid:''});set({backend,user:null,spaces:[],active:'',error:null});await AsyncStorage.removeItem('peerloop-session');},
  async switchSpace(id){const user=await getRepository().setActiveSpace(id);set({active:id,user});await get().refresh();},
  async refresh(){const repo=getRepository();const [user,spaces]=await Promise.all([repo.getMe(),repo.listSpacesForUser()]);const active=spaces.some(s=>s.id===get().active)?get().active:spaces[0]?.id??'';set({user,spaces,active,revision:get().revision+1});configureRepository({uid:user.id});await AsyncStorage.setItem('peerloop-session',JSON.stringify({user:{...user,active_space_id:active},backend:get().backend,scale:get().scale}));},
  setScale(scale){configureRepository({scale});set({scale});void get().refresh();},
  async logout(){await saveToken(null);await AsyncStorage.removeItem('peerloop-session');configureRepository({uid:''});set({user:null,spaces:[],active:'',error:null});},
  notify(toast){set({toast});setTimeout(()=>set({toast:null}),3500);},
  fail(error){set({error:error instanceof Error?error.message:String(error)});},
}));
export function useActiveSpace(){return useSession(s=>s.spaces.find(x=>x.id===s.active));}
export function useRole(){return useSession(s=>s.user?.org_roles?.[0]?.role??s.spaces.find(x=>x.id===s.active)?.role??'STUDENT');}
