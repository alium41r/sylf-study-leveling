// Honours answers what I have earned. A shelf by category. What is ready gathers into one row with one Claim all, which asks the server once for each
// and never twice for the same: a second press while it is working does nothing, and a refusal stops the run and says why. Locked ones say how far along.
import { useRef, useState } from "react";
import { View } from "react-native";
import { Badge, Button, Callout, Icon, Press, Progress, Stack, Text, useNotice, useTheme } from "@sylf/design-system";
import type { AchievementRecord } from "@sylf/backend";
import { useLiveBackend } from "../../../shell/backend";
import { describeFailureText } from "../../../shell/account/failure";
import { Section } from "../HomePage";
import { refreshProgress, useHonours } from "./useProgress";

const ready = (record: AchievementRecord) => !record.isClaimed && record.currentProgress >= record.target;
const reward = (record: AchievementRecord) => (record.reward ? `+${record.reward.amount.toLocaleString()} ${record.reward.type === "XP" ? "XP" : "Sylph"}` : "");

function Honour({ record }: { record: AchievementRecord }) {
  const { color, space } = useTheme();
  return (
    <View testID={`progress-honour-${record.id}`} accessible aria-label={`${record.title}. ${record.isClaimed ? "Earned" : ready(record) ? "Ready to claim" : `${Math.min(record.currentProgress, record.target)} of ${record.target}`}. ${record.description}`} style={{ flexDirection: "row", gap: space.md }}>
      <View style={{ width: 18, height: 22, alignItems: "center", justifyContent: "center" }}><Icon name={record.isClaimed || ready(record) ? "check" : "lock"} size={16} color={color.inkSoft} /></View>
      <View style={{ flex: 1, minWidth: 0, gap: space.xs }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm }}>
          <Text variant="small" tone={record.isClaimed ? "ink" : "soft"} style={{ flex: 1 }}>{record.title}</Text>
          {record.rarity && record.rarity !== "Common" ? <Badge label={record.rarity} /> : null}
        </View>
        <Text variant="caption" tone="soft">{record.description}{reward(record) ? ` ${reward(record)}.` : ""}</Text>
        {!record.isClaimed && !ready(record) ? <Progress value={Math.min(1, record.currentProgress / Math.max(1, record.target))} label={`${record.title} progress`} /> : null}
      </View>
    </View>
  );
}

function Category({ name, records }: { name: string; records: AchievementRecord[] }) {
  const { space } = useTheme();
  const [earnedOpen, setEarnedOpen] = useState(false);
  const earned = records.filter((record) => record.isClaimed);
  const rest = records.filter((record) => !record.isClaimed);
  return (
    <Section title={`${name}, ${earned.length} of ${records.length}`}>
      <Stack gap="md">
        {rest.map((record) => <Honour key={record.id} record={record} />)}
        {earned.length ? (
          <Press role="button" expanded={earnedOpen} label={earnedOpen ? "Hide earned" : `Show ${earned.length} earned`} onPress={() => setEarnedOpen(!earnedOpen)} bodyStyle={{ paddingVertical: space.xs }}>
            <Text variant="caption" tone="soft">{earnedOpen ? "Hide earned" : `${earned.length} earned`}</Text>
          </Press>
        ) : null}
        {earnedOpen ? earned.map((record) => <Honour key={record.id} record={record} />) : null}
      </Stack>
    </Section>
  );
}

export function HonoursView() {
  const { space } = useTheme();
  const backend = useLiveBackend();
  const notice = useNotice();
  const result = useHonours();
  const [claiming, setClaiming] = useState(false);
  // A ref as well as state: two presses in the same frame must not both start a run.
  const running = useRef(false);
  const records = result?.data ?? [];
  const waiting = records.filter(ready);
  const categories = [...new Set(records.map((record) => record.category ?? "Other"))];
  const claimAll = async () => {
    if (!backend || running.current) return;
    running.current = true;
    setClaiming(true);
    let done = 0;
    try {
      for (const record of waiting) { await backend.reads.claimAchievement(record.id); done += 1; }
      notice(done === 1 ? "Claimed." : `Claimed ${done}.`);
    } catch (error) {
      notice(done ? `Claimed ${done}. ${describeFailureText(error)}` : describeFailureText(error));
    }
    refreshProgress(backend);
    running.current = false;
    setClaiming(false);
  };
  if (!result) return <View testID="progress-honours"><Text tone="soft">Loading your honours.</Text></View>;
  if (!result.data) return <View testID="progress-honours"><Callout tone="caution" title="Honours didn't load" message={result.live.failure ?? "Try again in a moment."} /></View>;
  return (
    <Stack gap="xl" testID="progress-honours">
      {waiting.length ? (
        <View testID="progress-claim-row" style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <Text variant="body" style={{ flex: 1 }}>{waiting.length === 1 ? "One honour is ready." : `${waiting.length} honours are ready.`}</Text>
          <Button title={claiming ? "Claiming" : "Claim all"} variant="emphasis" disabled={claiming} testID="progress-claim-all" onPress={() => void claimAll()} />
        </View>
      ) : <Text variant="small" tone="soft">{`${records.filter((record) => record.isClaimed).length} of ${records.length} earned. Nothing waiting.`}</Text>}
      {categories.map((name) => <Category key={name} name={name} records={records.filter((record) => (record.category ?? "Other") === name)} />)}
    </Stack>
  );
}
