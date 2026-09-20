import React, { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { demoAccounts, type User } from "@peerloop/core";
import {
  Banner,
  Copy,
  Field,
  Heading,
  PrimaryButton,
  Screen,
  SecondaryButton,
  Section,
  Segmented,
} from "../../components";
import { configureRepository, getRepository, saveToken } from "../../lib/repo";
import { useSession } from "../../store/session";
export default function SignIn() {
  const backend = useSession((s) => s.backend);
  const [email, setEmail] = useState(""),
    [busy, setBusy] = useState(false),
    [sent, setSent] = useState(false);
  const { token } = useLocalSearchParams<{ token?: string }>();
  async function finish(result: { user: User; token: string }) {
    await saveToken(result.token);
    configureRepository({ uid: result.user.id });
    useSession.setState({
      user: result.user,
      active: result.user.active_space_id ?? "",
    });
    await useSession.getState().refresh();
    router.replace("/");
  }
  useEffect(() => {
    if (token)
      void getRepository()
        .call<{ user: User; token: string }>("POST", "/auth/verify", { token })
        .then(finish)
        .catch(useSession.getState().fail);
  }, [token]);
  async function login(studentId: string) {
    setBusy(true);
    try {
      await useSession.getState().login(studentId);
      router.replace("/");
    } catch (e) {
      useSession.getState().fail(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen title="Home" scoped={false}>
      <Heading>Ask once. It doesn’t get buried.</Heading>
      <Copy muted>
        A quieter way to get answers from your university community.
      </Copy>
      {(__DEV__ || backend === "local") && (
        <>
          <Section title="Demo connection" />
          <Segmented
            values={["HTTP API", "Offline demo"]}
            value={backend === "http" ? "HTTP API" : "Offline demo"}
            onChange={(v) =>
              void useSession
                .getState()
                .setBackend(v === "HTTP API" ? "http" : "local")
            }
          />
          {backend === "local" && (
            <Banner green>
              Offline demo · all actions are saved on this device.
            </Banner>
          )}
          <Section title="Choose a demo account" />
          {demoAccounts.map((a) => (
            <SecondaryButton
              key={a.studentId}
              label={`${a.name} · ${a.role}`}
              disabled={busy}
              onPress={() => void login(a.studentId)}
            />
          ))}
        </>
      )}
      {backend === "http" && (
        <>
          <Section title="Your institutional account" />
          <Field
            label="University email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="you@iut-dhaka.edu"
          />
          <PrimaryButton
            label={sent ? "Send another sign-in link" : "Send sign-in link"}
            disabled={busy || !email}
            onPress={() => {
              setBusy(true);
              void getRepository()
                .call("POST", "/auth/request-link", { email })
                .then(() => setSent(true))
                .catch(useSession.getState().fail)
                .finally(() => setBusy(false));
            }}
          />
          {sent && (
            <Banner green>
              Check your email. Your sign-in link expires in 15 minutes.
            </Banner>
          )}
        </>
      )}
      <Copy small muted>
        Requests are visible to members of their hub. Course files stay in
        Classroom; PeerLoop stores links and useful answers.
      </Copy>
    </Screen>
  );
}
