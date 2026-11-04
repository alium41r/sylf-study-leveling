// A step that cannot be undone asks for proof first, in the way the server accepts: an emailed six digit code, or for an unverified account its password.
// One sheet for all of them, so changing an email, resetting progress and deleting an account ask the same way. The server checks the proof. This only
// collects it, asks for the code to be sent, and says plainly when the server refuses it.
import { useState } from "react";
import { View } from "react-native";
import { Button, Sheet, Stack, Text, TextField, useNotice, useTheme } from "@sylf/design-system";
import type { Proof, SecurityAction } from "@sylf/backend";
import { useLiveBackend } from "../backend";
import { describeFailureText } from "./failure";

export interface ProofSheetProps {
  open: boolean;
  onClose: () => void;
  action: SecurityAction;
  title: string;
  /** What happens once it is confirmed, in plain words. */
  consequence: string;
  confirmLabel: string;
  /** Which proof this step takes. Deleting or resetting takes a code, or a password for an unverified account. A new email takes the password, or a code if there is none. */
  by: "code" | "password";
  critical?: boolean;
  onConfirm: (proof: Proof) => Promise<void>;
}

export function ProofSheet({ open, onClose, action, title, consequence, confirmLabel, by, critical, onConfirm }: ProofSheetProps) {
  const { space } = useTheme();
  const backend = useLiveBackend();
  const notice = useNotice();
  const [value, setValue] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const close = () => { setValue(""); setSent(false); setFailure(null); onClose(); };
  const useCode = by === "code";
  const ready = useCode ? /^\d{6}$/.test(value.trim()) : value.length > 0;

  const sendCode = async () => {
    if (!backend || busy) return;
    setBusy(true); setFailure(null);
    try { await backend.reads.account.sendCode(action); setSent(true); notice("A code is on its way to your email."); }
    catch (error) { setFailure(describeFailureText(error)); }
    setBusy(false);
  };
  const confirm = async () => {
    if (!ready || busy) return;
    setBusy(true); setFailure(null);
    try { await onConfirm(useCode ? { code: value.trim() } : { password: value }); close(); }
    catch (error) { setFailure(describeFailureText(error)); }
    setBusy(false);
  };

  return (
    <Sheet open={open} onClose={close} title={title}>
      <View style={{ padding: space.lg }}>
        <Stack gap="md">
          <Text variant="small">{consequence}</Text>
          {useCode ? (
            <>
              <Button title={sent ? "Send another code" : "Email me a code"} variant={sent ? "ghost" : "emphasis"} disabled={busy} testID="proof-send-code" onPress={() => void sendCode()} />
              {sent ? <TextField label="Six digit code" value={value} onChangeText={setValue} keyboardType="number-pad" autoComplete="one-time-code" maxLength={6} testID="proof-code" /> : null}
            </>
          ) : <TextField label="Your password" value={value} onChangeText={setValue} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="current-password" testID="proof-password" />}
          {failure ? <View testID="proof-error" role="alert"><Text variant="small" tone="critical">{failure}</Text></View> : null}
          <Button title={busy ? "Working" : confirmLabel} variant={critical ? "critical" : "emphasis"} disabled={!ready || busy || (useCode && !sent)} testID="proof-confirm" onPress={() => void confirm()} />
          <Button title="Not now" variant="ghost" testID="proof-cancel" onPress={close} />
        </Stack>
      </View>
    </Sheet>
  );
}
