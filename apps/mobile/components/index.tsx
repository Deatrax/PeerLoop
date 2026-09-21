import React, { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AccessibilityInfo,
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  FadeIn,
  SlideInDown,
  SlideOutDown,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import {
  router,
  useFocusEffect,
  useSegments,
  type Href,
  Slot,
} from "expo-router";
import type { Request, SpaceSummary, Tier } from "@peerloop/core";
import { fonts, useTheme } from "../theme/tokens";
import { useActiveSpace, useRole, useSession } from "../store/session";
import { HubSwitcherPill } from "./SpaceSwitcher";
import { Action, BackRow, Banner, Copy, LinkButton, Row } from "./primitives";
export * from "./primitives";
export function TopLine({
  title,
  scoped = true,
  back = false,
}: {
  title: string;
  scoped?: boolean;
  back?: boolean;
}) {
  const t = useTheme();
  return (
    <View style={{ paddingTop: 10, paddingBottom: 14, gap: 8 }}>
      <Row style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
        {back ? (
          <BackRow title={title} />
        ) : (
          <Action
            label="PeerLoop demo controls"
            onLongPress={() => router.push("/(dev)/console")}
          >
            <Text
              style={{ fontFamily: fonts.display, fontSize: 22, color: t.ink }}
            >
              <Text style={{ color: t.flare }}>● </Text>
              {title === "Home" ? "PeerLoop" : title}
            </Text>
          </Action>
        )}
        {scoped ? (
          <HubSwitcherPill />
        ) : title === "Home" ? (
          <LinkButton
            label="Search ⌕"
            onPress={() => router.push("/(student)/search")}
          />
        ) : null}
      </Row>
    </View>
  );
}
export function Screen({
  title,
  children,
  scoped = true,
  back = false,
}: {
  title: string;
  children: React.ReactNode;
  scoped?: boolean;
  back?: boolean;
}) {
  const t = useTheme();
  const error = useSession((s) => s.error);
  const [refreshing, setRefreshing] = useState(false);
  // refresh() bumps the session revision, which every useResource subscribes to, so one pull
  // reloads the session and every resource on the screen.
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void useSession
      .getState()
      .refresh()
      .catch(useSession.getState().fail)
      .finally(() => setRefreshing(false));
  }, []);
  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: t.paper }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, width: "100%", maxWidth: 480, alignSelf: "center" }}
      >
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 30 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={t.muted}
              colors={[t.flare]}
            />
          }
        >
          <TopLine title={title} scoped={scoped} back={back} />
          {error && (
            <Banner>
              {error}
              <LinkButton
                label="Dismiss"
                onPress={() => useSession.setState({ error: null })}
              />
            </Banner>
          )}
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export function Toast() {
  const text = useSession((s) => s.toast),
    t = useTheme();
  return text ? (
    <Animated.View
      entering={FadeIn.duration(200)}
      style={{
        position: "absolute",
        bottom: 85,
        left: 24,
        right: 24,
        alignSelf: "center",
        maxWidth: 432,
        backgroundColor: t.ink,
        borderRadius: 14,
        padding: 14,
      }}
    >
      <Copy style={{ color: t.paper }}>{text}</Copy>
    </Animated.View>
  ) : null;
}
export function useResource<T>(
  load: () => Promise<T>,
  dependencies: unknown[] = [],
) {
  const [result, setResult] = useState<{key:string; data:T} | null>(null),
    [loading, setLoading] = useState(true);
  const rev = useSession((s) => s.revision);
  const user = useSession(s=>s.user?.id), backend = useSession(s=>s.backend);
  const key = JSON.stringify(['resource-v1', backend, user, load.toString(), dependencies]);
  const sequence=useRef(0);
  const loader=useRef(load); loader.current=load;
  const reload = useCallback(async () => {
    const ticket=++sequence.current;
    let fresh=false;
    const valid=()=>ticket===sequence.current;
    void AsyncStorage.getItem(key).then(value=>{
      if(value && valid() && !fresh) setResult({key,data:JSON.parse(value) as T});
    }).catch(()=>{});
    try {
      setLoading(true);
      const data=await loader.current();
      fresh=true;
      if(valid()) {
        setResult({key,data});
        void AsyncStorage.setItem(key,JSON.stringify(data)).catch(()=>{});
      }
    } catch (e) {
      if(valid()) useSession.getState().fail(e);
    } finally {
      if(valid()) setLoading(false);
    }
  }, [key, rev]);
  useFocusEffect(
    useCallback(() => {
      void reload();
      return ()=>{sequence.current++;};
    }, [reload]),
  );
  return { data:result?.key===key?result.data:null, loading, reload };
}
export function Loading() {
  return (
    <View style={{ padding: 24 }}>
      <ActivityIndicator accessibilityLabel="Loading PeerLoop" />
    </View>
  );
}
export function DataList<T>({
  data,
  render,
  keyFor,
}: {
  data: T[];
  render: (item: T) => React.ReactElement;
  keyFor: (item: T) => string;
}) {
  // Screen already provides the ScrollView, so a FlatList here is a nested VirtualizedList:
  // React Native warns about it and, with scrolling disabled, it renders every row anyway.
  // A keyed map gives the same output without the warning.
  return (
    <>
      {data.map((item) => (
        <React.Fragment key={keyFor(item)}>{render(item)}</React.Fragment>
      ))}
    </>
  );
}
const tabs = {
  STUDENT: [
    ["Home", "/(student)"],
    ["Ask", "/(student)/ask"],
    ["Hub", "/(student)/hub"],
    ["Profile", "/(student)/profile"],
  ],
  CR: [
    ["Queue", "/(cr)/queue"],
    ["Requests", "/(cr)/requests"],
    ["Knowledge", "/(cr)/knowledge"],
    ["Hub", "/(cr)/settings"],
  ],
  INSTRUCTOR: [
    ["Overview", "/(instructor)/overview"],
    ["Needs you", "/(instructor)/needs-you"],
    ["Insights", "/(instructor)/insights"],
    ["Course", "/(instructor)/course"],
  ],
  DEPT_ADMIN: [
    ["Hubs", "/(dept)/hubs"],
    ["Analytics", "/(dept)/analytics"],
    ["Admin", "/(dept)/admin"],
  ],
  SYS_ADMIN: [
    ["Hubs", "/(dept)/hubs"],
    ["Analytics", "/(dept)/analytics"],
    ["Admin", "/(dept)/admin"],
  ],
};
export function TabBar() {
  const role = useRole(),
    t = useTheme(),
    segments = useSegments();
  const current = segments.join("/");
  return (
    <SafeAreaView
      edges={["bottom"]}
      style={{
        backgroundColor: t.panel,
        borderTopWidth: 1,
        borderColor: t.line,
      }}
    >
      <Row
        style={{
          width: "100%",
          maxWidth: 480,
          alignSelf: "center",
          flexWrap: "nowrap",
          gap: 0,
        }}
      >
        {tabs[role].map(([label, path], i) => {
          const active =
            current === path.slice(1) ||
            (label === "Home" && current === "(student)");
          return (
            <Action
              key={label}
              label={label}
              onPress={() => router.replace(path as Href)}
              style={{
                flex: 1,
                alignItems: "center",
                paddingVertical: 10,
                gap: 3,
              }}
            >
              <Text style={{ fontSize: 21, color: active ? t.flare : t.muted }}>
                {["⌂", "＋", "▤", "◉"][i]}
              </Text>
              <Copy
                small
                bold
                style={{ fontSize: 10, color: active ? t.flare : t.muted }}
              >
                {label}
              </Copy>
            </Action>
          );
        })}
      </Row>
    </SafeAreaView>
  );
}
export function RoleLayout() {
  return (
    <View style={{ flex: 1 }}>
      <Slot />
      <TabBar />
    </View>
  );
}
