import { DomainError } from './permissions';
const routes:[RegExp,string[]][]=[
  [/^\/users\/me$/,['GET']], [/^\/users\/me\/(active-space|preferences)$/,['PATCH']], [/^\/users\/me\/push-token$/,['POST']],
  [/^\/notifications$/,['GET']], [/^\/notifications\/[^/]+\/read$/,['POST']],
  [/^\/spaces$/,['GET','POST']], [/^\/spaces\/join$/,['POST']], [/^\/spaces\/[^/]+$/,['PATCH']],
  [/^\/spaces\/[^/]+\/members$/,['GET']], [/^\/spaces\/[^/]+\/members\/import$/,['POST']], [/^\/spaces\/[^/]+\/members\/[^/]+$/,['PATCH']],
  [/^\/spaces\/[^/]+\/(join-code\/rotate|mute|announcements)$/,['POST']],
  [/^\/spaces\/[^/]+\/escalation-policy$/,['GET','PUT']], [/^\/spaces\/[^/]+\/pace$/,['PUT']],
  [/^\/spaces\/[^/]+\/(analytics|knowledge|knowledge\/review|knowledge\/recurring)$/,['GET']],
  [/^\/spaces\/[^/]+\/knowledge\/(pins|cards|cards\/check)$/,['POST']],
  [/^\/requests$/,['GET','POST']], [/^\/requests\/[^/]+$/,['GET','PATCH']],
  [/^\/requests\/[^/]+\/(messages|accept|follow|route|claim|privacy|close|merge|unmerge|hold|resume|escalate|move)$/,['POST']],
  [/^\/knowledge\/[^/]+$/,['GET','PATCH']], [/^\/knowledge\/[^/]+\/pin-order$/,['PATCH']], [/^\/knowledge\/[^/]+\/(flag|verify|retire|refresh)$/,['POST']],
  [/^\/approvals$/,['GET']], [/^\/approvals\/[^/]+\/decide$/,['POST']],
  [/^\/orgs\/[^/]+\/(spaces|analytics|people|audit)$/,['GET']], [/^\/orgs\/[^/]+\/rollover$/,['POST']],
  [/^\/agent-runs\/[^/]+$/,['GET']],
];
export function assertMethod(method:string,path:string){const route=routes.find(([pattern])=>pattern.test(path));if(!route)throw new DomainError('NOT_FOUND','This endpoint does not exist.',404);if(!route[1].includes(method))throw new DomainError('METHOD_NOT_ALLOWED','This operation requires '+route[1].join(' or ')+'.',405);}
