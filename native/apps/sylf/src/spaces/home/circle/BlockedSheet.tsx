// The people you have blocked, and a way to undo it. Blocking was one tap in a person's sheet, so undoing it has to be just as findable. Unblocking does not
// bring a friendship back: they are a stranger again, and either of you can send a request.
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { Button, EmptyState, ListRow, Sheet, Stack, Text, useNotice, useTheme } from "@sylf/design-system";
import { useLiveBackend, useOptionalResource } from "../../../shell/backend";
import { describeFailureText } from "../../../shell/account/failure";

export function BlockedSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { space } = useTheme();
  const backend = useLiveBackend();
  const notice = useNotice();
  const [busy, setBusy] = useState<number | null>(null);
  const resource = useMemo(() => (backend && open ? backend.resources.resource({ key: "circle-blocked", tags: ["circle", "blocked"], ttlMs: 30_000, load: (signal) => backend.reads.social.blocked(signal) }) : null), [backend, open]);
  const state = useOptionalResource(resource);
  // A block made on another device is not something this one can know about, so opening the list asks again.
  useEffect(() => { if (open) resource?.refresh(); }, [open, resource]);
  const people = state?.data ?? null;
  const unblock = async (id: number) => {
    if (!backend || busy !== null) return;
    setBusy(id);
    try { await backend.reads.social.unblock(id); notice("Unblocked."); backend.resources.invalidate("blocked"); backend.resources.invalidate("circle"); }
    catch (error) { notice(describeFailureText(error)); }
    setBusy(null);
  };
  return (
    <Sheet open={open} onClose={onClose} title="Blocked people">
      <View style={{ padding: space.lg }}>
        {!people ? <Text tone="soft">{state?.status === "failed" || state?.status === "offline" ? "Blocked people didn't load. Try again in a moment." : "Loading."}</Text> : !people.length ? <EmptyState icon="circle" title="No one is blocked" message="People you block can't message you or see you." /> : (
          <Stack gap="xs" testID="blocked-list">
            {people.map((person) => (
              <View key={person.id} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <View style={{ flex: 1, minWidth: 0 }}><ListRow title={person.name ?? person.username} detail={`@${person.username}`} /></View>
                <Button title="Unblock" size="small" disabled={busy !== null} testID={`unblock-${person.id}`} onPress={() => void unblock(person.id)} />
              </View>
            ))}
          </Stack>
        )}
      </View>
    </Sheet>
  );
}
