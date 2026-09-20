import { Redirect } from 'expo-router';
import { useRole, useSession } from '../store/session';
export default function Index(){const user=useSession(s=>s.user),role=useRole();if(!user)return <Redirect href="/(auth)/sign-in"/>;return <Redirect href={role==='DEPT_ADMIN'||role==='SYS_ADMIN'?'/(dept)/hubs':role==='CR'?'/(cr)/queue':role==='INSTRUCTOR'?'/(instructor)/overview':'/(student)'}/>;}
