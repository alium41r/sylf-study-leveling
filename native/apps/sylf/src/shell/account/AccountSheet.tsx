// Who is signed in, and the way out. Signing out with a session going asks first, because the session has to end before the person goes: it belongs
// to them, and the next person must not inherit a running clock. What has not reached the server stays on this device for its owner.
import { useState, useSyncExternalStore } from "react";
import { View } from "react-native";
import { Avatar, Button, Callout, Dialog, Sheet, Stack, Text, useTheme } from "@sylf/design-system";
import type { Backend } from "@sylf/backend";
import { speakSessionClock } from "@sylf/spaces";
import { currentBridge, useSessionSync } from "../backend";
import { useStudySession } from "../context";
import { useStats } from "../live";

/** How long a finished session gets to reach the server before signing out carries on without it. It stays safe in the journal either way. */
const FLUSH_MS = 3_000;

export function AccountSheet({ backend, open, onClose, onSignIn }: { backend: Backend; open: boolean; onClose: () => void; onSignIn: () => void }) {
  const { space } = useTheme();
  const session = useStudySession();
  const auth = useSyncExternalStore(backend.auth.subscribe, backend.auth.getSnapshot);
  const sync = useSessionSync();
  const stats = useStats();
  const [asking, setAsking] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const signedIn = auth.status === "signed-in";
  const name = stats?.name || stats?.username || auth.user?.name || auth.user?.username || "Your account";

  const leave = async () => {
    setAsking(null);
    setLeaving(true);
    if (session.state().active) session.end();
    await currentBridge()?.flush(FLUSH_MS);
    await backend.auth.signOut();
    setLeaving(false);
    onClose();
  };
  const signOut = () => {
    if (session.state().active) setAsking(speakSessionClock(session.readout().focusSeconds));
    else void leave();
  };

  return (
    <>
      <Sheet open={open} onClose={onClose} title="Account">
        <View style={{ padding: space.lg }}>
        {signedIn ? (
          <Stack gap="lg">
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
              <Avatar name={name} size={48} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="heading" numberOfLines={1} testID="account-name">{name}</Text>
                {stats?.username ? <Text variant="small" tone="soft" numberOfLines={1}>{`@${stats.username}`}</Text> : null}
                {stats?.email ? <Text variant="caption" tone="soft" numberOfLines={1}>{stats.email}</Text> : null}
              </View>
            </View>
            {sync.pending ? <Callout tone="caution" title="A session is still being saved" message="If you sign out now it stays on this device, and is saved the next time you sign in here." /> : null}
            <Button title={leaving ? "Signing out" : "Sign out"} disabled={leaving} testID="account-sign-out" onPress={signOut} />
            <Text variant="caption" tone="soft">Changing your password or email, and deleting your account, stay on Sylf for the web for now.</Text>
          </Stack>
        ) : (
          <Stack gap="lg">
            <Text variant="small" tone="soft">You're using Sylf on this device only. Time you track stays here and earns nothing until you add it to an account.</Text>
            <Button title="Sign in" variant="emphasis" testID="account-sign-in" onPress={onSignIn} />
          </Stack>
        )}
        </View>
      </Sheet>
      <Dialog
        open={asking !== null}
        onClose={() => setAsking(null)}
        title="End your session and sign out?"
        message={`${asking ?? ""} so far. It ends now and is saved to your study record.`}
        actions={[{ label: "Keep studying", onPress: () => setAsking(null) }, { label: "End and sign out", variant: "critical", onPress: () => void leave() }]}
      />
    </>
  );
}
