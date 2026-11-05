// A conversation with Sylvie. With an account she answers for real, as she types: `sendToSylvie` reads the same route the web uses, so quotas, tools,
// confirmations and every model choice stay on the server, and a proposal she makes is previewed here and applied only when the person confirms it. Without one it is a sample, the field
// is disabled, and it says why. The Assistant layout puts this window beside the main tool.
import { useEffect, useMemo, useRef, useState } from "react";
import { type ComponentRef } from "react";
import { ScrollView, View } from "react-native";
import { Button, IconButton, Select, Text, TextField, useTheme } from "@sylf/design-system";
import { useLiveBackend, useOptionalResource } from "../../../shell/backend";
import { describeFailureText } from "../../../shell/account/failure";
import { toLiveResult } from "../../../shell/live-result";
import type { Backend, ChatImage as ChatImageRecord, PickedFile } from "@sylf/backend";
import type { WorkspaceDataAdapter } from "../data/contracts";
import { useToolResult } from "../data";
import { RichText } from "../../../shell/rich-text/RichText";
import { ChatImage } from "../../../shell/sylvie/ChatImage";
import { pickImages } from "../../../shell/files/pick";
import { ToolEmpty, ToolLoading, ToolPage, type ToolProps } from "./shared";

const load = (adapter: WorkspaceDataAdapter) => adapter.sylvie();

function PersonBubble({ text, images }: { text: string; images?: ChatImageRecord[] }) {
  const { color, shape, space } = useTheme();
  return (
    <View style={{ alignSelf: "flex-end", maxWidth: "86%", gap: space.xs, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: shape.radius.md, backgroundColor: color.selected }}>
      {images?.length ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>{images.map((image) => <ChatImage key={image.index} path={image.url} name={image.name} size={96} />)}</View> : null}
      {text ? <Text variant="small">{text}</Text> : null}
    </View>
  );
}

function LiveSylvie({ backend, window, patch, onProvenance }: ToolProps & { backend: Backend }) {
  const { color, space } = useTheme();
  const threadsResource = useMemo(() => backend.resources.resource({ key: "sylvie-threads", tags: ["sylvie"], ttlMs: 60_000, load: (signal) => backend.reads.chats(signal) }), [backend]);
  const threads = toLiveResult(useOptionalResource(threadsResource), threadsResource);
  const chosen = typeof window.state.thread === "number" ? window.state.thread : null;
  const threadId = chosen ?? threads?.data?.sessions[0]?.id ?? null;
  const messagesResource = useMemo(() => (threadId === null ? null : backend.resources.resource({ key: `sylvie-thread-${threadId}`, tags: ["sylvie"], ttlMs: 60_000, load: async (signal) => (await backend.reads.chatMessages(threadId, signal)).messages.filter((message) => message.type === "USER" || message.type === "INFO").reverse() })), [backend, threadId]);
  const messages = useOptionalResource(messagesResource)?.data ?? [];
  const [text, setText] = useState("");
  const [attached, setAttached] = useState<PickedFile[]>([]);
  const [turn, setTurn] = useState<{ asked: string; reply: string } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [proposal, setProposal] = useState<{ chatId: number; token: string; summary: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const flight = useRef<AbortController | null>(null);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  useEffect(() => { onProvenance(false); }, [onProvenance]);
  useEffect(() => () => flight.current?.abort(), []);

  const send = async () => {
    const asked = text.trim();
    const sending = attached;
    if ((!asked && !sending.length) || turn) return;
    const controller = new AbortController();
    flight.current = controller;
    setText(""); setAttached([]); setFailure(null); setStatus(null); setProposal(null); setTurn({ asked, reply: "" });
    try {
      const { chatId, pendingAction } = await backend.reads.sendToSylvie(asked, threadId, {
        onStatus: setStatus,
        onDelta: (reply) => setTurn({ asked, reply }),
        onReset: () => setTurn({ asked, reply: "" }),
        onSession: (id) => { if (id !== threadId) patch({ thread: id }); },
      }, controller.signal, sending);
      if (chatId !== null) patch({ thread: chatId });
      if (pendingAction && chatId !== null) setProposal({ chatId, token: pendingAction.token, summary: pendingAction.summary });
      backend.resources.invalidate("sylvie");
    } catch (error) {
      if ((error as { kind?: string }).kind !== "cancelled") { setFailure(describeFailureText(error)); setText(asked); setAttached(sending); }
    }
    setTurn(null); setStatus(null);
    flight.current = null;
  };
  // A proposal is only ever what the server signed. It is confirmed once and on purpose, and a newer message makes the server refuse it.
  const last = messages[messages.length - 1];
  const found = proposal ?? (last && last.type !== "USER" && last.pendingAction && threadId !== null ? { chatId: threadId, token: last.pendingAction.token, summary: last.pendingAction.summary }  : null);
  const offered = found && found.token !== dismissed ? found : null;
  const confirm = async () => {
    if (!offered || confirming) return;
    setConfirming(true); setFailure(null);
    try {
      await backend.reads.confirmSylvieAction(offered.chatId, offered.token);
      for (const tag of ["sylvie", "plan", "today", "progress"]) backend.resources.invalidate(tag);
    } catch (error) { setFailure(describeFailureText(error)); }
    setProposal(null); setDismissed(offered.token); setConfirming(false);
  };
  const limits = backend.reads.sylvieImages;
  const attach = async () => {
    const room = limits.limit - attached.length;
    if (room <= 0 || turn) return;
    const picked = await pickImages(room).catch(() => []);
    const tooBig = picked.filter((file) => file.size !== undefined && file.size > limits.bytes);
    if (tooBig.length) setFailure(`Each image must be ${Math.round(limits.bytes / 1024 / 1024)} MB or less.`);
    setAttached((old) => [...old, ...picked.filter((file) => !tooBig.includes(file))].slice(0, limits.limit));
  };
  const list = threads?.data?.sessions ?? [];
  if (!threads) return <ToolLoading />;
  return (
    <View style={{ flex: 1 }}>
      {list.length > 1 ? <View style={{ paddingHorizontal: space.md, paddingTop: space.sm, flexDirection: "row", gap: space.sm, alignItems: "center" }}><View style={{ flex: 1, minWidth: 0 }}><Select label="Conversation" hideLabel value={String(threadId)} options={list.map((item) => ({ value: String(item.id), label: item.title }))} onChange={(value) => patch({ thread: Number(value) })} /></View><Button title="New" size="small" variant="ghost" onPress={() => patch({ thread: null })} /></View> : null}
      <ToolPage ref={scroller} onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}>
        {!messages.length && !turn ? <Text variant="small" tone="soft" testID="sylvie-empty">Ask Sylvie about your plan, your progress or what you're studying.</Text> : null}
        {messages.map((message) => (message.type === "USER" ? <PersonBubble key={message.id} text={message.content} images={message.attachments} /> : <RichText key={message.id} text={message.content} testID="sylvie-reply" />))}
        {turn ? <PersonBubble text={turn.asked} /> : null}
        {turn ? (turn.reply ? <RichText text={turn.reply} testID="sylvie-streaming" /> : <Text variant="small" tone="soft" testID="sylvie-streaming">{status ?? "Thinking"}</Text>) : null}
        {offered && !turn ? <View testID="sylvie-proposal" style={{ gap: space.sm, padding: space.md, borderRadius: 12, borderWidth: 1, borderColor: color.line }}><Text variant="small" tone="soft">Sylvie suggests</Text><Text variant="small">{offered.summary}</Text><View style={{ flexDirection: "row", gap: space.sm }}><Button title={confirming ? "Applying" : "Apply"} size="small" variant="emphasis" disabled={confirming} testID="sylvie-confirm" onPress={() => void confirm()} /><Button title="Not now" size="small" disabled={confirming} testID="sylvie-dismiss" onPress={() => { setProposal(null); setDismissed(offered.token); }} /></View></View> : null}
      </ToolPage>
      <View style={{ paddingHorizontal: space.md, paddingBottom: space.sm, gap: space.xs }}>
        {failure ? <View testID="sylvie-failure"><Text variant="caption" tone="critical">{failure}</Text></View> : null}
        {attached.length ? (
          <View testID="sylvie-attachments" style={{ gap: space.xs }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
              {attached.map((file, index) => <Button key={`${file.uri}-${index}`} title={file.name.length > 18 ? `${file.name.slice(0, 15)}...` : file.name} size="small" variant="ghost" icon="close" accessibilityLabel={`Remove ${file.name}`} onPress={() => setAttached((old) => old.filter((_, at) => at !== index))} />)}
            </View>
            <Text variant="caption" tone="soft">Sylvie sends attached images to an AI model to read them. Up to {limits.limit}, {Math.round(limits.bytes / 1024 / 1024)} MB each.</Text>
          </View>
        ) : null}
        <TextField label="Ask Sylvie" hideLabel placeholder="Ask Sylvie" value={text} onChangeText={setText} testID="sylvie-input" returnKeyType="send" editable={!turn} onSubmitEditing={() => void send()} trailing={<View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}><IconButton icon="plus" label="Attach an image" bare disabled={turn !== null || attached.length >= limits.limit} testID="sylvie-attach" onPress={() => void attach()} /><Button title="Send" size="small" variant="ghost" disabled={(!text.trim() && !attached.length) || turn !== null} testID="sylvie-send" onPress={() => void send()} /></View>} />
      </View>
    </View>
  );
}

export default function SylvieTool(props: ToolProps) {
  const backend = useLiveBackend();
  return backend ? <LiveSylvie {...props} backend={backend} /> : <SampleSylvie {...props} />;
}

function SampleSylvie({ onProvenance }: ToolProps) {
  const { color, shape, space } = useTheme();
  const result = useToolResult("sylvie", load);
  useEffect(() => { if (result) onProvenance(result.provenance === "sample"); }, [result, onProvenance]);
  if (!result) return <ToolLoading />;
  const thread = result.data?.[0];
  if (!thread) return <ToolEmpty icon="sylvie" title="No conversations yet" message="Conversations with Sylvie will appear here." />;
  return (
    <View style={{ flex: 1 }}>
      <ToolPage>
        {thread.messages.map((message) => (
          message.from === "person"
            ? <View key={message.id} style={{ alignSelf: "flex-end", maxWidth: "86%", paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: shape.radius.md, backgroundColor: color.selected }}><Text variant="small">{message.text}</Text></View>
            : <Text key={message.id} variant="small">{message.text}</Text>
        ))}
      </ToolPage>
      <View style={{ paddingHorizontal: space.md, paddingBottom: space.sm }}>
        <TextField label="Ask Sylvie" hideLabel placeholder="Ask Sylvie" editable={false} helper="Sylvie connects when the backend does." />
      </View>
    </View>
  );
}
