// Messages: your conversations, and one conversation at a time. Text only, as the server's schema allows. The server decides who may message whom and
// who is blocked, and says so in words written for people. With Realtime off, which is a normal answer, a conversation that is on screen asks for
// newer messages every 30 seconds, only while it is seen, and stops the moment it is not. Nothing is sent optimistically that cannot be undone: a
// message appears once the server has it.
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { ScrollView, View } from "react-native";
import { Avatar, Badge, Button, Callout, Dialog, EmptyState, IconButton, Press, Stack, Text, TextField, useNotice, useTheme } from "@sylf/design-system";
import { openProfile } from "../../../shell/profile/store";
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
  const { space } = useTheme();
  const last = conversation.lastMessage;
  const name = conversation.name ?? "Conversation";
  const when = last?.createdAt ? new Date(last.createdAt) : null;
  const clock = when ? (new Date().toDateString() === when.toDateString() ? when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : when.toLocaleDateString([], { day: "numeric", month: "short" })) : "";
  return (
    <Press role="button" label={`${name}. ${last ? `${last.senderName ? `${last.senderName}: ` : ""}${last.content}` : "No messages yet"}${conversation.hasUnread ? ". Unread" : ""}`} onPress={onPress} testID={`conversation-${conversation.id}`} bodyStyle={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.sm }}>
      <Avatar name={name} size={40} />
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text variant="small" numberOfLines={1} style={conversation.hasUnread ? { fontWeight: "700" } : undefined}>{name}</Text>
        <Text variant="caption" tone="soft" numberOfLines={1}>{last ? `${last.senderName ? `${last.senderName}: ` : ""}${last.content}` : "No messages yet"}</Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        {clock ? <Text variant="caption" tone="soft">{clock}</Text> : null}
        {conversation.hasUnread ? <Badge label="New" tone="accent" /> : null}
      </View>
    </Press>
  );
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
  const [selected, setSelected] = useState<number | null>(null);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
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
  const others = conversation.participants.filter((person) => String(person.id) !== String(me));
  const title = conversation.name ?? (others.length ? others.map((person) => person.name ?? person.username).join(", ") : "Just you");
  const direct = !conversation.isGroup && others.length === 1 ? others[0]! : null;
  const dayOf = (iso: string) => new Date(iso).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
  return (
    <Stack gap="md" testID="conversation">
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <IconButton icon="chevronLeft" label="Back to messages" onPress={onBack} testID="conversation-back" />
        <Press role={direct ? "button" : undefined} label={direct ? `${title}. Open profile` : title} onPress={direct ? () => openProfile(direct.username) : undefined} disabled={!direct} style={{ flex: 1, minWidth: 0 }} bodyStyle={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <Avatar name={title} size={36} />
          <Text variant="subheading" numberOfLines={1} role="heading" aria-level={2} style={{ flex: 1 }}>{title}</Text>
        </Press>
      </View>
      {conversation.isGroup ? <GroupActions id={id} conversation={conversation} me={me} onLeft={onBack} /> : null}
      <ScrollView ref={scroller} keyboardShouldPersistTaps="handled" onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })} style={{ maxHeight: 420 }} contentContainerStyle={{ gap: space.xs, paddingVertical: space.xs }} testID="conversation-messages">
        {hasMore ? <View style={{ alignSelf: "center" }}><Button title="Earlier messages" size="small" variant="ghost" onPress={() => void older()} /></View> : null}
        {messages.map((message, index) => {
          const mine = String(message.senderId ?? message.sender?.id) === String(me);
          const newDay = index === 0 || dayOf(messages[index - 1]!.createdAt) !== dayOf(message.createdAt);
          const sender = message.sender?.name ?? message.sender?.username ?? "Someone";
          return (
            <View key={message.id} style={{ gap: space.xs }}>
              {newDay ? <Text variant="caption" tone="soft" align="center" style={{ paddingVertical: space.xs }}>{dayOf(message.createdAt)}</Text> : null}
              <View testID={`message-${message.id}`} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "80%", gap: 2 }}>
                {!mine && conversation.isGroup ? <Text variant="caption" tone="soft">{sender}</Text> : null}
                <Press role={mine ? "button" : undefined} label={`${mine ? "You" : sender}: ${message.content}. ${new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`} onPress={mine ? () => setSelected(selected === message.id ? null : message.id) : undefined} disabled={!mine} radius={shape.radius.md} bodyStyle={{ paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: shape.radius.md, backgroundColor: mine ? color.accent.wash : color.selected }}>
                  <Text variant="small">{message.content}</Text>
                </Press>
                <Text variant="caption" tone="soft" style={{ alignSelf: mine ? "flex-end" : "flex-start" }}>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}{message.editedAt ? ", edited" : ""}</Text>
                {mine && selected === message.id ? (
                  <View style={{ flexDirection: "row", gap: space.xs, alignSelf: "flex-end" }}>
                    <Button title="Edit" size="small" variant="ghost" onPress={() => { setEditing(message); setText(message.content); setSelected(null); }} />
                    <Button title="Delete" size="small" variant="ghost" onPress={() => { setRemoving(message); setSelected(null); }} />
                  </View>
                ) : null}
              </View>
            </View>
          );
        })}
        {!messages.length ? <Text variant="small" tone="soft" align="center">No messages yet. Say hello.</Text> : null}
      </ScrollView>
      {failure ? <Callout tone="caution" title="Couldn't refresh" message={failure} /> : null}
      {editing ? <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}><Text variant="caption" tone="soft" style={{ flex: 1 }} numberOfLines={1}>{`Editing: ${editing.content}`}</Text><Button title="Cancel" size="small" variant="ghost" onPress={() => { setEditing(null); setText(""); }} /></View> : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <View style={{ flex: 1 }}><TextField label={editing ? "Edit message" : "Message"} hideLabel placeholder={editing ? "Edit message" : "Write a message"} value={text} onChangeText={(next) => setText(next.slice(0, LIMIT))} returnKeyType="send" onSubmitEditing={() => void submit()} testID="message-input" /></View>
        <Button title={busy ? "Sending" : editing ? "Save" : "Send"} variant="emphasis" disabled={!text.trim() || busy} testID="message-send" onPress={() => void submit()} />
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
