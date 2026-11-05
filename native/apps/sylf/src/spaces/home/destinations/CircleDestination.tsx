// Circle draws its name: the people you study with sit around one quiet ring, and the middle says how many are studying now. It shows only what the
// server gives. A friend's hidden level or hours say "hidden", never zero, and there is no schedule or activity feed, because no such thing exists.
// People, Messages and Parties are views of this page: friend requests, finding people, groups, and studying together all work here.
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { Avatar, Button, Stack, Text, useNotice, useTheme, useWindowClass } from "@sylf/design-system";
import { useLiveBackend } from "../../../shell/backend";
import { describeFailureText } from "../../../shell/account/failure";
import { useShellMetrics } from "../../../shell/context";
import { useHomeResult } from "../data";
import type { CirclePerson, HomeDataAdapter } from "../data/contracts";
import { EmptyPage, FailedPage, HomeColumns, HomePage, LoadingPage, PageTitle, Section, SubNav, useHomeView } from "../HomePage";
import { BlockedSheet } from "../circle/BlockedSheet";
import { FindPeopleSheet } from "../circle/FindPeopleSheet";
import { MessagesView } from "../circle/MessagesView";
import { PartiesView } from "../circle/PartiesView";
import { NotificationsSheet } from "../circle/NotificationsSheet";
import { openProfile, conversationRequest, useConversationRequest } from "../../../shell/profile/store";

const load = (adapter: HomeDataAdapter) => adapter.circle();
const AVATAR = 48;
const MAX_RING = 320;
/** The ring stays a ring. Everyone is in the list beside it. */
const RING_SEATS = 12;

function FriendRequest({ request }: { request: { id: number; name: string } }) {
  const { space } = useTheme();
  const backend = useLiveBackend();
  const notice = useNotice();
  const [busy, setBusy] = useState(false);
  const answer = async (accept: boolean) => {
    if (!backend) return;
    setBusy(true);
    try { await backend.reads.acceptFriend(request.id, accept); }
    catch (error) { notice(describeFailureText(error)); }
    setBusy(false);
    backend.resources.invalidate("circle");
  };
  return (
    <View style={{ gap: space.xs }}>
      <Text variant="small">{request.name}</Text>
      <View style={{ flexDirection: "row", gap: space.xs }}>
        <Button title="Accept" size="small" disabled={busy} testID={`circle-accept-${request.id}`} onPress={() => void answer(true)} />
        <Button title="Not now" size="small" variant="ghost" disabled={busy} onPress={() => void answer(false)} />
      </View>
    </View>
  );
}

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
  const result = useHomeResult("circle", load);
  const view = useHomeView("circle");
  const [finding, setFinding] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [conversation, setConversation] = useState<number | null>(null);
  const requested = useConversationRequest();
  useEffect(() => { if (requested !== null) { setConversation(requested); conversationRequest.ask(null); } }, [requested]);
  const circle = result?.data;
  const live = result?.provenance === "live" && Boolean(result.live);
  const lonely = !live && circle !== undefined && circle !== null && !circle.people.length && !circle.parties.length && !circle.invites?.length && !circle.requests?.length;
  const ringSize = Math.min(MAX_RING, width - insets.left - insets.right - space.lg * 2);

  return (
    <HomePage destination="circle" eyebrow="Friends and study parties" provenance={result?.provenance} live={result?.live} ready={result !== null}>
      {!result ? <LoadingPage title="Circle" /> : !circle && result.live?.failure ? <FailedPage title="Circle" icon="circle" live={result.live} /> : !circle || lonely ? <EmptyPage title="Circle" icon="circle" heading="Your circle is empty" message={live ? "Friends you add on Sylf for the web appear here, with who is studying right now." : "Friends and study parties will appear here."} /> : (
        <>
          <PageTitle title="Circle" />
          {live ? <View style={{ flexDirection: "row", gap: space.sm }}><Button title="Notifications" size="small" icon="bell" testID="circle-notifications" onPress={() => setNotifying(true)} /><Button title="Blocked" size="small" variant="ghost" testID="circle-blocked" onPress={() => setBlocked(true)} /></View> : null}
          {live ? <SubNav destination="circle" label="Circle views" labels={{ people: "People", messages: "Messages", parties: "Parties" }} /> : null}
          {live && view === "messages" ? <MessagesView openId={conversation} onOpened={() => setConversation(null)} /> : live && view === "parties" ? <PartiesView /> : <HomeColumns
            primary={
              <Stack gap="xl">
                {circle.people.length && view !== "parties" ? <Ring people={circle.people} size={ringSize} /> : null}
                {live ? <Button title="Find people" icon="plus" variant="emphasis" testID="circle-find" style={{ alignSelf: "center" }} onPress={() => setFinding(true)} /> : (
                  <Stack gap="sm" align="center">
                    <Button title="Invite a friend" icon="plus" disabled testID="circle-invite" style={{ alignSelf: "center" }} />
                    <Text variant="caption" tone="soft" align="center">Social features arrive in a later phase. Everyone shown here is invented.</Text>
                  </Stack>
                )}
              </Stack>
            }
            secondary={[
              ...(view === "people" && circle.requests?.length ? [<Section key="requests" title="Friend requests"><Stack gap="md">{circle.requests.map((request) => <FriendRequest key={request.id} request={request} />)}</Stack></Section>] : []),
              ...(view === "people" && circle.people.length ? [<Section key="people" title="People">
                <Stack gap="md">
                  {circle.people.map((person) => (
                    <Pressable key={person.id} accessibilityRole={live ? "button" : undefined} accessibilityLabel={`${person.name}. ${person.status}`} testID="circle-person" disabled={!live} onPress={() => (person.username ? openProfile(person.username) : undefined)}>
                      <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.md }}>
                        <Text variant="small" numberOfLines={1} style={{ flex: 1 }}>{person.name}</Text>
                        <Text variant="caption" tone="soft" numberOfLines={1}>{person.status}</Text>
                      </View>
                      {person.detail ? <Text variant="caption" tone="soft" numberOfLines={1}>{person.detail}</Text> : null}
                    </Pressable>
                  ))}
                </Stack>
              </Section>] : []),
              ...(view === "parties" && (circle.parties.length || circle.invites?.length) ? [<Section key="parties" title="Study parties">
                <Stack gap="md">
                  {circle.parties.map((party) => (
                    <View key={party.id} accessible>
                      <Text variant="small">{party.name}</Text>
                      <Text variant="caption" tone="soft">{party.members} members{party.inSession ? ", session running" : ""}</Text>
                    </View>
                  ))}
                  {circle.invites?.map((invite) => (
                    <View key={invite.id} accessible>
                      <Text variant="small">{invite.name}</Text>
                      <Text variant="caption" tone="soft">{`Invited by ${invite.from}`}</Text>
                    </View>
                  ))}
                </Stack>
              </Section>] : []),
            ]}
          />}
          <FindPeopleSheet open={finding} onClose={() => setFinding(false)} />
          <NotificationsSheet open={notifying} onClose={() => setNotifying(false)} />
          <BlockedSheet open={blocked} onClose={() => setBlocked(false)} />
        </>
      )}
    </HomePage>
  );
}
