import { useColorScheme } from 'react-native';
import { useSession } from '../store/session';
export const light={ink:'#14151f',paper:'#f5f2ea',panel:'#ffffff',panel2:'#efece1',flare:'#ff5a2e',flareInk:'#8a2e12',flareTint:'#ffe6db',resolved:'#1f7a5c',resolvedInk:'#1f7a5c',resolvedTint:'#e2f2ea',indigo:'#4b5bd6',indigoInk:'#2f3a9c',indigoTint:'#e5e7fb',amber:'#b07500',amberTint:'#fcefd2',muted:'#726d5f',line:'#e6e0cf'};
export const dark={ink:'#f1efe6',paper:'#0e0e13',panel:'#1a1a22',panel2:'#232330',flare:'#ff7c52',flareInk:'#ffd6c4',flareTint:'#3a2216',resolved:'#4bd8a5',resolvedInk:'#4bd8a5',resolvedTint:'#153228',indigo:'#8c97f2',indigoInk:'#c6ccff',indigoTint:'#20233f',amber:'#e9b64a',amberTint:'#3a2e12',muted:'#a29c8c',line:'#2c2c3a'};
export const fonts={body:'InstrumentSans_400Regular',medium:'InstrumentSans_500Medium',semi:'InstrumentSans_600SemiBold',bold:'InstrumentSans_700Bold',display:'Fraunces_500Medium_Italic',number:'Fraunces_600SemiBold'};
export function useTheme(){const system=useColorScheme();const manual=useSession(s=>s.user?.preferences.theme??'system');return (manual==='system'?system:manual)==='dark'?dark:light;}
