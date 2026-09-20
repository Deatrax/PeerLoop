import type { SpaceRole, OrgRole } from './types';
export const permissions = {
  create:['STUDENT','CR','INSTRUCTOR'], respond:['STUDENT','CR','INSTRUCTOR'], manage:['CR','INSTRUCTOR'], knowledge:['CR','INSTRUCTOR'], policy:['CR','INSTRUCTOR','DEPT_ADMIN','SYS_ADMIN'], lock:['INSTRUCTOR','DEPT_ADMIN','SYS_ADMIN'], assign:['INSTRUCTOR','DEPT_ADMIN','SYS_ADMIN'], createSpace:['DEPT_ADMIN','SYS_ADMIN'], analytics:['CR','INSTRUCTOR','DEPT_ADMIN','SYS_ADMIN'], approve:['CR','INSTRUCTOR','DEPT_ADMIN','SYS_ADMIN'], org:['DEPT_ADMIN','SYS_ADMIN'],
} satisfies Record<string,(SpaceRole|OrgRole)[]>;
export class DomainError extends Error { constructor(public code:string,message:string,public status=400){super(message);} }
export function assertPermission(role:SpaceRole|OrgRole,action:keyof typeof permissions){if(!(permissions[action] as readonly string[]).includes(role)) throw new DomainError('FORBIDDEN','Your role cannot perform this action.',403);}
export function requireRole(membership:{role:SpaceRole|OrgRole},role:'CR'|'INSTRUCTOR'){assertPermission(membership.role,role==='CR'?'manage':'assign');}
