import type { Analytics, ApprovalTask, CreateOutcome, EscalationPolicy, KnowledgeItem, Message, Request, SearchHit, Space, SpaceSummary, Thread, User } from './types';
import type { z } from 'zod';
import type { cardInputSchema, createRequestSchema, inputSchemas, pinInputSchema } from './schemas';
export interface Repository {
  call<T>(method:string,path:string,body?:unknown):Promise<T>;
  listSpacesForUser():Promise<SpaceSummary[]>;
  createRequest(input:z.input<typeof createRequestSchema>):Promise<CreateOutcome>;
  getRequest(id:string):Promise<Thread>;
  postMessage(id:string,body:string,publish?:boolean):Promise<Message>;
  acceptAnswer(id:string,message_id:string):Promise<Request>;
  followRequest(id:string,request_id?:string):Promise<Request>;
  escalateNow(id:string):Promise<Request>;
  holdRequest(id:string,reason:string):Promise<Request>;
  searchKnowledge(space_id:string,q?:string):Promise<KnowledgeItem[]>;
  pinReference(space_id:string,data:z.input<typeof pinInputSchema>):Promise<KnowledgeItem>;
  reorderPins(id:string,order:number):Promise<KnowledgeItem[]>;
  verifyCard(id:string):Promise<KnowledgeItem>;
  getPolicy(space_id:string,request_class?:string):Promise<EscalationPolicy>;
  updatePolicy(space_id:string,policy:EscalationPolicy):Promise<EscalationPolicy>;
  listApprovals():Promise<ApprovalTask[]>;
  decideApproval(id:string,decision:'approve'|'decline',note?:string):Promise<ApprovalTask>;
  getSpaceAnalytics(id:string):Promise<Analytics>;
  getOrgAnalytics(id:string):Promise<{space:Space;analytics:Analytics}[]>;
  authorCard(space_id:string,data:z.input<typeof cardInputSchema>):Promise<KnowledgeItem>;
  checkCard(space_id:string,question:string):Promise<SearchHit[]>;
  getMe():Promise<User>;
  listRequests(scope?:string,space_id?:string):Promise<Request[]>;
  setActiveSpace(space_id:string):Promise<User>;
  updatePreferences(data:z.input<typeof inputSchemas.preferences>):Promise<User>;
}
export abstract class BaseRepository implements Repository {
  abstract call<T>(method:string,path:string,body?:unknown):Promise<T>;
  listSpacesForUser(){return this.call<SpaceSummary[]>('GET','/spaces');}
  createRequest(input:z.input<typeof createRequestSchema>){return this.call<CreateOutcome>('POST','/requests',input);}
  getRequest(id:string){return this.call<Thread>('GET',`/requests/${encodeURIComponent(id)}`);}
  postMessage(id:string,body:string,publish=false){return this.call<Message>('POST',`/requests/${id}/messages`,{body,publish});}
  acceptAnswer(id:string,message_id:string){return this.call<Request>('POST',`/requests/${id}/accept`,{message_id});}
  followRequest(id:string,request_id?:string){return this.call<Request>('POST',`/requests/${id}/follow`,{request_id});}
  escalateNow(id:string){return this.call<Request>('POST',`/requests/${id}/escalate`);}
  holdRequest(id:string,reason:string){return this.call<Request>('POST',`/requests/${id}/hold`,{reason});}
  searchKnowledge(space_id:string,q=''){return this.call<KnowledgeItem[]>('GET',`/spaces/${space_id}/knowledge?q=${encodeURIComponent(q)}`);}
  pinReference(space_id:string,data:z.input<typeof pinInputSchema>){return this.call<KnowledgeItem>('POST',`/spaces/${space_id}/knowledge/pins`,data);}
  reorderPins(id:string,order:number){return this.call<KnowledgeItem[]>('PATCH',`/knowledge/${id}/pin-order`,{order});}
  verifyCard(id:string){return this.call<KnowledgeItem>('POST',`/knowledge/${id}/verify`);}
  getPolicy(space_id:string,request_class='KNOWLEDGE'){return this.call<EscalationPolicy>('GET',`/spaces/${space_id}/escalation-policy?request_class=${request_class}`);}
  updatePolicy(space_id:string,policy:EscalationPolicy){return this.call<EscalationPolicy>('PUT',`/spaces/${space_id}/escalation-policy?request_class=${policy.request_class}`,policy);}
  listApprovals(){return this.call<ApprovalTask[]>('GET','/approvals?assignee=me');}
  decideApproval(id:string,decision:'approve'|'decline',note=''){return this.call<ApprovalTask>('POST',`/approvals/${id}/decide`,{decision,note});}
  getSpaceAnalytics(id:string){return this.call<Analytics>('GET',`/spaces/${id}/analytics`);}
  getOrgAnalytics(id:string){return this.call<{space:Space;analytics:Analytics}[]>('GET',`/orgs/${id}/analytics`);}
  authorCard(space_id:string,data:z.input<typeof cardInputSchema>){return this.call<KnowledgeItem>('POST',`/spaces/${space_id}/knowledge/cards`,data);}
  checkCard(space_id:string,question:string){return this.call<SearchHit[]>('POST',`/spaces/${space_id}/knowledge/cards/check`,{question});}
  getMe(){return this.call<User>('GET','/users/me');}
  listRequests(scope='mine',space_id?:string){return this.call<Request[]>('GET',`/requests?scope=${scope}${space_id?`&space_id=${space_id}`:''}`);}
  setActiveSpace(space_id:string){return this.call<User>('PATCH','/users/me/active-space',{space_id});}
  updatePreferences(data:z.input<typeof inputSchemas.preferences>){return this.call<User>('PATCH','/users/me/preferences',data);}
}
