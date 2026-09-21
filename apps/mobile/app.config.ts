import type { ExpoConfig } from 'expo/config';
// Single source of truth for Expo config. A static app.json alongside this file would be
// silently discarded, which is how the icon and Android adaptive icon went missing before.
const config:ExpoConfig={name:'PeerLoop',slug:'peerloop',scheme:'peerloop',version:'1.0.0',orientation:'portrait',userInterfaceStyle:'automatic',icon:'./assets/icon.png',plugins:['expo-router','expo-font','expo-secure-store','expo-notifications'],experiments:{typedRoutes:true},web:{bundler:'metro',favicon:'./assets/favicon.png'},ios:{supportsTablet:true},android:{adaptiveIcon:{backgroundColor:'#E6F4FE',foregroundImage:'./assets/android-icon-foreground.png',backgroundImage:'./assets/android-icon-background.png',monochromeImage:'./assets/android-icon-monochrome.png'},predictiveBackGestureEnabled:false},extra:{apiUrl:process.env.EXPO_PUBLIC_API_URL??'http://localhost:3000',eas:{projectId:process.env.EXPO_PUBLIC_EAS_PROJECT_ID}}};
export default config;
