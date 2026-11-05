// A person's profile, as the server shows it to you. It is read from one route that already applies their privacy, so a hidden rank or hours are simply
// absent here, never zero. The actions offered are the ones the server says are allowed. HP is never shown (ADR 0017). It opens from anywhere through
// `openProfile`, and the shell mounts it once.
import { useMemo, useState } from "react";
import { View } from "react-native";
import { Avatar, Badge, Button, Callout, Dialog, Progress, Sheet, Stack, Text, useNotice, useTheme } from "@sylf/design-system";
import type { ProfileView } from "@sylf/backend";
import { useAuth, useLiveBackend, useOptionalResource } from "../backend";
import { describeFailureText } from "../account/failure";
import { formatMinutes } from "../../spaces/home/format";
import { lookOf } from "./look";
import { profileTarget, useProfileTarget } from "./store";

const ATTRIBUTES: { key: "endurance" | "tenacity" | "velocity" | "discipline" | "synthesis"; label: string }[] = [
  { key: "endurance", label: "Endurance" }, { key: "tenacity", label: "Tenacity" }, { key: "velocity", label: "Velocity" }, { key: "discipline", label: "Discipline" }, { key: "synthesis", label: "Synthesis" },
];

function Stat({ value, label }: { value: string; label: string }) {
  return <View style={{ minWidth: 88, gap: 2 }}><Text variant="value">{value}</Text><Text variant="caption" tone="soft">{label}</Text></View>;
}

export function ProfileSheet({ onMessage }: { onMessage?: (conversationId: number) => void }) {
  const { color, shape, space } = useTheme();
  const username = useProfileTarget();
  const backend = useLiveBackend();
  const me = useAuth().userId;
  const notice = useNotice();
  const [confirm, setConfirm] = useState<"remove" | "block" | null>(null);
  const [busy, setBusy] = useState(false);
  const resource = useMemo(() => (backend && username ? backend.resources.resource({ key: `profile-${username}`, tags: ["profile", "circle"], ttlMs: 20_000, load: (signal) => backend.reads.profiles.profile(username, signal) }) : null), [backend, username]);
  const state = useOptionalResource(resource);
  const view: ProfileView | null = state?.data ?? null;
  const profile = view?.profile;
  const look = profile ? lookOf(profile) : null;
  const shown = view?.privacySettings;
  const allowed = view?.permissions ?? {};
  const self = view?.isSelf === true || (profile && profile.id === me);

  const run = async (work: () => Promise<unknown>, done: string) => {
    if (!backend || busy) return;
    setBusy(true);
    try { await work(); notice(done); backend.resources.invalidate("circle"); backend.resources.invalidate("messages"); backend.resources.invalidate("profile"); resource?.refresh(); }
    catch (error) { notice(describeFailureText(error)); }
    setBusy(false);
  };
  const message = async () => {
    if (!backend || !profile || busy) return;
    setBusy(true);
    try { const made = await backend.reads.social.startConversation([profile.id]); backend.resources.invalidate("messages"); profileTarget.close(); onMessage?.(made.id); }
    catch (error) { notice(describeFailureText(error)); }
    setBusy(false);
  };

  return (
    <Sheet open={username !== null} onClose={profileTarget.close} title={profile?.name ?? (username ? `@${username}` : "Profile")}>
      <View style={{ padding: space.lg }} testID="profile-sheet">
        {!view ? (
          state?.status === "failed" || state?.status === "offline" ? <Callout tone="caution" title="This profile didn't load" message={state?.error ? describeFailureText(state.error) : "Try again in a moment."} /> : <Text tone="soft">Loading.</Text>
        ) : shown?.isProfileVisible === false && !self ? (
          <Callout title="This profile is private" message={`@${profile?.username} keeps their profile to themselves.`} />
        ) : profile ? (
          <Stack gap="lg">
            <View style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
              <View style={{ borderRadius: shape.radius.md + 3, borderWidth: look?.frameColour ? 2 : 0, borderColor: look?.frameColour ?? "transparent", padding: look?.frameColour ? 2 : 0 }}>
                <Avatar name={profile.name ?? profile.username} size={56} presence={profile.isStudying ? "focusing" : profile.isOnline ? "online" : undefined} />
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text variant="subheading" numberOfLines={1} style={look?.nameColour ? { color: look.nameColour } : undefined} testID="profile-name">{profile.name ?? profile.username}</Text>
                <Text variant="caption" tone="soft" numberOfLines={1}>{[`@${profile.username}`, look?.title].filter(Boolean).join("  ·  ")}</Text>
                <View style={{ flexDirection: "row", gap: space.xs, flexWrap: "wrap", paddingTop: 2 }}>
                  {profile.level !== undefined ? <Badge label={`Level ${profile.level}`} /> : null}
                  {shown?.showRank !== false && profile.hunterRank ? <Badge label={`Rank ${profile.hunterRank}`} /> : null}
                  {profile.isStudying ? <Badge label="Studying now" tone="accent" /> : null}
                </View>
              </View>
            </View>

            {profile.bio ? <Text variant="small">{profile.bio}</Text> : null}

            {profile.levelProgress !== undefined ? <Progress value={Math.min(1, Math.max(0, profile.levelProgress / 100))} label={`Level ${profile.level ?? ""} progress`} /> : null}

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.lg }} testID="profile-stats">
              {shown?.showStudyHours !== false && profile.totalStudyMinutes !== undefined ? <Stat value={formatMinutes(profile.totalStudyMinutes)} label="Studied in all" /> : null}
              {shown?.showStudyHours !== false && profile.todayStudyMinutes !== undefined ? <Stat value={formatMinutes(profile.todayStudyMinutes)} label="Today" /> : null}
              {profile.streakDays !== undefined ? <Stat value={`${profile.streakDays} ${profile.streakDays === 1 ? "day" : "days"}`} label="In a row" /> : null}
              {profile.completedQuestsCount !== undefined ? <Stat value={String(profile.completedQuestsCount)} label="Quests done" /> : null}
              {shown?.showAchievements !== false && profile.achievementsCount !== undefined ? <Stat value={String(profile.achievementsCount)} label="Honours" /> : null}
            </View>

            {profile.stats && Object.keys(profile.stats).length ? (
              <Stack gap="xs">
                <Text variant="caption" tone="soft">Attributes</Text>
                {ATTRIBUTES.filter((attribute) => profile.stats?.[attribute.key] !== undefined).map((attribute) => (
                  <View key={attribute.key} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                    <Text variant="caption" style={{ width: 84 }}>{attribute.label}</Text>
                    <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: color.line, overflow: "hidden" }}><View style={{ width: `${Math.min(100, ((profile.stats?.[attribute.key] ?? 0) / 40) * 100)}%`, height: 4, backgroundColor: color.accent.mote }} /></View>
                    <Text variant="caption" tone="soft" style={{ width: 24, textAlign: "right" }}>{profile.stats?.[attribute.key]}</Text>
                  </View>
                ))}
              </Stack>
            ) : null}

            {shown?.showAchievements !== false && profile.recentAchievements?.length ? (
              <Stack gap="xs">
                <Text variant="caption" tone="soft">Recent honours</Text>
                {profile.recentAchievements.slice(0, 4).map((item, index) => <Text key={index} variant="small">{item.title ?? item.name}</Text>)}
              </Stack>
            ) : null}

            {!self ? (
              <Stack gap="sm">
                {allowed.canSendMessage ? <Button title="Message" variant="emphasis" disabled={busy} testID="profile-message" onPress={() => void message()} /> : null}
                {allowed.canSendFriendRequest ? <Button title="Add friend" variant="emphasis" disabled={busy} testID="profile-add" onPress={() => backend && void run(() => backend.reads.social.sendRequest(profile.id), "Request sent.")} /> : null}
                <View style={{ flexDirection: "row", gap: space.sm }}>
                  {allowed.canRemoveFriend ? <Button title="Remove friend" disabled={busy} testID="profile-remove" onPress={() => setConfirm("remove")} /> : null}
                  {allowed.canBlock ? <Button title="Block" variant="critical" disabled={busy} testID="profile-block" onPress={() => setConfirm("block")} /> : null}
                  {allowed.canUnblock ? <Button title="Unblock" disabled={busy} testID="profile-unblock" onPress={() => backend && void run(() => backend.reads.social.unblock(profile.id), "Unblocked.")} /> : null}
                </View>
              </Stack>
            ) : null}
          </Stack>
        ) : null}
      </View>
      <Dialog open={confirm === "remove"} onClose={() => setConfirm(null)} title="Remove this friend?" message="You can send a request again later." actions={[{ label: "Keep", onPress: () => setConfirm(null) }, { label: "Remove", variant: "critical", onPress: () => { setConfirm(null); if (profile) void run(() => backend!.reads.social.removeFriend(profile.id), "Friend removed."); } }]} />
      <Dialog open={confirm === "block"} onClose={() => setConfirm(null)} title="Block this person?" message="They can't message you or see you, and you stop being friends. You can unblock them later from Blocked, in Circle." actions={[{ label: "Cancel", onPress: () => setConfirm(null) }, { label: "Block", variant: "critical", onPress: () => { setConfirm(null); if (profile) void run(() => backend!.reads.social.block(profile.id), "Blocked."); } }]} />
    </Sheet>
  );
}
