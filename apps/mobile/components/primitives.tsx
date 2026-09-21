import React, { useCallback, useEffect, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
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
export function Copy({
  children,
  muted = false,
  small = false,
  bold = false,
  style,
}: {
  children: React.ReactNode;
  muted?: boolean;
  small?: boolean;
  bold?: boolean;
  style?: import("react-native").TextStyle;
}) {
  const t = useTheme();
  return (
    <Text
      style={[
        {
          fontFamily: bold ? fonts.semi : fonts.body,
          fontSize: small ? 12 : 14,
          lineHeight: small ? 18 : 22,
          color: muted ? t.muted : t.ink,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
export function Heading({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <Text
      style={{
        fontFamily: fonts.display,
        color: t.ink,
        fontSize: 29,
        lineHeight: 36,
        marginBottom: 8,
      }}
    >
      {children}
    </Text>
  );
}
export function Row({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
export function Action({
  label,
  onPress,
  children,
  style,
  disabled = false,
  onLongPress,
}: {
  label: string;
  onPress?: () => void;
  children?: React.ReactNode;
  style?: ViewStyle;
  disabled?: boolean;
  onLongPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onLongPress={onLongPress}
      onPress={() => {
        if (Platform.OS !== "web") void Haptics.selectionAsync();
        onPress?.();
      }}
      style={({ pressed }) => [
        {
          minHeight: 44,
          justifyContent: "center",
          opacity: disabled ? 0.45 : pressed ? 0.7 : 1,
        },
        style,
      ]}
    >
      {children ?? <Copy>{label}</Copy>}
    </Pressable>
  );
}
export function Card({
  children,
  onPress,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
}) {
  const t = useTheme();
  const content = (
    <View
      style={[
        {
          backgroundColor: t.panel,
          borderColor: t.line,
          borderWidth: 1,
          borderRadius: 16,
          padding: 15,
          gap: 8,
          marginBottom: 10,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
  return onPress ? (
    <Action label="Open details" onPress={onPress}>
      {content}
    </Action>
  ) : (
    content
  );
}
export function Pill({
  children,
  tone = "quiet",
}: {
  children: React.ReactNode;
  tone?: "quiet" | "flare" | "resolved" | "amber" | "indigo";
}) {
  const t = useTheme();
  const bg =
    tone === "quiet"
      ? t.panel2
      : tone === "flare"
        ? t.flareTint
        : tone === "resolved"
          ? t.resolvedTint
          : tone === "indigo"
            ? t.indigoTint
            : t.amberTint;
  const color =
    tone === "quiet"
      ? t.muted
      : tone === "flare"
        ? t.flareInk
        : tone === "resolved"
          ? t.resolvedInk
          : tone === "indigo"
            ? t.indigoInk
            : t.amber;
  return (
    <View
      style={{
        alignSelf: "flex-start",
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
        backgroundColor: bg,
      }}
    >
      <Copy small bold style={{ color, fontSize: 11, lineHeight: 16 }}>
        {children}
      </Copy>
    </View>
  );
}
export const Tag = ({ children }: { children: React.ReactNode }) => (
  <Pill>{children}</Pill>
);
export const SpaceChip = ({
  space,
}: {
  space?: Pick<SpaceSummary, "code" | "color_token">;
}) => (
  <Pill tone={space?.color_token === "indigo" ? "indigo" : "flare"}>
    ● {space?.code ?? "Course hub"}
  </Pill>
);
export function Segmented({
  values,
  value,
  onChange,
}: {
  values: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useTheme();
  return (
    <Row style={{ marginBottom: 14 }}>
      {values.map((v) => (
        <Action
          key={v}
          label={v}
          onPress={() => onChange(v)}
          style={{
            paddingHorizontal: 14,
            borderRadius: 999,
            backgroundColor: value === v ? t.ink : t.panel,
            borderWidth: 1,
            borderColor: t.line,
          }}
        >
          <Copy small bold style={{ color: value === v ? t.paper : t.muted }}>
            {v}
          </Copy>
        </Action>
      ))}
    </Row>
  );
}
export function PrimaryButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const t = useTheme();
  return (
    <Action
      label={label}
      onPress={onPress}
      disabled={disabled}
      style={{
        backgroundColor: t.ink,
        borderRadius: 14,
        padding: 13,
        alignItems: "center",
        marginVertical: 5,
      }}
    >
      <Copy bold style={{ color: t.paper }}>
        {label}
      </Copy>
    </Action>
  );
}
export function SecondaryButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const t = useTheme();
  return (
    <Action
      label={label}
      onPress={onPress}
      disabled={disabled}
      style={{
        borderColor: t.line,
        borderWidth: 1,
        borderRadius: 14,
        padding: 12,
        alignItems: "center",
        marginVertical: 5,
      }}
    >
      <Copy bold>{label}</Copy>
    </Action>
  );
}
export function LinkButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Action label={label} onPress={onPress}>
      <Copy small bold style={{ color: t.flare }}>
        {label}
      </Copy>
    </Action>
  );
}
export function Field({
  label,
  ...props
}: TextInputProps & { label?: string }) {
  const t = useTheme();
  return (
    <View style={{ marginBottom: 10 }}>
      {label && (
        <Copy small bold muted style={{ marginBottom: 6 }}>
          {label}
        </Copy>
      )}
      <TextInput
        accessibilityLabel={label ?? props.placeholder ?? "Text field"}
        placeholderTextColor={t.muted}
        {...props}
        style={[
          {
            fontFamily: fonts.body,
            fontSize: 14,
            color: t.ink,
            backgroundColor: t.panel2,
            borderWidth: 1,
            borderColor: t.line,
            borderRadius: 14,
            padding: 14,
            minHeight: 48,
            textAlignVertical: props.multiline ? "top" : "center",
          },
          props.multiline ? { minHeight: 110 } : undefined,
          props.style,
        ]}
      />
    </View>
  );
}
export function SearchField(props: TextInputProps) {
  return <Field placeholder="Search this hub" {...props} />;
}
export function NoteText({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View
      style={{
        backgroundColor: t.panel2,
        borderRadius: 12,
        padding: 13,
        marginVertical: 8,
      }}
    >
      <Copy muted small>
        {children}
      </Copy>
    </View>
  );
}
export function Banner({
  children,
  green = false,
}: {
  children: React.ReactNode;
  green?: boolean;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        backgroundColor: green ? t.resolvedTint : t.flareTint,
        borderRadius: 12,
        padding: 13,
        marginVertical: 8,
      }}
    >
      <Copy small bold style={{ color: green ? t.resolvedInk : t.flareInk }}>
        {children}
      </Copy>
    </View>
  );
}
export function Section({
  title,
  action,
  onPress,
}: {
  title: string;
  action?: string;
  onPress?: () => void;
}) {
  return (
    <Row
      style={{
        justifyContent: "space-between",
        marginTop: 16,
        marginBottom: 5,
      }}
    >
      <Copy
        small
        muted
        bold
        style={{ letterSpacing: 0.7, textTransform: "uppercase" }}
      >
        {title}
      </Copy>
      {action && <LinkButton label={action} onPress={() => onPress?.()} />}
    </Row>
  );
}
export function ListRow({
  title,
  subtitle,
  onPress,
  right,
}: {
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <Action
      label={title}
      onPress={onPress}
      style={{ paddingVertical: 12, borderBottomWidth: 1, borderColor: t.line }}
    >
      <Row style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
        <View style={{ flex: 1 }}>
          <Copy bold>{title}</Copy>
          {subtitle && (
            <Copy small muted>
              {subtitle}
            </Copy>
          )}
        </View>
        {right ?? (onPress ? <Copy muted>›</Copy> : null)}
      </Row>
    </Action>
  );
}
export const RefRow = ListRow;
export function EmptyState({
  title,
  body,
  action,
  onPress,
}: {
  title: string;
  body: string;
  action: string;
  onPress: () => void;
}) {
  return (
    <Card>
      <Heading>{title}</Heading>
      <Copy muted>{body}</Copy>
      <LinkButton label={action} onPress={onPress} />
    </Card>
  );
}
export function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const t = useTheme();
  return (
    <Row
      style={{
        justifyContent: "space-between",
        marginVertical: 10,
        flexWrap: "nowrap",
      }}
    >
      <Copy style={{ flex: 1 }}>{label}</Copy>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: t.flare, false: t.line }}
      />
    </Row>
  );
}
export function Stepper({ request }: { request: Request }) {
  const t = useTheme();
  const tiers: Tier[] = [...new Set<Tier>(['T0', ...(request.request_class==='AUTHORITY' ? ['T1' as const] : []), ...request.policy_snapshot.steps.map(s=>s.tier)])];
  const labels: Record<Tier, string> = {
    T0: "Asked",
    T1:
      request.request_class === "AUTHORITY"
        ? "Peers skipped"
        : "Targeted peers",
    T2: "Full batch",
    T3: "Sibling",
    T4: "With CR",
    T5: "Instructor",
    T6: "Department",
  };
  return (
    <Row
      style={{
        alignItems: "flex-start",
        flexWrap: "nowrap",
        marginVertical: 16,
      }}
    >
      {tiers.map((tier) => {
        const skip = request.skipped_tiers.includes(tier),
          current = request.audience_tier === tier,
          done = Number(tier[1]) < Number(request.audience_tier[1]) && !skip;
        return (
          <View key={tier} style={{ flex: 1, alignItems: "center", gap: 6 }}>
            <View
              style={{
                height: 24,
                width: 24,
                borderRadius: 12,
                borderWidth: 2,
                borderStyle: skip ? "dashed" : "solid",
                borderColor: done ? t.resolved : current ? t.flare : t.line,
                backgroundColor: skip
                  ? "transparent"
                  : done
                    ? t.resolved
                    : current
                      ? t.flare
                      : t.panel2,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {done && <Text style={{ color: t.panel }}>✓</Text>}
            </View>
            <Copy
              small
              style={{ textAlign: "center", fontSize: 9, lineHeight: 13 }}
            >
              {labels[tier]}
            </Copy>
          </View>
        );
      })}
      {['RESOLVED','CLOSED_UNRESOLVED'].includes(request.state) && <View style={{flex:1,alignItems:'center',gap:6}}><Text style={{fontSize:20,color:request.state==='RESOLVED'?t.resolved:t.muted}}>✓</Text><Copy small style={{fontSize:9,textAlign:'center'}}>{request.state==='RESOLVED'?'Resolved':'Closed'}</Copy></View>}
    </Row>
  );
}
export function AgentQuote({
  body,
  sources,
  onSource,
}: {
  body: string;
  sources: string[];
  onSource: (id: string) => void;
}) {
  const t = useTheme();
  return (
    <Card style={{ backgroundColor: t.resolvedTint }}>
      <Copy small bold style={{ color: t.resolvedInk }}>
        PeerLoop · from this hub’s knowledge
      </Copy>
      <Copy>{body}</Copy>
      {sources.map((id) => (
        <LinkButton
          key={id}
          label="Open cited knowledge ↗"
          onPress={() => onSource(id)}
        />
      ))}
    </Card>
  );
}
export function QueueCard({
  request,
  onPress,
}: {
  request: Request;
  onPress?: () => void;
}) {
  const spaces = useSession((s) => s.spaces);
  const resolved = request.state === "RESOLVED" || request.resolved_at;
  return (
    <Card
      onPress={onPress ?? (() => router.push(`/request/${request.id}` as Href))}
    >
      <Copy bold>{request.body_text}</Copy>
      <Row>
        <SpaceChip space={spaces.find((s) => s.id === request.space_id)} />
        {request.category ? (
          <Tag>{label(request.category)}</Tag>
        ) : null}
      </Row>
      <Row style={{ justifyContent: "space-between" }}>
        <Pill
          tone={
            resolved
              ? "resolved"
              : request.audience_tier === "T4"
                ? "flare"
                : "quiet"
          }
        >
          {resolved
            ? "Resolved"
            : request.state === "ANSWERED_BY_KB"
              ? "Answered instantly"
              : request.state === "AWAITING_APPROVAL"
                ? "Needs approval"
                : request.audience_tier === "T4"
                  ? "With your CR"
                  : request.audience_tier === "T2"
                    ? "With the batch"
                    : "With targeted peers"}
        </Pill>
        <Copy small muted>
          {request.merged_count > 1
            ? `${request.merged_count} waiting`
            : request.priority}
        </Copy>
      </Row>
    </Card>
  );
}
export function Kpi({
  value,
  label,
}: {
  value: number | string;
  label: string;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        flex: 1,
        borderWidth: 1,
        borderColor: t.line,
        borderRadius: 14,
        padding: 12,
        alignItems: "center",
        minWidth: 80,
      }}
    >
      <Text style={{ fontFamily: fonts.number, fontSize: 25, color: t.ink }}>
        {value}
      </Text>
      <Copy small muted style={{ textAlign: "center", fontSize: 10 }}>
        {label}
      </Copy>
    </View>
  );
}
export const StatRow = Row;
export function BarRow({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  const t = useTheme();
  return (
    <View style={{ marginVertical: 7 }}>
      <Row style={{ justifyContent: "space-between" }}>
        <Copy small>{label}</Copy>
        <Copy small bold>
          {value}
        </Copy>
      </Row>
      <View
        style={{
          height: 7,
          backgroundColor: t.panel2,
          borderRadius: 5,
          marginTop: 6,
        }}
      >
        <View
          style={{
            height: 7,
            width: `${Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100))}%`,
            backgroundColor: t.flare,
            borderRadius: 5,
          }}
        />
      </View>
    </View>
  );
}
export const PresetRow = Segmented;
export function DwellRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <Field
      label={label}
      value={String(value)}
      keyboardType="numeric"
      onChangeText={(text) => onChange(Number(text) || 0)}
    />
  );
}
export function BottomSheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const t = useTheme();
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduce);
  }, []);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,.38)",
          justifyContent: "flex-end",
          alignItems: "center",
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close sheet"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <Animated.View
          entering={reduce ? undefined : SlideInDown.duration(220)}
          exiting={reduce ? undefined : SlideOutDown.duration(220)}
          style={{
            width: "100%",
            maxWidth: 480,
            maxHeight: "85%",
            backgroundColor: t.paper,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            padding: 20,
            paddingBottom: 36,
          }}
        >
          <Row style={{ justifyContent: "space-between" }}>
            <Heading>{title}</Heading>
            <LinkButton label="Close" onPress={onClose} />
          </Row>
          <ScrollView keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}
export function Fab({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Action
      label={label}
      onPress={onPress}
      style={{
        alignSelf: "flex-end",
        backgroundColor: t.flare,
        borderRadius: 999,
        paddingHorizontal: 20,
        paddingVertical: 12,
        marginVertical: 16,
        ...Platform.select({
          android: { elevation: 4 },
          default: {
            shadowColor: t.flare,
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.2,
            shadowRadius: 12,
          },
        }),
      }}
    >
      <Copy bold style={{ color: "#fff" }}>
        ＋ {label}
      </Copy>
    </Action>
  );
}
export function BackRow({ title }: { title: string }) {
  return (
    <Row>
      <LinkButton
        label="‹ Back"
        onPress={() =>
          router.canGoBack() ? router.back() : router.replace("/")
        }
      />
      <Copy bold>{title}</Copy>
    </Row>
  );
}
// Enum-ish API values rendered as prose. Tolerates a missing value because one absent field
// on one row used to throw during render and white-screen the whole tab.
export const label = (value?: string | null) =>
  (value ?? "").toLowerCase().replaceAll("_", " ");
export function useAction() {
  const [busy, setBusy] = useState(false);
  return {
    busy,
    run: async (action: () => Promise<unknown>, message?: string) => {
      if (busy) return;
      setBusy(true);
      try {
        await action();
        if (useSession.getState().user) await useSession.getState().refresh();
        if (message) useSession.getState().notify(message);
      } catch (e) {
        useSession.getState().fail(e);
      } finally {
        setBusy(false);
      }
    },
  };
}
