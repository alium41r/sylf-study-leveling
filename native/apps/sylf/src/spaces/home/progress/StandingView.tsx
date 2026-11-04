// Standing answers how I compare. You in context first, two above and two below, then the top. Friends or everyone, four orderings. The server has
// already left out anyone who keeps their rank or hours from this viewer, so what is listed is what this person may see, and the page says so.
import { useState } from "react";
import { View } from "react-native";
import { Callout, Chip, ListRow, Segmented, Stack, Text, useTheme } from "@sylf/design-system";
import type { RankingEntry, RankingSort } from "@sylf/backend";
import { formatMinutes } from "../format";
import { Section } from "../HomePage";
import { contextWindow, ordinal } from "./shared";
import { useRankings } from "./useProgress";

const SORTS: { id: RankingSort; label: string }[] = [{ id: "level", label: "Level" }, { id: "studyHours", label: "Study time" }, { id: "streak", label: "Streak" }, { id: "quests", label: "Quests" }];
const value = (sort: RankingSort, entry: RankingEntry) => (sort === "level" ? `Level ${entry.level}` : sort === "studyHours" ? formatMinutes(Math.round(entry.totalStudyMinutes)) : sort === "streak" ? `${entry.streakDays} ${entry.streakDays === 1 ? "day" : "days"}` : `${entry.questsCompleted}`);

function Row({ entry, place, sort }: { entry: RankingEntry; place: number; sort: RankingSort }) {
  return <View testID={entry.isCurrentUser ? "progress-standing-you" : `progress-standing-${entry.id}`}><ListRow title={entry.isCurrentUser ? "You" : entry.name || entry.username} detail={ordinal(place)} value={value(sort, entry)} selected={entry.isCurrentUser} /></View>;
}

export function StandingView() {
  const { space } = useTheme();
  const [sort, setSort] = useState<RankingSort>("level");
  const [scope, setScope] = useState<"friends" | "everyone">("friends");
  const result = useRankings(sort);
  const data = result?.data;
  const entries = data ? (scope === "friends" ? data.friends : data.global) : [];
  const placeOf = (entry: RankingEntry) => (scope === "friends" ? entry.friendRank ?? entry.rank : entry.rank);
  const { top, around } = contextWindow(entries);
  const me = entries.find((entry) => entry.isCurrentUser);
  return (
    <Stack gap="lg" testID="progress-standing">
      <View style={{ gap: space.sm }}>
        <Segmented<"friends" | "everyone"> label="Compare with" value={scope} options={[{ value: "friends", label: "Friends" }, { value: "everyone", label: "Everyone" }]} onChange={setScope} />
        <View role="radiogroup" aria-label="Order by" style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
          {SORTS.map((item) => <Chip key={item.id} radio label={item.label} selected={sort === item.id} onPress={() => setSort(item.id)} />)}
        </View>
      </View>
      {!result ? <Text tone="soft">Loading the standings.</Text> : !data ? <Callout tone="caution" title="Standings didn't load" message={result.live.failure ?? "Try again in a moment."} /> : (
        <>
          <Text variant="body" testID="progress-standing-summary">
            {scope === "friends"
              ? me ? `You're ${ordinal(placeOf(me))} of ${entries.length} among your friends.` : "Add friends in Circle to compare with them."
              : data.currentUserRank ? `You're ${ordinal(data.currentUserRank)} of ${data.totalPlayers.toLocaleString()} players.` : "You'll appear here once you've studied."}
          </Text>
          {around.length ? <Section title="Around you"><Stack gap="xs">{around.map((entry) => <Row key={entry.id} entry={entry} place={placeOf(entry)} sort={sort} />)}</Stack></Section> : null}
          {top.length ? <Section title={scope === "friends" ? "Friends" : "At the top"}><Stack gap="xs">{top.map((entry) => <Row key={entry.id} entry={entry} place={placeOf(entry)} sort={sort} />)}</Stack></Section> : null}
          <Text variant="caption" tone="soft">People who keep their rank or study time private aren't listed. Your own settings are in your account.</Text>
        </>
      )}
    </Stack>
  );
}
