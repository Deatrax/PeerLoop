import React, { useEffect, useState } from "react";
import { Linking, View } from "react-native";
import { router, useLocalSearchParams, type Href } from "expo-router";
import {
  classify,
  effectiveDwell,
  terminalStates,
  type Category,
  type Classification,
  type CreateOutcome,
  type KnowledgeItem,
  type Notification,
  type Priority,
  type Request,
} from "@peerloop/core";
import {
  Action,
  AgentQuote,
  Banner,
  Card,
  Copy,
  DataList,
  EmptyState,
  Fab,
  Field,
  Heading,
  Kpi,
  LinkButton,
  ListRow,
  Loading,
  NoteText,
  Pill,
  PrimaryButton,
  QueueCard,
  Row,
  Screen,
  SearchField,
  SecondaryButton,
  Section,
  Segmented,
  SpaceChip,
  StatRow,
  Tag,
  Toggle,
  useAction,
  useResource,
  BottomSheet,
} from "../components";
import { HubSwitcherPill } from "../components/SpaceSwitcher";
import { getRepository } from "../lib/repo";
import { useActiveSpace, useSession } from "../store/session";
const categories: Category[] = [
  "MATERIAL",
  "INFORMATION",
  "ACADEMIC_HELP",
  "COORDINATION",
  "LOGISTICS_AUTHORITY",
  "CAMPUS_ISSUE",
];
export function Home() {
  const user = useSession((s) => s.user);
  const [segment, setSegment] = useState("Open"),
    [notifications, setNotifications] = useState(false);
  const { data, loading } = useResource(
    () =>
      getRepository().listRequests(segment === "Helping" ? "helping" : "mine"),
    [segment],
  );
  const notices = useResource(() =>
    getRepository().call<Notification[]>("GET", "/notifications"),
  );
  const { run } = useAction();
  const rows =
    data?.filter((r) =>
      segment === "Resolved"
        ? r.state === "RESOLVED" || !!r.resolved_at
        : (!terminalStates.includes(r.state) && !r.resolved_at) ||
          (r.state === "MERGED" && !r.resolved_at),
    ) ?? [];
  return (
    <Screen title="Home" scoped={false}>
      <Heading>Hello, {user?.name.split(" ")[0]}.</Heading>
      <Row style={{ justifyContent: "space-between" }}>
        <Copy muted>Your questions keep moving.</Copy>
        <LinkButton
          label={`Updates (${notices.data?.filter((n) => !n.read_at).length ?? 0})`}
          onPress={() => setNotifications(true)}
        />
      </Row>
      <View style={{ height: 18 }} />
      <Segmented
        values={["Open", "Resolved", "Helping"]}
        value={segment}
        onChange={setSegment}
      />
      {segment === "Helping" && (
        <NoteText>
          You were selected for these requests. A useful answer here can save
          the whole batch another notification.
        </NoteText>
      )}
      {loading && !data ? (
        <Loading />
      ) : rows.length ? (
        <DataList
          data={rows}
          keyFor={(r) => r.id}
          render={(r) => <QueueCard request={r} />}
        />
      ) : (
        <EmptyState
          title={
            segment === "Helping"
              ? "A quiet helping queue."
              : "Nothing buried here."
          }
          body={
            segment === "Resolved"
              ? "Your resolved requests from every hub will appear here."
              : "Requests you ask or can help with will stay here until they are resolved."
          }
          action="Ask something"
          onPress={() => router.push("/(student)/ask")}
        />
      )}
      <Fab
        label="Ask something"
        onPress={() => router.push("/(student)/ask")}
      />
      <BottomSheet
        visible={notifications}
        onClose={() => setNotifications(false)}
        title="Your updates"
      >
        {notices.data?.length ? (
          notices.data.map((n) => (
            <ListRow
              key={n.id}
              title={n.payload.text}
              subtitle={n.read_at ? "Read" : "New update"}
              onPress={() =>
                void run(async () => {
                  await getRepository().call(
                    "POST",
                    `/notifications/${n.id}/read`,
                  );
                  setNotifications(false);
                  if (n.payload.request_id)
                    router.push(`/request/${n.payload.request_id}` as Href);
                })
              }
            />
          ))
        ) : (
          <Copy muted>
            You’re all caught up. Replies and escalation updates appear here.
          </Copy>
        )}
      </BottomSheet>
    </Screen>
  );
}
export function Ask() {
  const space = useActiveSpace();
  const params = useLocalSearchParams<{ prefill?: string }>();
  const [text, setText] = useState(params.prefill ?? ""),
    [priority, setPriority] = useState<Priority>("P2"),
    [classification, setClassification] = useState<Classification | null>(null),
    [category, setCategory] = useState<Category | undefined>(),
    [outcome, setOutcome] = useState<CreateOutcome | null>(null);
  const { busy, run } = useAction();
  const requests = useResource(
    () => getRepository().listRequests("mine", space?.id),
    [space?.id],
  );
  const policy = useResource(
    () => (space ? getRepository().getPolicy(space.id, classification?.request_class ?? 'KNOWLEDGE') : Promise.resolve(null)),
    [space?.id, classification?.request_class],
  );
  useEffect(() => {
    const timer = setTimeout(() => {
      if (space && text.trim())
        void classify(text, {
          code: space.code,
          priority_requested: priority,
        }).then(setClassification);
      else setClassification(null);
    }, 400);
    return () => clearTimeout(timer);
  }, [text, priority, space?.id]);
  useEffect(() => {
    setOutcome(null);
  }, [space?.id]);
  const remaining = (p: Priority) =>
    (p === "P0" ? 1 : 3) -
    (requests.data?.filter(
      (r) =>
        r.priority === p &&
        Date.now() - Date.parse(r.created_at) < 7 * 86400000,
    ).length ?? 0);
  const send = () =>
    void run(async () => {
      if (space)
        setOutcome(
          await getRepository().createRequest({
            space_id: space.id,
            body_text: text,
            priority_requested: priority,
            category,
          }),
        );
    });
  return (
    <Screen title="New request" scoped={false}>
      <Heading>Ask once.</Heading>
      <Copy muted>
        We’ll check what your hub already knows, then find the people who can
        help.
      </Copy>
      <View style={{ height: 20 }} />
      <Field
        label="What do you need help with?"
        multiline
        value={text}
        onChangeText={setText}
        placeholder="Does anyone have the CSE 4790 Week 6 slides?"
      />
      <Row>
        <HubSwitcherPill />
        <Copy small>{space?.title}</Copy>
      </Row>
      <Copy small muted style={{ marginTop: 8 }}>
        Asking into this hub. Only its members and its knowledge are used.
      </Copy>
      {classification && (
        <>
          <Row style={{ marginVertical: 14 }}>
            <Action
              label="Correct category"
              onPress={() =>
                setCategory(
                  categories[
                    (categories.indexOf(category ?? classification.category) +
                      1) %
                      categories.length
                  ],
                )
              }
            >
              <Pill>
                {(category ?? classification.category)
                  .toLowerCase()
                  .replaceAll("_", " ")}{" "}
                · edit
              </Pill>
            </Action>
            <Tag>{space?.section}</Tag>
            {classification.tags.slice(0, 3).map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
          </Row>
          {classification.detected_space_hint && (
            <LinkButton
              label={`Looks like ${classification.detected_space_hint} — switch?`}
              onPress={() => {
                const found = useSession
                  .getState()
                  .spaces.find(
                    (s) => s.code === classification.detected_space_hint,
                  );
                if (found)
                  void run(() => useSession.getState().switchSpace(found.id));
              }}
            />
          )}
          {classification.contains_personal_info && (
            <Banner>
              This may contain personal details. Everyone in the hub can read
              the thread; its answer will need review before it is saved.
            </Banner>
          )}
        </>
      )}
      <Section title="How soon do you need it?" />
      <Row>
        {(["P3", "P2", "P1", "P0"] as Priority[]).map((p, i) => (
          <Action
            key={p}
            label={["Whenever", "Normal", "Today", "Blocking"][i]}
            disabled={(p === "P0" || p === "P1") && remaining(p) <= 0}
            onPress={() => setPriority(p)}
          >
            <Pill tone={priority === p ? "flare" : "quiet"}>
              {["Whenever", "Normal", "Today", "Blocking"][i]}
              {p === "P0" || p === "P1"
                ? ` · ${Math.max(0, remaining(p))} left`
                : ""}
            </Pill>
          </Action>
        ))}
      </Row>
      <NoteText>
        Standard pace:{" "}
        {policy.data
          ? effectiveDwell(
              policy.data.steps[0].dwell_minutes ?? 360,
              priority,
              policy.data.pace_override,
            ) / 60
          : 6}
        h with peers, then the full batch. Nothing reaches a teacher without
        human approval.
      </NoteText>
      <PrimaryButton
        label={busy ? "Checking what this hub knows…" : "Check for an answer"}
        disabled={busy || !text.trim() || !space}
        onPress={send}
      />
      {outcome && (
        <>
          <Section
            title={
              outcome.agent_outcome === "SERVE"
                ? "Found in this hub’s knowledge"
                : outcome.agent_outcome === "DUPLICATE_PROMPT"
                  ? "Someone already asked this"
                  : "We’ll keep it moving"
            }
          />
          {outcome.classification.priority_suggested !== priority && (
            <Banner>{outcome.classification.priority_reason}</Banner>
          )}
          {outcome.answer && (
            <AgentQuote
              body={outcome.answer.body_markdown}
              sources={outcome.answer.cited_item_ids}
              onSource={(id) => router.push(`/card/${id}` as Href)}
            />
          )}
          {outcome.agent_outcome === "SERVE" ? (
            <>
              <NoteText>
                Answered from what this hub already knows. Nobody was notified.
              </NoteText>
              <PrimaryButton
                label="That’s what I needed"
                onPress={() =>
                  void run(async () => {
                    await getRepository().acceptAnswer(
                      outcome.request.id,
                      outcome.answer!.id,
                    );
                    router.push(`/request/${outcome.request.id}` as Href);
                  }, "Resolved. Nobody was notified.")
                }
              />
              <SecondaryButton
                label="Still need help"
                onPress={() =>
                  void run(async () => {
                    await getRepository().call(
                      "POST",
                      `/requests/${outcome.request.id}/route`,
                    );
                    router.push(`/request/${outcome.request.id}` as Href);
                  })
                }
              />
            </>
          ) : outcome.agent_outcome === "DUPLICATE_PROMPT" ? (
            <>
              <Card>
                <Copy bold>{outcome.duplicates?.[0]?.request.body_text}</Copy>
                <Copy muted>
                  {outcome.duplicates?.[0]?.request.merged_count} people are
                  waiting. Follow the same thread and get its answer.
                </Copy>
              </Card>
              <PrimaryButton
                label="Follow that one"
                onPress={() =>
                  void run(async () => {
                    const parent = outcome.duplicates![0].request;
                    await getRepository().followRequest(
                      parent.id,
                      outcome.request.id,
                    );
                    router.push(`/request/${parent.id}` as Href);
                  })
                }
              />
              <SecondaryButton
                label="Ask separately"
                onPress={() =>
                  void run(async () => {
                    await getRepository().call(
                      "POST",
                      `/requests/${outcome.request.id}/route`,
                    );
                    router.push(`/request/${outcome.request.id}` as Href);
                  })
                }
              />
            </>
          ) : (
            <>
              <Card>
                <Copy bold>
                  Sent to {outcome.audience_preview.count} people in{" "}
                  {space?.code}.
                </Copy>
                <Copy muted>
                  {outcome.request.request_class === "AUTHORITY"
                    ? "This needs approval, not knowledge. It skipped the peer stages and went to your CR."
                    : `Selected for relevant answers, recent activity and a fair share of notifications.`}
                </Copy>
                <Copy small muted>
                  {outcome.audience_preview.next_escalation_at
                    ? `Next check: ${new Date(outcome.audience_preview.next_escalation_at).toLocaleString()}`
                    : "A human will decide the next step."}
                </Copy>
              </Card>
              <PrimaryButton
                label="Open your request"
                onPress={() =>
                  router.push(`/request/${outcome.request.id}` as Href)
                }
              />
            </>
          )}
        </>
      )}
    </Screen>
  );
}
export function KnowledgeRows({ items }: { items: KnowledgeItem[] }) {
  return (
    <>
      {items.map((k) => (
        <ListRow
          key={k.id}
          title={`${k.kind === "ANSWER_CARD" ? (k.status === "VERIFIED" ? "● " : "○ ") : ""}${k.title}`}
          subtitle={
            k.kind === "PINNED_REF"
              ? "Link only · added by your course team"
              : `${k.status.toLowerCase()} · ${k.origin === "AUTHORED" ? "written by your course team" : "from a resolved request"}`
          }
          onPress={() =>
            k.kind === "PINNED_REF" && k.url
              ? void Linking.openURL(k.url)
              : router.push(`/card/${k.id}` as Href)
          }
        />
      ))}
    </>
  );
}
export function Hub() {
  const space = useActiveSpace(),
    [query, setQuery] = useState("");
  const { data, loading } = useResource(
    () =>
      space
        ? getRepository().searchKnowledge(space.id, query)
        : Promise.resolve([]),
    [space?.id, query],
  );
  const pins = data?.filter((k) => k.kind === "PINNED_REF") ?? [],
    cards = data?.filter((k) => k.kind === "ANSWER_CARD") ?? [];
  return (
    <Screen title="Hub">
      <Heading>{space?.title ?? "Your course hub"}</Heading>
      <Copy small muted>
        {space?.section} · {space?.member_count ?? 0} members
      </Copy>
      <View style={{ height: 18 }} />
      <SearchField value={query} onChangeText={setQuery} />
      {loading && !data ? (
        <Loading />
      ) : !data?.length ? (
        <EmptyState
          title="A home for useful answers."
          body="Pinned course links and answers saved by this community will appear here."
          action="Ask something"
          onPress={() => router.push("/(student)/ask")}
        />
      ) : (
        <>
          <Section
            title="Pinned by your CR"
            action={`All ${pins.length} ›`}
            onPress={() => router.push("/(student)/pinned")}
          />
          <KnowledgeRows items={pins.slice(0, 4)} />
          <Section
            title="Already answered"
            action={`All ${cards.length} ›`}
            onPress={() => router.push("/(student)/answered")}
          />
          <KnowledgeRows items={cards.slice(0, 5)} />
          <NoteText>
            Each answer keeps its source. Verified answers have a filled dot;
            community answers are waiting for a check.
          </NoteText>
        </>
      )}
    </Screen>
  );
}
export function KnowledgeList({
  kind,
}: {
  kind: "PINNED_REF" | "ANSWER_CARD";
}) {
  const space = useActiveSpace(),
    [filter, setFilter] = useState("All"),
    [q, setQ] = useState("");
  const { data } = useResource(
    () =>
      space
        ? getRepository().searchKnowledge(space.id, q)
        : Promise.resolve([]),
    [space?.id, q],
  );
  const rows =
    data?.filter(
      (k) =>
        k.kind === kind &&
        (filter === "All" ||
          (filter === "Verified" && k.status === "VERIFIED") ||
          (filter === "This week" &&
            Date.now() - Date.parse(k.created_at) < 7 * 86400000)),
    ) ?? [];
  return (
    <Screen
      title={kind === "PINNED_REF" ? "Pinned references" : "Already answered"}
      back
    >
      <SearchField value={q} onChangeText={setQ} />
      {kind === "ANSWER_CARD" && (
        <Segmented
          values={["All", "Verified", "This week"]}
          value={filter}
          onChange={setFilter}
        />
      )}
      <KnowledgeRows items={rows} />
      {!rows.length && (
        <EmptyState
          title="Nothing here yet."
          body="Useful course links and saved answers will appear here as your hub grows."
          action="Ask something"
          onPress={() => router.push("/(student)/ask")}
        />
      )}
    </Screen>
  );
}
export function Search() {
  const [query, setQuery] = useState(""),
    spaces = useSession((s) => s.spaces);
  const { data } = useResource(
    async () =>
      query.trim()
        ? Promise.all(
            spaces.map(async (space) => ({
              space,
              items: await getRepository().searchKnowledge(space.id, query),
            })),
          )
        : [],
    [query, spaces.map((s) => s.id).join(",")],
  );
  return (
    <Screen title="Search your hubs" scoped={false} back>
      <SearchField
        placeholder="Search knowledge across your hubs"
        value={query}
        onChangeText={setQuery}
      />
      {data?.map(({ space, items }) =>
        items.length ? (
          <View key={space.id}>
            <Section title={space.code} />
            <KnowledgeRows items={items} />
          </View>
        ) : null,
      )}
      {!data?.some((g) => g.items.length) && (
        <NoteText>
          {query
            ? "No saved answer matches yet. Choose a hub and ask your question."
            : "Find a course link or an answer the community has already saved."}
        </NoteText>
      )}
    </Screen>
  );
}
export function Profile() {
  const user = useSession((s) => s.user),
    spaces = useSession((s) => s.spaces),
    space = useActiveSpace();
  const { run } = useAction();
  const requests = useResource(() => getRepository().listRequests());
  const [start, setStart] = useState(user?.preferences.quiet_start ?? "23:00"),
    [end, setEnd] = useState(user?.preferences.quiet_end ?? "07:00");
  return (
    <Screen title="Profile" scoped={false}>
      <Heading>{user?.name}</Heading>
      <Copy muted>{user?.student_id} · Your contribution stays private.</Copy>
      <StatRow style={{ marginVertical: 18 }}>
        <Kpi value={requests.data?.length ?? 0} label="Requests asked" />
        <Kpi
          value={
            requests.data?.filter(
              (r) => r.state === "RESOLVED" || r.resolved_at,
            ).length ?? 0
          }
          label="Resolved"
        />
      </StatRow>
      <Card>
        <Copy bold>Help that’s remembered.</Copy>
        <Copy muted>
          Five accepted answers earn a verified-helper badge in this hub. Your
          contribution is never a public competition.
        </Copy>
      </Card>
      <Section title="Appearance" />
      <Segmented
        values={["system", "light", "dark"]}
        value={user?.preferences.theme ?? "system"}
        onChange={(theme) =>
          void run(() =>
            getRepository().updatePreferences({
              theme: theme as "system" | "light" | "dark",
            }),
          )
        }
      />
      <Section title="Notifications" />
      <SecondaryButton label="Enable device notifications" onPress={()=>void run(async()=>{
        const {registerNotifications}=await import('../lib/notifications');
        useSession.getState().notify(await registerNotifications(true));
      })}/>
      <Toggle
        label="Notify me about my requests"
        value={user?.preferences.notifications ?? true}
        onChange={(notifications) =>
          void run(() => getRepository().updatePreferences({ notifications }))
        }
      />
      <Toggle
        label="Only notify me for my tags"
        value={user?.preferences.tags_only ?? false}
        onChange={(tags_only) =>
          void run(() => getRepository().updatePreferences({ tags_only }))
        }
      />
      <Field label="Quiet hours start" value={start} onChangeText={setStart} />
      <Field label="Quiet hours end" value={end} onChangeText={setEnd} />
      <SecondaryButton
        label="Save quiet hours"
        onPress={() =>
          void run(
            () =>
              getRepository().updatePreferences({
                quiet_start: start,
                quiet_end: end,
              }),
            "Quiet hours saved.",
          )
        }
      />
      <Row>
        {[1, 8, 24].map((hours) => (
          <LinkButton
            key={hours}
            label={`Mute ${hours}h`}
            onPress={() =>
              void run(
                () =>
                  getRepository().call("POST", `/spaces/${space?.id}/mute`, {
                    hours,
                  }),
                "Hub notifications muted.",
              )
            }
          />
        ))}
      </Row>
      <Toggle
        label="Opt in to contribution recognition"
        value={user?.preferences.leaderboard ?? false}
        onChange={(leaderboard) =>
          void run(() => getRepository().updatePreferences({ leaderboard }))
        }
      />
      <Section title="My spaces" />
      {spaces.map((s) => (
        <ListRow
          key={s.id}
          title={`${s.code} · ${s.title}`}
          subtitle={s.role.toLowerCase()}
          onPress={() =>
            void run(() => useSession.getState().switchSpace(s.id))
          }
        />
      ))}
      <SecondaryButton
        label="Demo controls"
        onPress={() => router.push("/(dev)/console")}
      />
      <SecondaryButton
        label="Sign out"
        onPress={() =>
          void run(async () => {
            await useSession.getState().logout();
            router.replace("/(auth)/sign-in");
          })
        }
      />
    </Screen>
  );
}
