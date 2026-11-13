// Who is around, and who is asking: friends online or studying now, the party you are in, and invitations and friend requests answered where they are read.
// It shows what Circle's own read gives and nothing else. What a friend hides stays hidden, there is no activity feed, and an empty circle says so and
// offers the way to find people. It draws no surface: a heading, faces with a line each, and rows.
import { memo, useCallback, useMemo } from "react";
import { View } from "react-native";
import { Button, Placeholder, Press, Stack, Text, useTheme } from "@sylf/design-system";
import { useHomeNavigation } from "../../../shell/context";
import { AnswerRowsFor } from "../circle/AnswerRows";
import { PersonRow } from "../circle/PersonRow";
import { useHomeResult } from "../data";
import type { CirclePerson } from "../data/contracts";
import { GroupLabel, PartHeader } from "./TodayParts";

const MAX_PEOPLE = 5;

/** Studying first, then online, each in the server's order. Nobody offline: this is who is around now. */
export function aroundNow(people: CirclePerson[]): CirclePerson[] {
  return [...people.filter((person) => person.presence === "focusing"), ...people.filter((person) => person.presence === "online")];
}

export function aroundLine(people: CirclePerson[]): string | null {
  if (!people.length) return null;
  const studying = people.filter((person) => person.presence === "focusing").length;
  const online = people.filter((person) => person.presence === "online").length;
  if (studying) return `${studying} studying now`;
  return online ? `${online} online` : null;
}

export const TodaySocial = memo(function TodaySocial() {
  const { space } = useTheme();
  const navigation = useHomeNavigation();
  const result = useHomeResult("circle");
  const circle = result?.data ?? null;
  const around = useMemo(() => aroundNow(circle?.people ?? []), [circle]);
  const openCircle = useCallback(() => { navigation.setView("circle", "people"); navigation.select("circle"); }, [navigation]);
  const openParties = useCallback(() => { navigation.setView("circle", "parties"); navigation.select("circle"); }, [navigation]);
  const party = circle?.parties[0];
  const asked = (circle?.invites?.length ?? 0) + (circle?.requests?.length ?? 0);
  const others = around.length - Math.min(around.length, MAX_PEOPLE);

  return (
    <View testID="today-circle" style={{ gap: space.xl }}>
      <PartHeader title="Circle" detail={circle ? aroundLine(circle.people) : null} action="Open" onAction={openCircle} actionTestID="today-open-circle" />
      {!result ? (
        <View aria-label="Loading" style={{ gap: space.md }}><Placeholder width="70%" /><Placeholder width="50%" /></View>
      ) : !circle ? (
        <View testID="today-circle-failed" style={{ gap: space.xs, alignItems: "flex-start" }}>
          <Text variant="small" tone="soft">{result.live.failure ?? "Your circle didn't load."}</Text>
          <Button title="Try again" size="small" variant="ghost" onPress={result.live.retry} />
        </View>
      ) : (
        <>
          {asked ? (
            <Stack gap="md" testID="today-invites">
              <GroupLabel>Invitations</GroupLabel>
              <AnswerRowsFor invites={circle.invites} requests={circle.requests} idPrefix="today" />
            </Stack>
          ) : null}
          <Stack gap="sm" testID="today-around">
            {asked || party ? <GroupLabel>Around now</GroupLabel> : null}
            {around.length ? (
              <>
                <Stack gap="xs">{around.slice(0, MAX_PEOPLE).map((person) => <PersonRow key={person.id} person={person} testID="today-person" />)}</Stack>
                {others > 0 ? <Text variant="caption" tone="soft">{`And ${others} more.`}</Text> : null}
              </>
            ) : circle.people.length ? (
              <Text variant="small" tone="soft">Nobody is online right now.</Text>
            ) : (
              <View style={{ gap: space.sm, alignItems: "flex-start" }}>
                <Text variant="small" tone="soft">Add friends to study alongside them.</Text>
                <Button title="Find people" size="small" icon="plus" testID="today-find-people" onPress={openCircle} />
              </View>
            )}
          </Stack>
          {party ? (
            <Stack gap="xs" testID="today-party">
              <GroupLabel>Your party</GroupLabel>
              <Press role="button" label={`${party.name}. ${party.members} ${party.members === 1 ? "member" : "members"}. Open your party`} onPress={openParties} bodyStyle={{ paddingVertical: space.xs, gap: space.hair }}>
                <Text variant="small" numberOfLines={1}>{party.name}</Text>
                <Text variant="caption" tone="soft">{`${party.members} ${party.members === 1 ? "member" : "members"}`}</Text>
              </Press>
            </Stack>
          ) : null}
        </>
      )}
    </View>
  );
});
