// What you can do with a friend: message them, remove them, or block them. Blocking is immediate on the server and ends the friendship. A person's
// hidden details stay hidden here, because the server never sent them.
import { useState } from "react";
import { View } from "react-native";
import { Button, Dialog, Sheet, Stack, Text, useNotice, useTheme } from "@sylf/design-system";
import { useLiveBackend } from "../../../shell/backend";
import { describeFailureText } from "../../../shell/account/failure";
import type { CirclePerson } from "../data/contracts";

type Confirm = "remove" | "block" | null;

export function PersonSheet({ person, onClose, onMessage }: { person: CirclePerson | null; onClose: () => void; onMessage: (conversationId: number) => void }) {
  const { space } = useTheme();
  const backend = useLiveBackend();
  const notice = useNotice();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const userId = person ? Number(person.id) : NaN;

  const run = async (work: () => Promise<unknown>, done: string) => {
    if (!backend || busy) return;
    setBusy(true);
    try { await work(); notice(done); backend.resources.invalidate("circle"); backend.resources.invalidate("messages"); onClose(); }
    catch (error) { notice(describeFailureText(error)); }
    setBusy(false);
  };
  const message = async () => {
    if (!backend || busy || Number.isNaN(userId)) return;
    setBusy(true);
    try { const made = await backend.reads.social.startConversation([userId]); backend.resources.invalidate("messages"); onClose(); onMessage(made.id); }
    catch (error) { notice(describeFailureText(error)); }
    setBusy(false);
  };

  return (
    <Sheet open={person !== null} onClose={onClose} title={person?.name ?? "Friend"}>
      <View style={{ padding: space.lg }}>
        <Stack gap="md">
          {person ? <Text variant="small" tone="soft">{person.status}{person.detail ? `. ${person.detail}` : ""}</Text> : null}
          <Button title="Message" variant="emphasis" disabled={busy || Number.isNaN(userId)} testID="person-message" onPress={() => void message()} />
          <Button title="Remove friend" disabled={busy} testID="person-remove" onPress={() => setConfirm("remove")} />
          <Button title="Block" variant="critical" disabled={busy} testID="person-block" onPress={() => setConfirm("block")} />
        </Stack>
      </View>
      <Dialog open={confirm === "remove"} onClose={() => setConfirm(null)} title="Remove this friend?" message="You can send a request again later." actions={[{ label: "Keep", onPress: () => setConfirm(null) }, { label: "Remove", variant: "critical", onPress: () => { setConfirm(null); void run(() => backend!.reads.social.removeFriend(userId), "Friend removed."); } }]} />
      <Dialog open={confirm === "block"} onClose={() => setConfirm(null)} title="Block this person?" message="They can't message you or see you, and you stop being friends. You can unblock them from your account." actions={[{ label: "Cancel", onPress: () => setConfirm(null) }, { label: "Block", variant: "critical", onPress: () => { setConfirm(null); void run(() => backend!.reads.social.block(userId), "Blocked."); } }]} />
    </Sheet>
  );
}
