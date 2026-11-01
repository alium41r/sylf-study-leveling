// A conversation with Sylvie. With an account she answers for real, as she types: `sendToSylvie` reads the same route the web uses, so quotas, tools,
// confirmations and every model choice stay on the server, and a proposal she makes is confirmed on the web. Without one it is a sample, the field
// is disabled, and it says why. The Assistant layout puts this window beside the main tool.
import { useEffect, useMemo, useRef, useState } from "react";
import { type ComponentRef } from "react";
import { ScrollView, View } from "react-native";
import { Button, Select, Text, TextField, useTheme } from "@sylf/design-system";
import { useLiveBackend, useOptionalResource } from "../../../shell/backend";
import { describeFailureText } from "../../../shell/account/failure";
import { toLiveResult } from "../../../shell/live-result";
import type { Backend } from "@sylf/backend";
import type { WorkspaceDataAdapter } from "../data/contracts";
import { useToolResult } from "../data";
import { ToolEmpty, ToolLoading, ToolPage, type ToolProps } from "./shared";

const load = (adapter: WorkspaceDataAdapter) => adapter.sylvie();

/** Sylvie writes Markdown, and this window draws plain text for now, so the marks go rather than showing as stray asterisks. */
const plain = (text: string) => text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/^#{1,6}\s+/gm, "").replace(/^\s*[-*]\s+/gm, "• ").replace(/`([^`]+)`/g, "$1");

function PersonBubble({ text }: { text: string }) {
  const { color, shape, space } = useTheme();
  return <View style={{ alignSelf: "flex-end", maxWidth: "86%", paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: shape.radius.md, backgroundColor: color.selected }}><Text variant="small">{text}</Text></View>;
}

function LiveSylvie({ backend, window, patch, onProvenance }: ToolProps & { backend: Backend }) {
  const { space } = useTheme();
  const threadsResource = useMemo(() => backend.resources.resource({ key: "sylvie-threads", tags: ["sylvie"], ttlMs: 60_000, load: (signal) => backend.reads.chats(signal) }), [backend]);
  const threads = toLiveResult(useOptionalResource(threadsResource), threadsResource);
  const chosen = typeof window.state.thread === "number" ? window.state.thread : null;
  const threadId = chosen ?? threads?.data?.sessions[0]?.id ?? null;
  const messagesResource = useMemo(() => (threadId === null ? null : backend.resources.resource({ key: `sylvie-thread-${threadId}`, tags: ["sylvie"], ttlMs: 60_000, load: async (signal) => (await backend.reads.chatMessages(threadId, signal)).messages.filter((message) => message.type === "USER" || message.type === "INFO").reverse() })), [backend, threadId]);
  const messages = useOptionalResource(messagesResource)?.data ?? [];
  const [text, setText] = useState("");
  const [turn, setTurn] = useState<{ asked: string; reply: string } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const flight = useRef<AbortController | null>(null);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  useEffect(() => { onProvenance(false); }, [onProvenance]);
  useEffect(() => () => flight.current?.abort(), []);

  const send = async () => {
    const asked = text.trim();
    if (!asked || turn) return;
    const controller = new AbortController();
    flight.current = controller;
    setText(""); setFailure(null); setTurn({ asked, reply: "" });
    try {
      const { chatId } = await backend.reads.sendToSylvie(asked, threadId, {
        onDelta: (reply) => setTurn({ asked, reply }),
        onReset: () => setTurn({ asked, reply: "" }),
        onSession: (id) => { if (id !== threadId) patch({ thread: id }); },
      }, controller.signal);
      if (chatId !== null) patch({ thread: chatId });
      backend.resources.invalidate("sylvie");
    } catch (error) {
      if ((error as { kind?: string }).kind !== "cancelled") { setFailure(describeFailureText(error)); setText(asked); }
    }
    setTurn(null);
    flight.current = null;
  };
  const list = threads?.data?.sessions ?? [];
  if (!threads) return <ToolLoading />;
  return (
    <View style={{ flex: 1 }}>
      {list.length > 1 ? <View style={{ paddingHorizontal: space.md, paddingTop: space.sm, flexDirection: "row", gap: space.sm, alignItems: "center" }}><View style={{ flex: 1, minWidth: 0 }}><Select label="Conversation" hideLabel value={String(threadId)} options={list.map((item) => ({ value: String(item.id), label: item.title }))} onChange={(value) => patch({ thread: Number(value) })} /></View><Button title="New" size="small" variant="ghost" onPress={() => patch({ thread: null })} /></View> : null}
      <ToolPage ref={scroller} onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}>
        {!messages.length && !turn ? <Text variant="small" tone="soft" testID="sylvie-empty">Ask Sylvie about your plan, your progress or what you're studying.</Text> : null}
        {messages.map((message) => (message.type === "USER" ? <PersonBubble key={message.id} text={message.content} /> : <Text key={message.id} variant="small" testID="sylvie-reply">{plain(message.content)}</Text>))}
        {turn ? <PersonBubble text={turn.asked} /> : null}
        {turn ? <Text variant="small" tone={turn.reply ? "ink" : "soft"} testID="sylvie-streaming">{plain(turn.reply) || "Thinking"}</Text> : null}
      </ToolPage>
      <View style={{ paddingHorizontal: space.md, paddingBottom: space.sm, gap: space.xs }}>
        {failure ? <View testID="sylvie-failure"><Text variant="caption" tone="critical">{failure}</Text></View> : null}
        <TextField label="Ask Sylvie" hideLabel placeholder="Ask Sylvie" value={text} onChangeText={setText} testID="sylvie-input" returnKeyType="send" editable={!turn} onSubmitEditing={() => void send()} trailing={<Button title="Send" size="small" variant="ghost" disabled={!text.trim() || turn !== null} testID="sylvie-send" onPress={() => void send()} />} />
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
