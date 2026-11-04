// The notification list: what the server noted for you, newest first. Reading is local, nothing is pushed to the device, and the text is drawn through
// RichText because it can include model- or user-written words. Opening the sheet does not mark anything read: that is a button.
import { useMemo } from "react";
import { View } from "react-native";
import { Badge, Button, EmptyState, Sheet, Stack, Text, useNotice, useTheme } from "@sylf/design-system";
import { RichText } from "../../../shell/rich-text/RichText";
import { useLiveBackend, useOptionalResource } from "../../../shell/backend";
import { describeFailureText } from "../../../shell/account/failure";

export function NotificationsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { space } = useTheme();
  const backend = useLiveBackend();
  const notice = useNotice();
  const resource = useMemo(() => (backend && open ? backend.resources.resource({ key: "circle-notifications", tags: ["notifications"], ttlMs: 30_000, load: (signal) => backend.reads.social.notifications(signal) }) : null), [backend, open]);
  const items = useOptionalResource(resource)?.data ?? null;
  const act = async (work: () => Promise<unknown>) => { if (!backend) return; try { await work(); backend.resources.invalidate("notifications"); resource?.refresh(); } catch (error) { notice(describeFailureText(error)); } };
  return (
    <Sheet open={open} onClose={onClose} title="Notifications">
      <View style={{ padding: space.lg }}>
        {!items ? <Text tone="soft">Loading.</Text> : !items.length ? <EmptyState icon="circle" title="Nothing new" message="Notes from Sylf and your friends show up here." /> : (
          <Stack gap="md" testID="notifications">
            <View style={{ flexDirection: "row", gap: space.sm }}>
              <Button title="Mark all read" size="small" disabled={!items.some((item) => !item.read)} onPress={() => void act(() => backend!.reads.social.markNotificationsRead())} />
              <Button title="Clear all" size="small" variant="critical" onPress={() => void act(() => backend!.reads.social.clearNotifications())} />
            </View>
            {items.map((item) => (
              <View key={item.id} style={{ gap: space.xs }}>
                <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}><Text variant="caption" tone="soft">{new Date(item.createdAt).toLocaleString()}</Text>{item.read ? null : <Badge label="New" />}</View>
                <RichText text={item.content} />
              </View>
            ))}
          </Stack>
        )}
      </View>
    </Sheet>
  );
}
