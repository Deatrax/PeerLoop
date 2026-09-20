import type { ExpoConfig } from 'expo/config';
const config:ExpoConfig={name:'PeerLoop',slug:'peerloop',scheme:'peerloop',version:'1.0.0',orientation:'portrait',userInterfaceStyle:'automatic',plugins:['expo-router','expo-font','expo-secure-store'],experiments:{typedRoutes:true},web:{bundler:'metro'},ios:{supportsTablet:true},extra:{apiUrl:process.env.EXPO_PUBLIC_API_URL??'http://localhost:3000'}};
export default config;
