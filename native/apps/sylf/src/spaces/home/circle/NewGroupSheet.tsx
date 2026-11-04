// A new group chat: a name and friends. The server allows only friends who accept messages, fails closed on blocks, and says so in its own words.
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Button, Checkbox, Sheet, Stack, Text, TextField, useNotice, useTheme } from "@sylf/design-system";
import { useLiveBackend, useOptionalResource } from "../../../shell/backend";
import { describeFailureText } from "../../../shell/account/failure";
import { useMemo } from "react";

export function NewGroupSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (conversationId: number) => void }) {
  const { space } = useTheme();
  const backend = useLiveBackend();
  const notice = useNotice();
  const [name, setName] = useState("");
  const [chosen, setChosen] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const resource = useMemo(() => (backend && open ? backend.resources.resource({ key: "circle-friends", tags: ["circle"], ttlMs: 60_000, load: (signal) => backend.reads.friends(signal) }) : null), [backend, open]);
  const friends = useOptionalResource(resource)?.data ?? [];
  useEffect(() => { if (!open) { setName(""); setChosen([]); } }, [open]);

  const create = async () => {
    if (!backend || busy || !name.trim() || !chosen.length) return;
    setBusy(true);
    try { const made = await backend.reads.social.startConversation(chosen, { name: name.trim() }); backend.resources.invalidate("messages"); onCreated(made.id); }
    catch (error) { notice(describeFailureText(error)); }
    setBusy(false);
  };
  return (
    <Sheet open={open} onClose={onClose} title="New group">
      <View style={{ padding: space.lg }}>
        <Stack gap="md">
          <TextField label="Group name" value={name} onChangeText={setName} testID="group-name" />
          {friends.length ? friends.map((friend) => <Checkbox key={friend.id} label={friend.name ?? friend.username} value={chosen.includes(friend.id)} onChange={(on) => setChosen(on ? [...chosen, friend.id] : chosen.filter((id) => id !== friend.id))} />) : <Text variant="small" tone="soft">Add a friend first, in People.</Text>}
          <Button title={busy ? "Creating" : "Create group"} variant="emphasis" disabled={!name.trim() || !chosen.length || busy} testID="group-create" onPress={() => void create()} />
        </Stack>
      </View>
    </Sheet>
  );
}
