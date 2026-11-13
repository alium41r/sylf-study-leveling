// Circle draws its name: the people you study with sit around one quiet ring, and the middle says how many are studying now. It shows only what the
// server gives. A friend's hidden level or hours say "hidden", never zero, and there is no schedule or activity feed, because no such thing exists.
// People, Messages and Parties are views of this page: friend requests, finding people, groups, and studying together all work here.
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Avatar, Button, Stack, Text, useTheme, useWindowClass } from "@sylf/design-system";
import { useShellMetrics } from "../../../shell/context";
import { useHomeResult } from "../data";
import type { CirclePerson } from "../data/contracts";
import { FailedPage, HomeColumns, HomePage, LoadingPage, PageTitle, Section, SubNav, useHomeView } from "../HomePage";
import { BlockedSheet } from "../circle/BlockedSheet";
import { FindPeopleSheet } from "../circle/FindPeopleSheet";
import { MessagesView } from "../circle/MessagesView";
import { PartiesView } from "../circle/PartiesView";
import { FriendRequestRow } from "../circle/AnswerRows";
import { PersonRow } from "../circle/PersonRow";
import { NotificationsSheet } from "../circle/NotificationsSheet";
import { conversationRequest, useConversationRequest } from "../../../shell/profile/store";

const AVATAR = 48;
const MAX_RING = 320;
/** The ring stays a ring. Everyone is in the list beside it. */
const RING_SEATS = 12;

function Ring({ people, size }: { people: CirclePerson[]; size: number }) {
  const { color } = useTheme();
  const radius = (size - AVATAR) / 2;
  const studying = people.filter((person) => person.presence === "focusing").length;
  const seated = people.slice(0, RING_SEATS);
  return (
    <View style={{ width: size, height: size, alignSelf: "center", alignItems: "center", justifyContent: "center" }}>
      <View pointerEvents="none" style={{ position: "absolute", top: AVATAR / 2, left: AVATAR / 2, right: AVATAR / 2, bottom: AVATAR / 2, borderRadius: radius, borderWidth: 1, borderColor: color.line }} />
      {seated.map((person, index) => {
        const angle = (index / seated.length) * Math.PI * 2 - Math.PI / 2;
        return <View key={person.id} style={{ position: "absolute", left: radius + radius * Math.cos(angle), top: radius + radius * Math.sin(angle), backgroundColor: color.ground }}><Avatar name={person.name} size={AVATAR} presence={person.presence} /></View>;
      })}
      <Stack gap="hair" align="center">
        <Text variant="readout" align="center">{String(studying)}</Text>
        <Text variant="caption" tone="soft" align="center">studying now</Text>
      </Stack>
    </View>
  );
}

export function CircleDestination() {
  const { space } = useTheme();
  const { width } = useWindowClass();
  const { insets } = useShellMetrics();
  const result = useHomeResult("circle");
  const view = useHomeView("circle");
  const [finding, setFinding] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [conversation, setConversation] = useState<number | null>(null);
  const requested = useConversationRequest();
  useEffect(() => { if (requested !== null) { setConversation(requested); conversationRequest.ask(null); } }, [requested]);
  const circle = result?.data;
  const ringSize = Math.min(MAX_RING, width - insets.left - insets.right - space.lg * 2);

  return (
    <HomePage destination="circle" eyebrow="Friends and study parties" live={result?.live} ready={result !== null}>
      <PageTitle title="Circle" />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        <Button title="Notifications" size="small" icon="bell" testID="circle-notifications" onPress={() => setNotifying(true)} />
        <Button title="Blocked" size="small" variant="ghost" testID="circle-blocked" onPress={() => setBlocked(true)} />
      </View>
      <SubNav destination="circle" label="Circle views" labels={{ people: "People", messages: "Messages", parties: "Parties" }} />
      {view === "messages" ? <MessagesView openId={conversation} onOpened={() => setConversation(null)} /> : view === "parties" ? <PartiesView /> : !result ? (
        <LoadingPage />
      ) : !circle ? (
        <FailedPage icon="circle" live={result.live} />
      ) : (
        <HomeColumns
          primary={
            <Stack gap="lg">
              {circle.people.length ? <Ring people={circle.people} size={ringSize} /> : <Text tone="soft" align="center">Find friends to study alongside them.</Text>}
              <Button title="Find people" icon="plus" variant="emphasis" testID="circle-find" style={{ alignSelf: "center" }} onPress={() => setFinding(true)} />
            </Stack>
          }
          secondary={[
            ...(circle.requests?.length ? [<Section key="requests" title="Friend requests"><Stack gap="md">{circle.requests.map((request) => <FriendRequestRow key={request.id} request={request} />)}</Stack></Section>] : []),
            ...(circle.people.length ? [<Section key="people" title="People"><Stack gap="xs">{circle.people.map((person) => <PersonRow key={person.id} person={person} />)}</Stack></Section>] : []),
          ]}
        />
      )}
      <FindPeopleSheet open={finding} onClose={() => setFinding(false)} />
      <NotificationsSheet open={notifying} onClose={() => setNotifying(false)} />
      <BlockedSheet open={blocked} onClose={() => setBlocked(false)} />
    </HomePage>
  );
}
