import React, { useEffect } from 'react';
import { AppState, View } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { Fraunces_500Medium_Italic, Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import { InstrumentSans_400Regular, InstrumentSans_500Medium, InstrumentSans_600SemiBold, InstrumentSans_700Bold } from '@expo-google-fonts/instrument-sans';
import { StatusBar } from 'expo-status-bar';
import { useSession } from '../store/session';
import { sweepOnResume } from '../lib/repo';
import { Copy, Loading, Toast } from '../components';
import { useTheme } from '../theme/tokens';
export default function Root(){const [fonts,error]=useFonts({Fraunces_500Medium_Italic,Fraunces_600SemiBold,InstrumentSans_400Regular,InstrumentSans_500Medium,InstrumentSans_600SemiBold,InstrumentSans_700Bold});const ready=useSession(s=>s.ready),user=useSession(s=>s.user),backend=useSession(s=>s.backend);const theme=useTheme();useEffect(()=>{void useSession.getState().hydrate();},[]);useEffect(()=>{const sweep=()=>{if(useSession.getState().user)void sweepOnResume().then(()=>useSession.getState().refresh()).catch(useSession.getState().fail);};const sub=AppState.addEventListener('change',state=>{if(state==='active')sweep();});const timer=setInterval(()=>{if(AppState.currentState==='active'||AppState.currentState===null)sweep();},backend==='local'?2000:30000);return()=>{sub.remove();clearInterval(timer);};},[user?.id,backend]);return <SafeAreaProvider><View style={{flex:1,backgroundColor:theme.paper}}><StatusBar style={theme.paper==='#0e0e13'?'light':'dark'}/>{error?<Copy>Fonts could not load: {error.message}</Copy>:!fonts||!ready?<Loading/>:<><Stack screenOptions={{headerShown:false,contentStyle:{backgroundColor:theme.paper},animation:'fade'}}/><Toast/></>}</View></SafeAreaProvider>;}
