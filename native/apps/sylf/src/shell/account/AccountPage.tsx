// The account, as one page reached from the foot of Home's rail. Slice A gives it its place and its way out. Who you are, what others see and the rest
// fill in with the Account slice. Signing out with a session going asks first: it belongs to them, and the next person must not inherit a running clock.
import { useState, useSyncExternalStore } from "react";
import { ScrollView, View } from "react-native";
import { Avatar, Button, Callout, Dialog, IconButton, Stack, Text, useDismiss, useTheme } from "@sylf/design-system";
import { speakSessionClock } from "@sylf/spaces";
import { currentBridge, useBackend, useSessionSync } from "../backend";
import { useHomeNavigation, useShellMetrics, useStudySession } from "../context";
import { useStats } from "../live";
import { useAccountEntry } from "../context";

/** How long a finished session gets to reach the server before signing out carries on without it. It stays safe in the journal either way. */
const FLUSH_MS = 3_000;

export default function AccountPage() {
  const { space } = useTheme();
  const { top, control } = useShellMetrics();
  const navigation = useHomeNavigation();
  const entry = useAccountEntry();
  const backend = useBackend();
  const session = useStudySession();
  const stats = useStats();
  const sync = useSessionSync();
  const auth = useSyncExternalStore(backend!.auth.subscribe, backend!.auth.getSnapshot);
  const [asking, setAsking] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const close = () => navigation.setAccountOpen(false);
  useDismiss(true, close);
  const signedIn = auth.status === "signed-in";
  const name = stats?.name || stats?.username || auth.user?.name || auth.user?.username || "Your account";

  const leave = async () => {
    setAsking(null);
    setLeaving(true);
    if (session.state().active) session.end();
    await currentBridge()?.flush(FLUSH_MS);
    close();
    await backend!.auth.signOut();
    setLeaving(false);
  };
  const signOut = () => {
    if (session.state().active) setAsking(speakSessionClock(session.readout().focusSeconds));
    else void leave();
  };

  return (
    <View testID="account-page" style={{ flex: 1, paddingTop: top + control + space.sm }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: space.xl, paddingBottom: space.sky }}>
        <View style={{ width: "100%", maxWidth: 720, alignSelf: "center", gap: space.xl }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <IconButton icon="chevronLeft" label="Back" testID="account-back" onPress={close} />
            <Text variant="display" role="heading" aria-level={1}>Account</Text>
          </View>
          {signedIn ? (
            <Stack gap="lg">
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
                <Avatar name={name} size={56} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="heading" numberOfLines={1} testID="account-name">{name}</Text>
                  {stats?.username ? <Text variant="small" tone="soft" numberOfLines={1}>{`@${stats.username}`}</Text> : null}
                  {stats?.email ? <Text variant="caption" tone="soft" numberOfLines={1}>{stats.email}</Text> : null}
                </View>
              </View>
              {sync.pending ? <Callout tone="caution" title="A session is still being saved" message="If you sign out now it stays on this device, and is saved the next time you sign in here." /> : null}
              <View style={{ flexDirection: "row" }}><Button title={leaving ? "Signing out" : "Sign out"} disabled={leaving} testID="account-sign-out" onPress={signOut} /></View>
            </Stack>
          ) : (
            <Stack gap="lg">
              <Text variant="small" tone="soft">You're using Sylf on this device only. Time you track stays here and earns nothing until you add it to an account.</Text>
              <View style={{ flexDirection: "row" }}><Button title="Sign in" variant="emphasis" testID="account-sign-in" onPress={() => { close(); entry?.signIn(); }} /></View>
            </Stack>
          )}
        </View>
      </ScrollView>
      <Dialog
        open={asking !== null}
        onClose={() => setAsking(null)}
        title="End your session and sign out?"
        message={`${asking ?? ""} so far. It ends now and is saved to your study record.`}
        actions={[{ label: "Keep studying", onPress: () => setAsking(null) }, { label: "End and sign out", variant: "critical", onPress: () => void leave() }]}
      />
    </View>
  );
}
