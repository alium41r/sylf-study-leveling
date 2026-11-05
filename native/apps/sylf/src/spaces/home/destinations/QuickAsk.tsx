// Quick-ask: Sylvie from Home, in a sheet. The same conversation machinery as Workspace's tool, not a mini-app. It never opens by itself, it holds no
// history of its own beyond this sheet, and a change she proposes is applied only when you press Apply.
import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { Button, ListRow, Sheet, Stack, Text, TextField, useTheme } from "@sylf/design-system";
import { RichText } from "../../../shell/rich-text/RichText";
import { useLiveBackend, useOptionalResource } from "../../../shell/backend";
import { useSylvieTurn } from "../../../shell/sylvie/useSylvieTurn";
import { useHomeNavigation } from "../../../shell/context";
import { setPlanPrefill } from "../plan/prefill";

export function QuickAsk({ open, onClose, onLeave }: { open: boolean; onClose: () => void; /** Called when an answer sends the person to another page, so a layer above the Spaces (the Focus environment) can step aside. The session keeps going. */ onLeave?: () => void }) {
  const { color, shape, space } = useTheme();
  const backend = useLiveBackend();
  const turn = useSylvieTurn(backend);
  const navigation = useHomeNavigation();
  const [text, setText] = useState("");
  const threadsResource = useMemo(() => (backend && open ? backend.resources.resource({ key: "sylvie-threads", tags: ["sylvie"], ttlMs: 60_000, load: (signal) => backend.reads.chats(signal) }) : null), [backend, open]);
  const threads = useOptionalResource(threadsResource)?.data?.sessions ?? [];
  const historyResource = useMemo(() => (backend && open && turn.chatId !== null ? backend.resources.resource({ key: `sylvie-thread-${turn.chatId}`, tags: ["sylvie"], ttlMs: 60_000, load: async (signal) => (await backend.reads.chatMessages(turn.chatId!, signal)).messages.filter((message) => message.type === "USER" || message.type === "INFO").reverse() }) : null), [backend, open, turn.chatId]);
  const history = (useOptionalResource(historyResource)?.data ?? []).slice(-6);
  const fresh = turn.chatId === null && !turn.asked;
  // Once the server's own record of the turn has been read back, it is in the history above, so the live copy steps aside rather than showing twice.
  const recorded = !turn.working && Boolean(turn.asked) && history.some((message) => message.type === "USER" && message.content.trim() === turn.asked);
  const submit = async () => { const message = text; setText(""); if (!(await turn.send(message))) setText(message); };
  return (
    <Sheet open={open} onClose={() => { turn.reset(); onClose(); }} title="Ask Sylvie">
      <View style={{ padding: space.lg }}>
        <Stack gap="md" testID="quick-ask">
          {fresh ? <Text variant="small" tone="soft">Ask about today, your plan or what to study next.</Text> : null}
          {fresh && threads.length ? (
            <Stack gap="xs" testID="quick-ask-threads">
              <Text variant="caption" tone="soft">Pick up where you left off</Text>
              {threads.slice(0, 4).map((thread) => <View key={thread.id} testID={`quick-ask-thread-${thread.id}`}><ListRow title={thread.title || "Conversation"} onPress={() => turn.adopt(thread.id)} /></View>)}
            </Stack>
          ) : null}
          {history.length || (turn.asked && !recorded) || (turn.text && !recorded) ? (
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 340 }} contentContainerStyle={{ gap: space.md }} testID="quick-ask-conversation">
              {history.map((message, index) => message.type === "USER"
                ? <View key={message.id} style={{ alignSelf: "flex-end", maxWidth: "88%", paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: shape.radius.md, backgroundColor: color.selected }}><Text variant="small">{message.content}</Text></View>
                : <RichText key={message.id} text={message.content} {...(index === history.length - 1 ? { testID: "quick-ask-reply" } : {})} />)}
              {turn.asked && !recorded ? <View style={{ alignSelf: "flex-end", maxWidth: "88%", paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: shape.radius.md, backgroundColor: color.selected }}><Text variant="small">{turn.asked}</Text></View> : null}
              {turn.working && !turn.text ? <Text variant="small" tone="soft" testID="quick-ask-status">{turn.status ?? "Thinking"}</Text> : null}
              {turn.text && !recorded ? <RichText text={turn.text} testID="quick-ask-reply" /> : null}
            </ScrollView>
          ) : null}
          {turn.proposal ? (
            <View testID="quick-ask-proposal" style={{ gap: space.sm, padding: space.md, borderRadius: shape.radius.md, borderWidth: 1, borderColor: color.line }}>
              <Text variant="small" tone="soft">Sylvie suggests</Text>
              <Text variant="small">{turn.proposal.summary}</Text>
              <View style={{ flexDirection: "row", gap: space.sm }}>
                <Button title="Apply" size="small" variant="emphasis" disabled={turn.working} testID="quick-ask-apply" onPress={() => void turn.confirm()} />
                <Button title="Not now" size="small" disabled={turn.working} onPress={turn.dismiss} />
              </View>
            </View>
          ) : null}
          {turn.planRequest && !turn.working ? <Button title="Review in Plans" testID="quick-ask-plan" onPress={() => { setPlanPrefill(turn.planRequest!); turn.reset(); onClose(); onLeave?.(); navigation.setView("plan", "plans"); navigation.select("plan"); }} /> : null}
          {turn.failure ? <Text variant="caption" tone="critical" testID="quick-ask-failure">{turn.failure}</Text> : null}
          <TextField label="Ask Sylvie" hideLabel placeholder="Ask Sylvie" testID="quick-ask-input" value={text} onChangeText={setText} editable={!turn.working} returnKeyType="send" onSubmitEditing={() => void submit()} />
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Button title={turn.working ? "Sylvie is answering" : "Send"} variant="emphasis" disabled={!text.trim() || turn.working} testID="quick-ask-send" onPress={() => void submit()} />
            {turn.chatId !== null && !turn.working ? <Button title="New conversation" variant="ghost" testID="quick-ask-new" onPress={() => turn.adopt(null)} /> : null}
          </View>
        </Stack>
      </View>
    </Sheet>
  );
}
