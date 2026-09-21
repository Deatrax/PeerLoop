import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { router, type Href } from 'expo-router';
import { getRepository } from './repo';
import { useSession } from '../store/session';

let registeredToken: string | null=null;
const supported=()=>Platform.OS!=='web' && Constants.executionEnvironment!==ExecutionEnvironment.StoreClient;
export async function registerNotifications(ask=false) {
  if (!supported()) return 'Push requires an installed development or release build. In-app notifications remain available.';
  if (useSession.getState().backend!=='http') return 'Device push is available with the HTTP API.';
  const projectId=Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return 'Configure EXPO_PUBLIC_EAS_PROJECT_ID and rebuild to enable device push.';
  const notifications=await import('expo-notifications');
  if (Platform.OS==='android') await notifications.setNotificationChannelAsync('peerloop',{name:'PeerLoop updates',importance:notifications.AndroidImportance.DEFAULT});
  let permission=await notifications.getPermissionsAsync();
  if (!permission.granted && ask && permission.canAskAgain) permission=await notifications.requestPermissionsAsync();
  if (!permission.granted) return 'Push is off. You can enable notifications in your device settings.';
  const userId=useSession.getState().user?.id;
  const token=(await notifications.getExpoPushTokenAsync({projectId})).data;
  if (!userId || userId!==useSession.getState().user?.id) return 'Sign in to enable notifications.';
  await getRepository().call('POST','/users/me/push-token',{token});
  registeredToken=token;
  return 'Device notifications enabled.';
}
export async function unregisterNotifications() {
  if (registeredToken && useSession.getState().backend==='http') {
    await getRepository().call('POST','/users/me/push-token',{token:registeredToken,remove:true});
    registeredToken=null;
  }
}
export async function observeNotifications() {
  if(!supported())return ()=>{};
  const notifications=await import('expo-notifications');
  notifications.setNotificationHandler({handleNotification:async()=>({shouldPlaySound:false,shouldSetBadge:false,shouldShowBanner:true,shouldShowList:true})});
  const open=(response: import('expo-notifications').NotificationResponse)=>{
    if(!useSession.getState().user)return;
    const data=response.notification.request.content.data ?? {};
    if(typeof data.request_id==='string')router.push(`/request/${encodeURIComponent(data.request_id)}` as Href);
    else if(typeof data.card_id==='string')router.push(`/card/${encodeURIComponent(data.card_id)}` as Href);
    void notifications.clearLastNotificationResponseAsync();
  };
  const previous=notifications.getLastNotificationResponse();
  if(previous)open(previous);
  const subscription=notifications.addNotificationResponseReceivedListener(open);
  return ()=>subscription.remove();
}
