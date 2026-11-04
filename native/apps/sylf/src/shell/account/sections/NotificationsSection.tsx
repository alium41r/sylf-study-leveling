// Notifications: what Sylf may tell you, with this device's permission beside it. The two are separate. A switch here is the account's, kept on the server,
// and the permission is the system's, which only the system can change once refused.
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Button, Callout, Stack, Text, Toggle, useNotice } from "@sylf/design-system";
import type { NotificationKey } from "@sylf/backend";
import { useLiveBackend } from "../../backend";
import { alertPermission, requestAlertPermission, type AlertPermission } from "../../focus/alerts";
import { describeFailureText } from "../failure";
import { useNotificationPreferences } from "../useAccount";
import { AccountSection } from "./Section";

const GROUPS: { title: string; items: { key: NotificationKey; label: string }[] }[] = [
  { title: "Progress", items: [{ key: "levelRankPromotions", label: "Level and rank changes" }, { key: "streakMilestones", label: "Streak milestones" }, { key: "unlockedAchievements", label: "Honours ready to claim" }] },
  { title: "Study", items: [{ key: "aiStudyPlans", label: "Study plans" }, { key: "questAssignments", label: "New quests" }, { key: "scheduledFocusReminders", label: "Focus reminders" }] },
  { title: "Friends", items: [{ key: "incomingFriendRequests", label: "Friend requests" }, { key: "directMessages", label: "Messages" }, { key: "groupActivity", label: "Study party activity" }] },
];
const PERMISSION_WORDS: Record<AlertPermission, string> = { granted: "This device can alert you when a study phase ends.", undetermined: "This device hasn't been asked yet.", denied: "Alerts are off for Sylf on this device. Turn them on in the system's settings.", unsupported: "This device can't show alerts." };

export function NotificationsSection({ onPlace }: { onPlace: (id: string, y: number) => void }) {
  const backend = useLiveBackend();
  const notice = useNotice();
  const result = useNotificationPreferences();
  const data = result?.data;
  const [permission, setPermission] = useState<AlertPermission | null>(null);
  useEffect(() => { void alertPermission().then(setPermission); }, []);
  const set = async (key: NotificationKey, value: boolean) => {
    if (!backend) return;
    try { await backend.reads.account.saveNotificationPreferences({ [key]: value }); }
    catch (error) { notice(describeFailureText(error)); }
    backend.resources.invalidate("account-notifications");
  };
  const master = data?.masterEnabled !== false;
  return (
    <AccountSection id="notifications" title="Notifications" onPlace={onPlace}>
      {!result ? <Text tone="soft">Loading your settings.</Text> : !data ? <Callout tone="caution" title="Notifications didn't load" message={result.live.failure ?? "Try again in a moment."} /> : (
        <Stack gap="lg">
          <View testID="account-notify-master"><Toggle label="Allow notifications" value={master} onChange={(value) => void set("masterEnabled", value)} /></View>
          {GROUPS.map((group) => (
            <Stack key={group.title} gap="sm">
              <Text variant="caption" tone="soft">{group.title}</Text>
              {group.items.map((item) => <View key={item.key} testID={`account-notify-${item.key}`}><Toggle label={item.label} value={data[item.key] !== false} disabled={!master} onChange={(value) => void set(item.key, value)} /></View>)}
            </Stack>
          ))}
        </Stack>
      )}
      {permission ? (
        <Stack gap="sm">
          <Text variant="small" tone="soft" testID="account-alert-permission">{PERMISSION_WORDS[permission]}</Text>
          {permission === "undetermined" ? <View style={{ flexDirection: "row" }}><Button title="Allow on this device" size="small" testID="account-allow-alerts" onPress={() => void requestAlertPermission().then(setPermission)} /></View> : null}
        </Stack>
      ) : null}
    </AccountSection>
  );
}
