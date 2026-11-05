// Quick-ask: Sylvie from Home, in a sheet. The same conversation machinery as Workspace's tool, not a mini-app. It never opens by itself, it holds no
// history of its own beyond this sheet, and a change she proposes is applied only when you press Apply.
import { useState } from "react";
import { View } from "react-native";
import { Button, Sheet, Stack, Text, TextField, useTheme } from "@sylf/design-system";
import { RichText } from "../../../shell/rich-text/RichText";
import { useLiveBackend } from "../../../shell/backend";
import { useSylvieTurn } from "../../../shell/sylvie/useSylvieTurn";
import { useHomeNavigation } from "../../../shell/context";
import { setPlanPrefill } from "../plan/prefill";

export function QuickAsk({ open, onClose, onLeave }: { open: boolean; onClose: () => void; /** Called when an answer sends the person to another page, so a layer above the Spaces (the Focus environment) can step aside. The session keeps going. */ onLeave?: () => void }) {
  const { color, shape, space } = useTheme();
  const backend = useLiveBackend();
  const turn = useSylvieTurn(backend);
  const navigation = useHomeNavigation();
  const [text, setText] = useState("");
  const submit = async () => { const message = text; setText(""); if (!(await turn.send(message))) setText(message); };
  return (
    <Sheet open={open} onClose={() => { turn.reset(); onClose(); }} title="Ask Sylvie">
      <View style={{ padding: space.lg }}>
        <Stack gap="md" testID="quick-ask">
          {turn.asked ? <Text variant="small" tone="soft">{turn.asked}</Text> : <Text variant="small" tone="soft">Ask about today, your plan or what to study next.</Text>}
          {turn.working && !turn.text ? <Text variant="small" tone="soft" testID="quick-ask-status">{turn.status ?? "Thinking"}</Text> : null}
          {turn.text ? <RichText text={turn.text} testID="quick-ask-reply" /> : null}
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
          <TextField label="Ask Sylvie" hideLabel placeholder="Ask Sylvie" testID="quick-ask-input" value={text} onChangeText={setText} editable={!turn.working} returnKeyType="send" onSubmitEditing={() => void submit()} testID="quick-ask-input" />
          <Button title={turn.working ? "Sylvie is answering" : "Send"} variant="emphasis" disabled={!text.trim() || turn.working} testID="quick-ask-send" onPress={() => void submit()} />
        </Stack>
      </View>
    </Sheet>
  );
}
