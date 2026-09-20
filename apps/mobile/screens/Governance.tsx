import React, { useEffect, useState } from "react";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { View, Share } from "react-native";
import {
  terminalStates,
  type Analytics,
  type ApprovalTask,
  type Category,
  type EscalationPolicy,
  type KnowledgeItem,
  type Request,
  type SearchHit,
  type Space,
} from "@peerloop/core";
import {
  Banner,
  BarRow,
  Card,
  Copy,
  DataList,
  DwellRow,
  EmptyState,
  Fab,
  Field,
  Heading,
  Kpi,
  LinkButton,
  ListRow,
  Loading,
  NoteText,
  PresetRow,
  PrimaryButton,
  QueueCard,
  Row,
  Screen,
  SecondaryButton,
  Section,
  Segmented,
  SpaceChip,
  Toggle,
  useAction,
  useResource,
} from "../components";
import { getRepository } from "../lib/repo";
import { useActiveSpace, useRole, useSession } from "../store/session";
const categories: Category[] = [
  "MATERIAL",
  "INFORMATION",
  "ACADEMIC_HELP",
  "COORDINATION",
  "LOGISTICS_AUTHORITY",
  "CAMPUS_ISSUE",
];
function ReviewCard({ card }: { card: KnowledgeItem }) {
  const { run } = useAction();
  return (
    <Card>
      <Copy bold>{card.title}</Copy>
      <Copy small muted>
        {card.body_markdown}
      </Copy>
      <Row>
        <LinkButton
          label="Verify"
          onPress={() =>
            void run(
              () => getRepository().verifyCard(card.id),
              "Answer verified.",
            )
          }
        />
        <LinkButton
          label="Edit"
          onPress={() =>
            router.push({
              pathname: "/(cr)/knowledge/new",
              params: { edit: card.id },
            })
          }
        />
        <LinkButton
          label="Discard"
          onPress={() =>
            void run(
              () =>
                getRepository().call("POST", `/knowledge/${card.id}/retire`),
              "Card retired.",
            )
          }
        />
      </Row>
    </Card>
  );
}
function ApprovalCard({ task }: { task: ApprovalTask }) {
  const { run, busy } = useAction(),
    [note, setNote] = useState("");
  return (
    <Card>
      <Copy bold>
        {task.kind === "ESCALATE_TIER"
          ? "Send this to the instructor?"
          : "An action needs your approval"}
      </Copy>
      <Copy>{task.payload.rationale}</Copy>
      {task.request_id && (
        <LinkButton
          label="Read the request"
          onPress={() => router.push(`/request/${task.request_id}` as Href)}
        />
      )}
      <Field
        label="Edit the approval note"
        value={note}
        onChangeText={setNote}
      />
      <Row>
        <PrimaryButton
          label="Approve"
          disabled={busy}
          onPress={() =>
            void run(
              () => getRepository().decideApproval(task.id, "approve", note),
              "Approval recorded.",
            )
          }
        />
        <SecondaryButton
          label="Decline"
          disabled={busy}
          onPress={() =>
            void run(
              () => getRepository().decideApproval(task.id, "decline", note),
              "Decline recorded.",
            )
          }
        />
      </Row>
    </Card>
  );
}
export function Queue() {
  const space = useActiveSpace();
  const { data } = useResource(async () => {
    if (!space) return null;
    const repo = getRepository();
    const [approvals, requests, cards, analytics] = await Promise.all([
      repo.listApprovals(),
      repo.listRequests("space", space.id),
      repo.call<KnowledgeItem[]>("GET", `/spaces/${space.id}/knowledge/review`),
      repo.getSpaceAnalytics(space.id),
    ]);
    return {
      approvals: approvals.filter((a) => a.space_id === space.id),
      requests: requests.filter((r) => !terminalStates.includes(r.state)),
      cards,
      analytics,
    };
  }, [space?.id]);
  return (
    <Screen title="Queue">
      <Heading>A little attention. A lot less noise.</Heading>
      {!data ? (
        <Loading />
      ) : (
        <>
          <NoteText>
            {data.analytics.open} open ·{" "}
            {Math.round(data.analytics.median_first_response_minutes)} min
            median first response · {data.analytics.unresolved} unresolved
          </NoteText>
          <Section title="Needs your approval" />
          {data.approvals.length ? (
            data.approvals.map((a) => <ApprovalCard key={a.id} task={a} />)
          ) : (
            <Copy muted small>
              No approvals waiting. Nothing goes above you without a decision.
            </Copy>
          )}
          <Section title="Escalated to you" />
          {data.requests
            .filter((r) => r.audience_tier === "T4")
            .map((r) => (
              <QueueCard key={r.id} request={r} />
            ))}
          <Section title="Answers to review" />
          {data.cards.map((k) => (
            <ReviewCard key={k.id} card={k} />
          ))}
          <Section title="Stalling · a chance to step in" />
          {data.requests
            .filter(
              (r) =>
                ["T1", "T2"].includes(r.audience_tier) &&
                r.next_escalation_at &&
                Date.parse(r.next_escalation_at) - Date.now() < 3600000,
            )
            .map((r) => (
              <QueueCard key={r.id} request={r} />
            ))}
          {!data.requests.length &&
            !data.cards.length &&
            !data.approvals.length && (
              <EmptyState
                title="A quiet queue."
                body="Approvals, requests with your CR and answers to review will appear here."
                action="Add knowledge"
                onPress={() => router.push("/(cr)/knowledge/new")}
              />
            )}
        </>
      )}
    </Screen>
  );
}

export function Requests() {
  const space = useActiveSpace(),
    [filter, setFilter] = useState("Open"),
    [parent, setParent] = useState(""),
    [selected, setSelected] = useState<string[]>([]);
  const { run } = useAction();
  const { data } = useResource(
    () => getRepository().listRequests("space", space?.id),
    [space?.id],
  );
  const rows =
    data?.filter(
      (r) =>
        filter === "All" ||
        (filter === "Open" && !terminalStates.includes(r.state)) ||
        (filter === "Resolved" && r.state === "RESOLVED") ||
        (filter === "Urgent" && ["P0", "P1"].includes(r.priority)),
    ) ?? [];
  return (
    <Screen title="Requests">
      <Heading>Every ask, accounted for.</Heading>
      <Segmented
        values={["Open", "All", "Resolved", "Urgent"]}
        value={filter}
        onChange={setFilter}
      />
      {rows.length ? (
        <DataList
          data={rows}
          keyFor={(r) => r.id}
          render={(r) => (
            <View>
              <QueueCard request={r} />
              <Toggle
                label="Select for merge"
                value={selected.includes(r.id)}
                onChange={(yes) =>
                  setSelected(
                    yes
                      ? [...selected, r.id]
                      : selected.filter((id) => id !== r.id),
                  )
                }
              />
            </View>
          )}
        />
      ) : (
        <EmptyState
          title="No requests here."
          body="Requests in this hub will appear here with their current audience and state."
          action="Add an answer instead"
          onPress={() => router.push("/(cr)/knowledge/new")}
        />
      )}
      {selected.length > 1 && (
        <Card>
          <Copy bold>Merge selected requests</Copy>
          <Copy small muted>
            Choose the parent. Its escalation clock will stay unchanged.
          </Copy>
          <Segmented
            values={selected}
            value={parent || selected[0]}
            onChange={setParent}
          />
          <PrimaryButton
            label="Merge into one thread"
            onPress={() =>
              void run(async () => {
                const target = parent || selected[0];
                for (const id of selected.filter((id) => id !== target))
                  await getRepository().call("POST", `/requests/${id}/merge`, {
                    parent_request_id: target,
                  });
                setSelected([]);
                setParent("");
              }, "Requests merged.")
            }
          />
        </Card>
      )}
    </Screen>
  );
}
export function Knowledge() {
  const space = useActiveSpace();
  const { run } = useAction();
  const { data } = useResource(
    () =>
      space ? getRepository().searchKnowledge(space.id) : Promise.resolve([]),
    [space?.id],
  );
  const pins = data?.filter((k) => k.kind === "PINNED_REF") ?? [];
  return (
    <Screen title="Knowledge">
      <Heading>Write it down once.</Heading>
      <Copy muted>Make the next question an instant answer.</Copy>
      <Section title="Answers to review" />
      {data
        ?.filter((k) => k.status === "UNVERIFIED")
        .map((k) => (
          <ReviewCard key={k.id} card={k} />
        ))}
      <Section title="Pinned references" />
      {pins.map((k, i) => (
        <React.Fragment key={k.id}>
          <Card>
            <Copy bold>
              {i + 1}. {k.title}
            </Copy>
            <Row>
              <LinkButton
                label="Move up"
                onPress={() =>
                  void run(() =>
                    getRepository().reorderPins(k.id, Math.max(0, i - 1)),
                  )
                }
              />
              <LinkButton
                label="Move down"
                onPress={() =>
                  void run(() =>
                    getRepository().reorderPins(
                      k.id,
                      Math.min(pins.length - 1, i + 1),
                    ),
                  )
                }
              />
              <LinkButton
                label="Retire"
                onPress={() =>
                  void run(() =>
                    getRepository().call("POST", `/knowledge/${k.id}/retire`),
                  )
                }
              />
            </Row>
          </Card>
          {i === 3 && <Banner>Students see up to here · the top 4</Banner>}
        </React.Fragment>
      ))}
      <Section title="Saved answers" />
      {data
        ?.filter((k) => k.kind === "ANSWER_CARD" && k.status === "VERIFIED")
        .map((k) => (
          <ListRow
            key={k.id}
            title={k.title}
            subtitle="Verified · edit answer"
            onPress={() =>
              router.push({
                pathname: "/(cr)/knowledge/new",
                params: { edit: k.id },
              })
            }
          />
        ))}
      <Section title="Time for a refresh" />
      {data
        ?.filter((k) => k.status === "STALE")
        .map((k) => (
          <Card key={k.id}>
            <Copy bold>{k.title}</Copy>
            <SecondaryButton
              label="Still current · refresh"
              onPress={() =>
                void run(
                  () =>
                    getRepository().call("POST", `/knowledge/${k.id}/refresh`),
                  "Answer refreshed for 21 days.",
                )
              }
            />
          </Card>
        ))}
      {!data?.length && (
        <EmptyState
          title="Start with what you know."
          body="Write a useful answer before anyone asks. Your first cards make fetch-first useful from day one."
          action="Write an answer"
          onPress={() => router.push("/(cr)/knowledge/new")}
        />
      )}
      <Fab
        label="Add knowledge"
        onPress={() => router.push("/(cr)/knowledge/new")}
      />
    </Screen>
  );
}
export function KnowledgeComposer() {
  const space = useActiveSpace(),
    { edit, question: initialQuestion } = useLocalSearchParams<{
      edit?: string;
      question?: string;
    }>();
  const [mode, setMode] = useState("Write an answer"),
    [question, setQuestion] = useState(initialQuestion ?? ""),
    [body, setBody] = useState(""),
    [url, setUrl] = useState(""),
    [days, setDays] = useState("21"),
    [category, setCategory] = useState<Category>("INFORMATION"),
    [notify, setNotify] = useState(false),
    [top, setTop] = useState(false),
    [duplicates, setDuplicates] = useState<SearchHit[]>([]),
    [checked, setChecked] = useState(false);
  const { run, busy } = useAction();
  useEffect(() => {
    if (edit)
      void getRepository()
        .call<KnowledgeItem>("GET", `/knowledge/${edit}`)
        .then((k) => {
          setQuestion(k.title);
          setBody(k.body_markdown);
          setCategory(k.category);
        })
        .catch(useSession.getState().fail);
  }, [edit]);
  const check = () =>
    void run(async () => {
      if (!space) return;
      setDuplicates(await getRepository().checkCard(space.id, question));
      setChecked(true);
    });
  const publish = () =>
    void run(
      async () => {
        if (!space) return;
        if (edit)
          await getRepository().call("PATCH", `/knowledge/${edit}`, {
            question,
            body,
            category,
          });
        else if (mode === "Pin a link")
          await getRepository().pinReference(space.id, {
            title: question,
            url,
            note: body,
            category,
            top_four: top,
          });
        else
          await getRepository().authorCard(space.id, {
            question,
            body,
            category,
            expires_in_days: Number(days),
            notify_space: notify,
          });
        router.back();
      },
      edit ? "Answer updated." : "Knowledge published and attributed to you.",
    );
  return (
    <Screen title={edit ? "Edit answer" : "Add knowledge"} back>
      <Heading>A useful answer lasts.</Heading>
      {!edit && (
        <Segmented
          values={["Write an answer", "Pin a link"]}
          value={mode}
          onChange={(v) => {
            setMode(v);
            setChecked(false);
          }}
        />
      )}
      <Field
        label={mode === "Pin a link" ? "Link title" : "Question it answers"}
        value={question}
        onChangeText={(v) => {
          setQuestion(v);
          setChecked(false);
        }}
      />
      {mode === "Pin a link" && (
        <>
          <Field
            label="URL"
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            keyboardType="url"
          />
          <NoteText>
            Links only. PeerLoop never stores, uploads or hosts course files.
          </NoteText>
        </>
      )}
      <Field
        label={mode === "Pin a link" ? "A short note" : "The answer"}
        multiline
        value={body}
        onChangeText={setBody}
      />
      <Section title="Category" />
      <Segmented
        values={categories}
        value={category}
        onChange={(v) => setCategory(v as Category)}
      />
      {mode === "Write an answer" ? (
        <>
          <Field
            label="Expires in days"
            value={days}
            onChangeText={setDays}
            keyboardType="numeric"
          />
          <Toggle label="Notify the hub" value={notify} onChange={setNotify} />
          <NoteText>
            Published verified, with your name on it. No request needs to exist
            first.
          </NoteText>
        </>
      ) : (
        <Toggle label="Show in the top 4" value={top} onChange={setTop} />
      )}
      {duplicates.length > 0 && (
        <Banner>
          A similar answer already exists. Edit it to keep the hub tidy.
        </Banner>
      )}
      {duplicates.map((hit) => (
        <ListRow
          key={hit.item.id}
          title={hit.item.title}
          subtitle="Edit this answer instead"
          onPress={() =>
            router.replace({
              pathname: "/(cr)/knowledge/new",
              params: { edit: hit.item.id },
            })
          }
        />
      ))}
      <PrimaryButton
        label={
          edit
            ? "Save changes"
            : mode === "Pin a link"
              ? "Pin this reference"
              : checked
                ? "Publish verified answer"
                : "Check for existing answers"
        }
        disabled={
          busy ||
          !question.trim() ||
          (mode === "Write an answer" && !body.trim())
        }
        onPress={edit || mode === "Pin a link" || checked ? publish : check}
      />
    </Screen>
  );
}
export function PolicyEditor() {
  const space = useActiveSpace(),
    role = useRole(),
    [cls, setCls] = useState("KNOWLEDGE"),
    [advanced, setAdvanced] = useState(false),
    [policy, setPolicy] = useState<EscalationPolicy | null>(null);
  const { run } = useAction();
  const resource = useResource(
    () =>
      space ? getRepository().getPolicy(space.id, cls) : Promise.resolve(null),
    [space?.id, cls],
  );
  useEffect(() => {
    setPolicy(resource.data);
  }, [resource.data]);
  const locked = space?.policy_locked && role === "CR";
  return (
    <>
      <Section title="Response pace" />
      {locked && (
        <Banner>
          Set by your course instructor. This policy is read-only.
        </Banner>
      )}
      <NoteText>
        Changes apply to new requests. In-flight requests keep their original
        policy.
      </NoteText>
      <PresetRow
        values={["Relaxed", "Standard", "Fast"]}
        value={
          (space?.pace_override ?? 1) > 1
            ? "Relaxed"
            : (space?.pace_override ?? 1) < 1
              ? "Fast"
              : "Standard"
        }
        onChange={(preset) => {
          if (!locked)
            void run(
              () =>
                getRepository().call("PUT", `/spaces/${space?.id}/pace`, {
                  preset,
                }),
              "Pace saved for new requests.",
            );
        }}
      />
      <LinkButton
        label={advanced ? "Hide advanced timing" : "Advanced timing ›"}
        onPress={() => setAdvanced(!advanced)}
      />
      {advanced && policy && (
        <>
          <Segmented
            values={["KNOWLEDGE", "AUTHORITY", "HYBRID"]}
            value={cls}
            onChange={setCls}
          />
          {policy.steps.map((step, i) =>
            step.dwell_minutes !== null ? (
              <DwellRow
                key={step.tier}
                label={`${step.tier} · hours`}
                value={step.dwell_minutes / 60}
                onChange={(n) =>
                  setPolicy({
                    ...policy,
                    steps: policy.steps.map((s, j) =>
                      i === j ? { ...s, dwell_minutes: n * 60 } : s,
                    ),
                  })
                }
              />
            ) : (
              <NoteText key={step.tier}>
                {step.tier} · human approval, no automatic timer
              </NoteText>
            ),
          )}
          <Field
            label="Quiet hours start"
            value={policy.quiet_hours.start}
            onChangeText={(start) =>
              setPolicy({
                ...policy,
                quiet_hours: { ...policy.quiet_hours, start },
              })
            }
          />
          <Field
            label="Quiet hours end"
            value={policy.quiet_hours.end}
            onChangeText={(end) =>
              setPolicy({
                ...policy,
                quiet_hours: { ...policy.quiet_hours, end },
              })
            }
          />
          <Toggle
            label="45-minute grace after a reply or claim"
            value={policy.grace_period_minutes > 0}
            onChange={(on) =>
              setPolicy({ ...policy, grace_period_minutes: on ? 45 : 0 })
            }
          />
          <PrimaryButton
            label="Save policy for new requests"
            disabled={locked}
            onPress={() =>
              void run(
                () => getRepository().updatePolicy(space!.id, policy),
                "Policy saved. Existing clocks are unchanged.",
              )
            }
          />
        </>
      )}
      {role === "INSTRUCTOR" && (
        <Toggle
          label="Lock this policy for class representatives"
          value={space?.policy_locked ?? false}
          onChange={(policy_locked) =>
            void run(() =>
              getRepository().call("PATCH", `/spaces/${space?.id}`, {
                policy_locked,
              }),
            )
          }
        />
      )}
    </>
  );
}
type Member = { user_id: string; name: string; role: string; status: string };
export function Settings({ instructor = false }: { instructor?: boolean }) {
  const space = useActiveSpace();
  const { run } = useAction();
  const [csv, setCsv] = useState(""),
    [title, setTitle] = useState(""),
    [body, setBody] = useState(""),
    [url, setUrl] = useState("");
  const members = useResource(
    () =>
      space
        ? getRepository().call<Member[]>("GET", `/spaces/${space.id}/members`)
        : Promise.resolve([]),
    [space?.id],
  );
  return (
    <Screen title={instructor ? "Course" : "Hub settings"}>
      <Heading>{space?.title}</Heading>
      <PolicyEditor />
      {instructor && (
        <>
          <Section title="Course announcement" />
          <Field
            label="Announcement title"
            value={title}
            onChangeText={setTitle}
          />
          <Field
            label="Announcement"
            multiline
            value={body}
            onChangeText={setBody}
          />
          <Field
            label="Official source URL"
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
          />
          <PrimaryButton
            label="Pin & notify the hub"
            disabled={!title || !body || !url}
            onPress={() =>
              void run(async () => {
                await getRepository().call(
                  "POST",
                  `/spaces/${space?.id}/announcements`,
                  { title, body, url },
                );
                setTitle("");
                setBody("");
                setUrl("");
              }, "Announcement pinned and added to the digest.")
            }
          />
          <Toggle
            label="Enable automatic agent routing"
            value={space?.agent_enabled ?? true}
            onChange={(agent_enabled) =>
              void run(() =>
                getRepository().call("PATCH", `/spaces/${space?.id}`, {
                  agent_enabled,
                }),
              )
            }
          />
          <NoteText>
            When disabled, new requests go to the CR for manual handling.
            Existing data is preserved.
          </NoteText>
        </>
      )}
      <Section title="Invite your batch" />
      <Card>
        <Copy bold>{space?.join_code}</Copy>
        <Copy small muted>
          Anyone joining can read this hub’s requests.
        </Copy>
        <SecondaryButton
          label="Rotate join code"
          onPress={() =>
            void run(
              () =>
                getRepository().call(
                  "POST",
                  `/spaces/${space?.id}/join-code/rotate`,
                ),
              "The old join code no longer works.",
            )
          }
        />
      </Card>
      <Section title="Import roster" />
      <Field
        multiline
        label="CSV: student_id,name,email,section"
        value={csv}
        onChangeText={setCsv}
        placeholder={
          "student_id,name,email,section\n220041001,Arisha,arisha@iut-dhaka.edu,Sec A"
        }
      />
      <PrimaryButton
        label="Import members"
        disabled={!csv.trim()}
        onPress={() =>
          void run(async () => {
            await getRepository().call(
              "POST",
              `/spaces/${space?.id}/members/import`,
              { csv },
            );
            setCsv("");
          }, "Roster imported. Invitations activate at first sign-in.")
        }
      />
      <Section title={`Members · ${members.data?.length ?? 0}`} />
      <DataList
        data={members.data ?? []}
        keyFor={(m) => m.user_id}
        render={(m) => (
          <ListRow
            title={m.name}
            subtitle={`${m.role.toLowerCase()} · ${m.status.toLowerCase()}`}
            right={
              instructor && m.role === "STUDENT" ? (
                <LinkButton
                  label="Assign CR"
                  onPress={() =>
                    void run(
                      () =>
                        getRepository().call(
                          "PATCH",
                          `/spaces/${space?.id}/members/${m.user_id}`,
                          { role: "CR" },
                        ),
                      "Class representative assigned.",
                    )
                  }
                />
              ) : undefined
            }
          />
        )}
      />
      <SecondaryButton
        label="Profile & appearance"
        onPress={() => router.push("/(student)/profile")}
      />
    </Screen>
  );
}
export function Overview() {
  const spaces = useSession((s) => s.spaces);
  const { data } = useResource(
    () =>
      Promise.all(
        spaces.map(async (space) => ({
          space,
          analytics: await getRepository().getSpaceAnalytics(space.id),
        })),
      ),
    [spaces.map((s) => s.id).join(",")],
  );
  return (
    <Screen title="Overview" scoped={false}>
      <Heading>Your courses, at a glance.</Heading>
      <Copy muted>A weekly view of where the community needs you.</Copy>
      <View style={{ height: 18 }} />
      {data?.map(({ space, analytics: a }) => (
        <Card
          key={space.id}
          onPress={() => {
            void useSession
              .getState()
              .switchSpace(space.id)
              .then(() => router.push("/(instructor)/insights"));
          }}
        >
          <Row>
            <SpaceChip space={space} />
            <Copy small>
              {a.unresolved ? "● Needs attention" : "● Moving well"}
            </Copy>
          </Row>
          <Copy bold>{space.title}</Copy>
          <Row>
            <Kpi value={a.open} label="Open" />
            <Kpi value={a.unresolved} label="Unresolved" />
            <Kpi
              value={`${Math.round(a.median_first_response_minutes)}m`}
              label="First response"
            />
          </Row>
          <Copy small muted>
            {a.topics
              .slice(0, 3)
              .map((t) => t.tag)
              .join(" · ")}
          </Copy>
        </Card>
      ))}
    </Screen>
  );
}
export function NeedsYou() {
  const spaces = useSession((s) => s.spaces);
  const approvals=useResource(()=>getRepository().listApprovals());
  const { data } = useResource(async () => {
    const all = await Promise.all(
      spaces.map((s) => getRepository().listRequests("space", s.id)),
    );
    return all
      .flat()
      .filter(
        (r) => r.audience_tier === "T5" && !terminalStates.includes(r.state),
      );
  }, [spaces.map((s) => s.id).join(",")]);
  return (
    <Screen title="Needs you" scoped={false}>
      <Heading>Only what needs your call.</Heading>
      {approvals.data?.map(task=><ApprovalCard key={task.id} task={task}/>)}
      <NoteText>
        Every request here was approved by its class representative first. Open
        a thread to answer and publish an official card in one step.
      </NoteText>
      {data?.length ? (
        data.map((r) => <QueueCard key={r.id} request={r} />)
      ) : (
        <EmptyState
          title="Nothing needs you yet."
          body="Requests approved for instructor attention will appear here."
          action="View course insights"
          onPress={() => router.push("/(instructor)/insights")}
        />
      )}
    </Screen>
  );
}
export function AnalyticsPanel({ analytics: a }: { analytics: Analytics }) {
  return (
    <>
      <Row style={{ marginVertical: 14 }}>
        <Kpi value={a.total} label="Requests" />
        <Kpi value={a.open} label="Open" />
        <Kpi value={a.unresolved} label="Unresolved" />
      </Row>
      <Section title="Where answers happened" />
      {a.resolution.map((x) => (
        <BarRow
          key={x.tier}
          label={
            {
              T0: "Knowledge base",
              T1: "Targeted peers",
              T2: "The batch",
              T3: "Sibling",
              T4: "Class representative",
              T5: "Instructor",
              T6: "Department",
            }[x.tier]
          }
          value={x.count}
          max={a.total}
        />
      ))}
      <Section title="Knowledge that closed the loop" />
      {a.origins.map((o) => (
        <BarRow
          key={o.origin}
          label={o.origin.toLowerCase()}
          value={o.count}
          max={a.total}
        />
      ))}
      <Section title="Topics by week" />
      {a.topics.slice(0, 12).map((t) => (
        <BarRow
          key={`${t.tag}-${t.week}`}
          label={`${t.tag} · week of ${t.week}`}
          value={t.count}
          max={a.total}
        />
      ))}
    </>
  );
}
export function Insights() {
  const space = useActiveSpace();
  const { data } = useResource(
    () =>
      space
        ? getRepository().getSpaceAnalytics(space.id)
        : Promise.resolve(null),
    [space?.id],
  );
  return (
    <Screen title="Insights">
      <Heading>What keeps coming up?</Heading>
      {data ? (
        <>
          <Section title="Recurring questions" />
          {data.recurring.length ? (
            data.recurring.map((g) => (
              <Card key={g.question}>
                <Copy bold>{g.question}</Copy>
                <Copy muted>
                  Asked {g.count} times · no verified answer yet
                </Copy>
                <PrimaryButton
                  label="Publish an official answer"
                  onPress={() =>
                    router.push({
                      pathname: "/(cr)/knowledge/new",
                      params: { question: g.question },
                    })
                  }
                />
              </Card>
            ))
          ) : (
            <NoteText>
              No unanswered clusters yet. Similar questions asked three or more
              times will appear here.
            </NoteText>
          )}
          <AnalyticsPanel analytics={data} />
        </>
      ) : (
        <Loading />
      )}
    </Screen>
  );
}
type OrgSpace = Space & { health: Analytics; member_count: number };
export function DepartmentHubs() {
  const org=useSession(s=>s.user?.org_roles?.[0]?.org_id ?? '');
  const { data } = useResource(() =>
    getRepository().call<OrgSpace[]>("GET", `/orgs/${org}/spaces`),
  );
  return (
    <Screen title="Hubs" scoped={false}>
      <Heading>A department that responds.</Heading>
      {data?.map((s) => (
        <Card key={s.id}>
          <Row>
            <SpaceChip space={s} />
            <Copy small>
              {s.health.unresolved ? "● Needs attention" : "● Healthy"}
            </Copy>
          </Row>
          <Copy bold>{s.title}</Copy>
          <Copy small muted>
            {s.section} · {s.member_count} members · {s.term}
          </Copy>
          <Row>
            <Kpi value={s.health.open} label="Open" />
            <Kpi value={s.health.cr_workload} label="With CR" />
          </Row>
        </Card>
      ))}
      {!data?.length && (
        <EmptyState
          title="Give a course its own hub."
          body="Create the first course and assign its instructor to begin."
          action="Create course"
          onPress={() => router.push("/(dept)/new-hub")}
        />
      )}
      <Fab
        label="Create course"
        onPress={() => router.push("/(dept)/new-hub")}
      />
    </Screen>
  );
}
export function NewHub() {
  const org=useSession(s=>s.user?.org_roles?.[0]?.org_id ?? '');
  const [code, setCode] = useState(""),
    [title, setTitle] = useState(""),
    [term, setTerm] = useState("2026-Fall"),
    [section, setSection] = useState(""),
    [teacher, setTeacher] = useState(""),
    [template, setTemplate] = useState("Standard");
  const people = useResource(() =>
    getRepository().call<{ id: string; name: string; student_id: string }[]>(
      "GET",
      `/orgs/${org}/people`,
    ),
  );
  const { run, busy } = useAction();
  return (
    <Screen title="Create course" scoped={false} back>
      <Heading>A quieter place to ask.</Heading>
      <Field label="Course code" value={code} onChangeText={setCode} />
      <Field label="Course title" value={title} onChangeText={setTitle} />
      <Field label="Term" value={term} onChangeText={setTerm} />
      <Field
        label="Batch & section"
        value={section}
        onChangeText={setSection}
      />
      <Section title="Assign instructor" />
      {people.data
        ?.map((p) => (
          <ListRow
            key={p.id}
            title={p.name}
            subtitle={
              teacher === p.id ? "Selected instructor" : "Tap to assign"
            }
            onPress={() => setTeacher(p.id)}
          />
        ))}
      <Section title="Escalation template" />
      <PresetRow
        values={["Relaxed", "Standard", "Fast"]}
        value={template}
        onChange={setTemplate}
      />
      <NoteText>
        Sibling relay stays off until both hubs have explicitly agreed to link
        their audiences.
      </NoteText>
      <PrimaryButton
        label="Create course & join code"
        disabled={busy || !code || !title || !section}
        onPress={() =>
          void run(async () => {
            await getRepository().call("POST", "/spaces", {
              code,
              title,
              term,
              section,
              instructor_id: teacher,
              template,
              color_token: "flare",
              allow_sibling_relay: false,
            });
            router.back();
          }, "Course created.")
        }
      />
    </Screen>
  );
}
export function DepartmentAnalytics() {
  const org=useSession(s=>s.user?.org_roles?.[0]?.org_id ?? '');
  const { data } = useResource(() =>
    getRepository().getOrgAnalytics(org),
  );
  const tags = new Map<string, Set<string>>();
  data?.forEach((d) =>
    d.analytics.topics.forEach((t) =>
      tags.set(t.tag, new Set([...(tags.get(t.tag) ?? []), d.space.code])),
    ),
  );
  return (
    <Screen title="Analytics" scoped={false}>
      <Heading>The wider picture.</Heading>
      <Section title="Issues spanning courses" />
      {[...tags]
        .filter(([, courses]) => courses.size >= 2)
        .slice(0, 8)
        .map(([tag, courses]) => (
          <ListRow key={tag} title={tag} subtitle={[...courses].join(" · ")} />
        ))}
      <Section title="Class representative workload" />
      {data?.map((d) => (
        <BarRow
          key={d.space.id}
          label={d.space.code}
          value={d.analytics.cr_workload}
          max={Math.max(...data.map((x) => x.analytics.cr_workload), 1)}
        />
      ))}
      {data?.map((d) => (
        <View key={d.space.id}>
          <Section title={d.space.code} />
          <AnalyticsPanel analytics={d.analytics} />
        </View>
      ))}
    </Screen>
  );
}
export function Admin() {
  const org=useSession(s=>s.user?.org_roles?.[0]?.org_id ?? '');
  const [term, setTerm] = useState("2027-Spring"),
    [confirm, setConfirm] = useState(false);
  const people = useResource(() =>
    getRepository().call<{ id: string; name: string; student_id: string }[]>(
      "GET",
      `/orgs/${org}/people`,
    ),
  );
  const { run } = useAction();
  return (
    <Screen title="Admin" scoped={false}>
      <Heading>Keep the pilot in good shape.</Heading>
      <Section title="Term rollover" />
      <NoteText>
        Archive the current hubs and open the next term. Verified knowledge is
        copied as unverified so changed deadlines are checked again.
      </NoteText>
      <Field label="Next term" value={term} onChangeText={setTerm} />
      <Toggle
        label="I have checked that this term is complete"
        value={confirm}
        onChange={setConfirm}
      />
      <PrimaryButton
        label="Archive term & create next hubs"
        disabled={!confirm}
        onPress={() =>
          void run(async () => {
            await getRepository().call("POST", `/orgs/${org}/rollover`, {
              term,
            });
            setConfirm(false);
          }, "Next term created. Knowledge needs re-verification.")
        }
      />
      <Section title="Audit trail" />
      <SecondaryButton
        label="Export request events & agent runs"
        onPress={() =>
          void run(async () => {
            const audit = await getRepository().call(
              "GET",
              `/orgs/${org}/audit`,
            );
            await Share.share({
              message: JSON.stringify(audit, null, 2),
              title: "PeerLoop audit export",
            });
          })
        }
      />
      <Section title="People" />
      <DataList
        data={people.data ?? []}
        keyFor={(p) => p.id}
        render={(p) => <ListRow title={p.name} subtitle={p.student_id} />}
      />
      <SecondaryButton
        label="Demo controls"
        onPress={() => router.push("/(dev)/console")}
      />
    </Screen>
  );
}
