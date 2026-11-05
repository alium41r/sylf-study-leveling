// Messages: your conversations, and one conversation at a time. Text only, as the server's schema allows. The server decides who may message whom and
// who is blocked, and says so in words written for people. With Realtime off, which is a normal answer, a conversation that is on screen asks for
// newer messages every 30 seconds, only while it is seen, and stops the moment it is not. Nothing is sent optimistically that cannot be undone: a
// message appears once the server has it.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { Badge, Button, Callout, Dialog, EmptyState, ListRow, Stack, Text, TextField, useNotice, useTheme } from "@sylf/design-system";
import type { BackendError, ChatMessage, Conversation, ConversationSummary } from "@sylf/backend";
import { useAuth, useLiveBackend, useOptionalResource, useRealtimeLink, useRealtimeNudge } from "../../../shell/backend";
import { toLiveResult } from "../../../shell/live-result";
import { describeFailureText } from "../../../shell/account/failure";
import { useDestinationSeen } from "./useSeen";
import { NewGroupSheet } from "./NewGroupSheet";

const FALLBACK_MS = 30_000;
/** With Realtime live the poll is only a safety net, so it slows right down. */
const LIVE_FALLBACK_MS = 180_000;
const LIMIT = 2000;

export function MessagesView({ openId, onOpened }: { openId?: number | null; onOpened?: () => void }) {
  const { space } = useTheme();
  const backend = useLiveBackend();
  const seen = useDestinationSeen("circle");
  const link = useRealtimeLink();
  const [open, setOpen] = useState<number | null>(openId ?? null);
  const [grouping, setGrouping] = useState(false);
  useEffect(() => { if (openId) { setOpen(openId); onOpened?.(); } }, [openId, onOpened]);
  const resource = useMemo(() => (backend ? backend.resources.resource({ key: "circle-conversations", tags: ["circle", "messages"], ttlMs: 30_000, load: (signal) => backend.reads.social.conversations(signal) }) : null), [backend]);
  const list = toLiveResult(useOptionalResource(resource), resource);
  // The list refreshes at the same bounded pace, seen only.
  useEffect(() => {
    if (!seen || open !== null || !resource) return undefined;
    const timer = setInterval(() => resource.refresh(), link === "live" ? LIVE_FALLBACK_MS : FALLBACK_MS);
    return () => clearInterval(timer);
  }, [seen, open, resource, link]);

  if (!backend) return <EmptyState icon="circle" title="Messages live in your account" message="Sign in to talk with your friends." />;
  if (open !== null) return <ConversationView id={open} seen={seen} onBack={() => { setOpen(null); backend.resources.invalidate("messages"); }} />;
  if (!list) return <Text tone="soft">Loading your conversations.</Text>;
  if (list.live.failure && !list.data) return <Callout tone="caution" title={list.live.offline ? "You're offline" : "Messages didn't load"} message={list.live.failure} />;
  const conversations = list.data ?? [];
  const sheet = <NewGroupSheet open={grouping} onClose={() => setGrouping(false)} onCreated={(id) => { setGrouping(false); setOpen(id); }} />;
  if (!conversations.length) return <><EmptyState icon="circle" title="No conversations yet" message="Open a friend in People and choose Message to start one, or make a group." action={<Button title="New group" testID="messages-new-group" onPress={() => setGrouping(true)} />} />{sheet}</>;
  return (
    <Stack gap="xs" testID="circle-messages">
      <View style={{ flexDirection: "row" }}><Button title="New group" size="small" icon="plus" testID="messages-new-group" onPress={() => setGrouping(true)} /></View>
      {sheet}
      {list.live.offline ? <Badge label="Offline. Showing what you last saw." /> : null}
      <View style={{ gap: space.hair }}>{conversations.map((conversation) => <ConversationRow key={conversation.id} conversation={conversation} onPress={() => setOpen(conversation.id)} />)}</View>
    </Stack>
  );
}

function ConversationRow({ conversation, onPress }: { conversation: ConversationSummary; onPress: () => void }) {
  const last = conversation.lastMessage;
  return <View testID={`conversation-${conversation.id}`}><ListRow title={conversation.name ?? "Conversation"} detail={last ? `${last.senderName ? `${last.senderName}: ` : ""}${last.content}` : "No messages yet"} trailing={conversation.hasUnread ? <Badge label="New" /> : undefined} onPress={onPress} /></View>;
}

function ConversationView({ id, seen, onBack }: { id: number; seen: boolean; onBack: () => void }) {
  const link = useRealtimeLink();
  const { color, shape, space } = useTheme();
  const backend = useLiveBackend();
  const notice = useNotice();
  const me = useAuth().userId;
  const [conversation, setConversation] = useState<Conversation["conversation"] | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [removing, setRemoving] = useState<ChatMessage | null>(null);
  const alive = useRef(true);
  const newest = useRef(0);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const merge = useCallback((incoming: ChatMessage[]) => {
    setMessages((current) => {
      const byId = new Map(current.map((message) => [message.id, message]));
      for (const message of incoming) byId.set(message.id, message);
      const next = [...byId.values()].sort((a, b) => a.id - b.id);
      newest.current = next.length ? next[next.length - 1]!.id : 0;
      return next;
    });
  }, []);

  useEffect(() => {
    if (!backend) return undefined;
    const controller = new AbortController();
    backend.reads.social.conversation(id, null, controller.signal).then((value) => { if (!alive.current) return; setConversation(value.conversation); setHasMore(value.hasMore); merge(value.messages); setFailure(null); }, (error: BackendError) => { if (alive.current && error.kind !== "cancelled") setFailure(describeFailureText(error)); });
    return () => controller.abort();
  }, [backend, id, merge]);

  // The fallback: newer messages only, seen only. An edit or a delete by someone else shows on the next full open.
  const catchUp = useCallback(() => {
    if (!backend) return;
    backend.reads.social.newerThan(id, newest.current, new AbortController().signal).then((value) => { if (alive.current && value.messages.length) merge(value.messages); }, () => undefined);
  }, [backend, id, merge]);
  useEffect(() => {
    if (!backend || !seen || !conversation) return undefined;
    const timer = setInterval(catchUp, link === "live" ? LIVE_FALLBACK_MS : FALLBACK_MS);
    return () => clearInterval(timer);
  }, [backend, seen, conversation, catchUp, link]);
  // A push only says something moved. The read below is the same one the fallback makes, with the server's own checks.
  useRealtimeNudge("messages", () => { if (seen && conversation) catchUp(); });

  const older = async () => {
    if (!backend || !messages.length) return;
    try { const value = await backend.reads.social.conversation(id, messages[0]!.id, new AbortController().signal); setHasMore(value.hasMore); merge(value.messages); }
    catch (error) { notice(describeFailureText(error)); }
  };
  const submit = async () => {
    const content = text.trim();
    if (!backend || !content || busy) return;
    setBusy(true);
    try {
      if (editing) { await backend.reads.social.edit(id, editing.id, content); merge([{ ...editing, content, editedAt: new Date().toISOString() }]); setEditing(null); }
      else merge([await backend.reads.social.send(id, content)]);
      setText("");
    } catch (error) { notice(describeFailureText(error)); }
    setBusy(false);
  };
  const remove = async (message: ChatMessage) => {
    if (!backend) return;
    try { await backend.reads.social.remove(id, message.id); setMessages((current) => current.filter((item) => item.id !== message.id)); }
    catch (error) { notice(describeFailureText(error)); }
  };

  if (!conversation) return <Stack gap="md"><Button title="Messages" size="small" icon="chevronLeft" onPress={onBack} testID="conversation-back" />{failure ? <Callout tone="caution" title="This conversation didn't load" message={failure} /> : <Text tone="soft">Opening.</Text>}</Stack>;
  return (
    <Stack gap="md" testID="conversation">
      <Button title="Messages" size="small" icon="chevronLeft" onPress={onBack} testID="conversation-back" />
      <Text variant="subheading" role="heading" aria-level={2}>{conversation.name ?? conversation.participants.map((person) => person.name ?? person.username).join(", ")}</Text>
      {conversation.isGroup ? <GroupActions id={id} conversation={conversation} me={me} onLeft={onBack} /> : null}
      {hasMore ? <Button title="Earlier messages" size="small" onPress={() => void older()} /> : null}
      <Stack gap="sm">
        {messages.map((message) => (
          <View key={message.id} testID={`message-${message.id}`} style={{ padding: space.sm, borderRadius: shape.radius.sm, backgroundColor: color.sunken, gap: space.hair }}>
            <Text variant="caption" tone="soft">{message.sender?.name ?? message.sender?.username ?? "Someone"} · {new Date(message.createdAt).toLocaleString()}{message.editedAt ? " · edited" : ""}</Text>
            <Text variant="small">{message.content}</Text>
            {String(message.senderId ?? message.sender?.id) === String(me) ? <View style={{ flexDirection: "row", gap: space.xs }}>
              <Button title="Edit" size="small" variant="quiet" onPress={() => { setEditing(message); setText(message.content); }} />
              <Button title="Delete" size="small" variant="quiet" onPress={() => setRemoving(message)} />
            </View> : null}
          </View>
        ))}
        {!messages.length ? <Text variant="small" tone="soft">No messages yet. Say hello.</Text> : null}
      </Stack>
      {failure ? <Callout tone="caution" title="Couldn't refresh" message={failure} /> : null}
      <TextField label={editing ? "Edit message" : "Message"} value={text} onChangeText={(next) => setText(next.slice(0, LIMIT))} multiline testID="message-input" />
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <Button title={busy ? "Sending" : editing ? "Save" : "Send"} variant="emphasis" disabled={!text.trim() || busy} testID="message-send" onPress={() => void submit()} />
        {editing ? <Button title="Cancel" onPress={() => { setEditing(null); setText(""); }} /> : null}
      </View>
      <Dialog open={removing !== null} onClose={() => setRemoving(null)} title="Delete this message?" message="It is removed for everyone in the conversation." actions={[{ label: "Keep it", onPress: () => setRemoving(null) }, { label: "Delete", variant: "critical", onPress: () => { const target = removing; setRemoving(null); if (target) void remove(target); } }]} />
    </Stack>
  );
}

/** Only a group's creator may rename it. Anyone may leave. The server enforces both and answers in words for people. */
function GroupActions({ id, conversation, me, onLeft }: { id: number; conversation: Conversation["conversation"]; me: unknown; onLeft: () => void }) {
  const { space } = useTheme();
  const backend = useLiveBackend();
  const notice = useNotice();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(conversation.name ?? "");
  const [leaving, setLeaving] = useState(false);
  const creator = conversation.createdBy != null && String(conversation.createdBy) === String(me);
  const change = async (work: () => Promise<unknown>, done: string, after?: () => void) => {
    if (!backend) return;
    try { await work(); backend.resources.invalidate("messages"); notice(done); after?.(); } catch (error) { notice(describeFailureText(error)); }
  };
  return (
    <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
      {creator ? <Button title="Rename" size="small" onPress={() => setRenaming(!renaming)} /> : null}
      <Button title="Leave group" size="small" variant="critical" onPress={() => setLeaving(true)} />
      {renaming ? <View style={{ flexBasis: "100%", gap: space.xs }}><TextField label="Group name" value={name} onChangeText={setName} /><Button title="Save name" size="small" disabled={!name.trim()} onPress={() => void change(() => backend!.reads.social.changeGroup(id, { name: name.trim() }), "Renamed.", () => setRenaming(false))} /></View> : null}
      <Dialog open={leaving} onClose={() => setLeaving(false)} title="Leave this group?" message="You will stop receiving its messages." actions={[{ label: "Stay", onPress: () => setLeaving(false) }, { label: "Leave", variant: "critical", onPress: () => { setLeaving(false); void change(() => backend!.reads.social.changeGroup(id, { removeMemberIds: [Number(me)] }), "You left the group.", onLeft); } }]} />
    </View>
  );
}
