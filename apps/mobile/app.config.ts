import type { ExpoConfig } from 'expo/config';
const config:ExpoConfig={name:'PeerLoop',slug:'peerloop',scheme:'peerloop',version:'1.0.0',orientation:'portrait',userInterfaceStyle:'automatic',plugins:['expo-router','expo-font','expo-secure-store','expo-notifications'],experiments:{typedRoutes:true},web:{bundler:'metro'},ios:{supportsTablet:true},extra:{apiUrl:process.env.EXPO_PUBLIC_API_URL??'http://localhost:3000',eas:{projectId:process.env.EXPO_PUBLIC_EAS_PROJECT_ID}}};
export default config;
