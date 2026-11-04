// Security: the password, the devices signed in, signing out everywhere, and the accounts linked. Ending a device really ends it, and this device is marked.
// An account made with a provider has no password, and says so rather than offering one. There is no two-step sign-in: it is a stub on the server, so
// nothing here pretends to be one, and linking a provider is not here either, for the same reason.
import { useState } from "react";
import { View } from "react-native";
import { Badge, Button, Callout, Dialog, ListRow, Sheet, Stack, Text, TextField, useNotice, useTheme } from "@sylf/design-system";
import type { DeviceSession, UserStats } from "@sylf/backend";
import { useBackend, useLiveBackend } from "../../backend";
import { describeFailureText } from "../failure";
import { useConnections, useDevices } from "../useAccount";
import { AccountSection } from "./Section";

const PROVIDER_NAMES: Record<string, string> = { GOOGLE: "Google", GITHUB: "GitHub", DISCORD: "Discord", INSTAGRAM: "Instagram", APPLE: "Apple" };

function PasswordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { space } = useTheme();
  const backend = useLiveBackend();
  const notice = useNotice();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const close = () => { setCurrent(""); setNext(""); setAgain(""); setFailure(null); onClose(); };
  const problem = next && next.length < 6 ? "Use at least 6 characters." : again && again !== next ? "The two passwords don't match." : next && next === current ? "Choose a different password from the current one." : null;
  const save = async () => {
    if (!backend || busy || problem || !current || !next || !again) return;
    setBusy(true); setFailure(null);
    try { await backend.reads.account.changePassword(current, next); notice("Password changed. Your other devices were signed out."); backend.resources.invalidate("account-devices"); close(); }
    catch (error) { setFailure(error instanceof Error && "detail" in error && (error as { detail?: { code?: string } }).detail?.code === "password_incorrect" ? "That isn't your current password." : describeFailureText(error)); }
    setBusy(false);
  };
  return (
    <Sheet open={open} onClose={close} title="Change password">
      <View style={{ padding: space.lg }}>
        <Stack gap="md">
          <TextField label="Current password" value={current} onChangeText={setCurrent} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="current-password" testID="account-current-password" />
          <TextField label="New password" helper="At least 6 characters." value={next} onChangeText={setNext} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="new-password" testID="account-new-password" />
          <TextField label="Again, to be sure" value={again} onChangeText={setAgain} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="new-password" error={problem ?? undefined} testID="account-confirm-password" />
          {failure ? <View role="alert" testID="account-password-error"><Text variant="small" tone="critical">{failure}</Text></View> : null}
          <Button title={busy ? "Saving" : "Change password"} variant="emphasis" disabled={busy || Boolean(problem) || !current || !next || !again} testID="account-password-save" onPress={() => void save()} />
        </Stack>
      </View>
    </Sheet>
  );
}

function Devices() {
  const backend = useLiveBackend();
  const notice = useNotice();
  const result = useDevices();
  const [ending, setEnding] = useState<DeviceSession | null>(null);
  const end = async () => {
    if (!backend || !ending) return;
    const target = ending;
    setEnding(null);
    try { await backend.reads.account.endDevice(target.id); notice(`${target.device} was signed out.`); }
    catch (error) { notice(describeFailureText(error)); }
    backend.resources.invalidate("account-devices");
  };
  if (!result) return <Text tone="soft">Loading your devices.</Text>;
  if (!result.data) return <Callout tone="caution" title="Devices didn't load" message={result.live.failure ?? "Try again in a moment."} />;
  return (
    <Stack gap="xs" testID="account-devices">
      {result.data.map((device) => (
        <View key={device.id} testID={`account-device-${device.id}`}>
          <ListRow title={device.device} detail={[device.platform, device.lastActive].filter(Boolean).join(", ")} trailing={device.isCurrent ? <Badge label="This device" tone="accent" /> : <Button title="Sign out" size="small" variant="ghost" testID={`account-end-${device.id}`} onPress={() => setEnding(device)} />} />
        </View>
      ))}
      <Dialog open={ending !== null} onClose={() => setEnding(null)} title={`Sign out ${ending?.device ?? "this device"}?`} message="It stops working at once, and anything it holds that wasn't saved stays on it." actions={[{ label: "Not now", onPress: () => setEnding(null) }, { label: "Sign out", variant: "critical", onPress: () => void end() }]} />
    </Stack>
  );
}

function SignOutEverywhere({ stats }: { stats: UserStats }) {
  const { space } = useTheme();
  const backend = useBackend();
  const notice = useNotice();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const close = () => { setOpen(false); setPassword(""); setFailure(null); };
  const go = async () => {
    if (!backend || busy) return;
    setBusy(true); setFailure(null);
    try { await backend.reads.account.signOutEverywhere(stats.hasPassword ? password : undefined); close(); notice("Signed out everywhere."); await backend.auth.signOut(); }
    catch (error) { setFailure(describeFailureText(error)); }
    setBusy(false);
  };
  return (
    <>
      <View style={{ flexDirection: "row" }}><Button title="Sign out everywhere" variant="ghost" testID="account-sign-out-all" onPress={() => setOpen(true)} /></View>
      <Sheet open={open} onClose={close} title="Sign out everywhere">
        <View style={{ padding: space.lg }}>
          <Stack gap="md">
            <Text variant="small">Every device is signed out, this one too. You'll sign in again here.</Text>
            {stats.hasPassword ? <TextField label="Your password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="current-password" testID="account-signout-all-password" /> : null}
            {failure ? <View role="alert" testID="account-signout-all-error"><Text variant="small" tone="critical">{failure}</Text></View> : null}
            <Button title={busy ? "Working" : "Sign out everywhere"} variant="critical" disabled={busy || (stats.hasPassword === true && !password)} testID="account-signout-all-confirm" onPress={() => void go()} />
          </Stack>
        </View>
      </Sheet>
    </>
  );
}

function Connected({ stats }: { stats: UserStats }) {
  const backend = useLiveBackend();
  const notice = useNotice();
  const result = useConnections();
  const [asking, setAsking] = useState<string | null>(null);
  const linked = (result?.data ?? []).filter((connection) => connection.isLinked);
  const unlink = async () => {
    if (!backend || !asking) return;
    const provider = asking;
    setAsking(null);
    try { await backend.reads.account.unlink(provider); notice(`${PROVIDER_NAMES[provider] ?? provider} unlinked.`); }
    catch (error) { notice(describeFailureText(error)); }
    backend.resources.invalidate("account-connections");
  };
  if (!result) return <Text tone="soft">Loading your linked accounts.</Text>;
  if (!result.data) return <Callout tone="caution" title="Linked accounts didn't load" message={result.live.failure ?? "Try again in a moment."} />;
  const onlyWay = !stats.hasPassword && linked.length === 1;
  return (
    <Stack gap="xs" testID="account-connections">
      {linked.length ? linked.map((connection) => (
        <View key={connection.provider} testID={`account-connection-${connection.provider}`}>
          <ListRow title={PROVIDER_NAMES[connection.provider] ?? connection.provider} detail={connection.email ?? connection.username ?? "Linked"} trailing={<Button title="Unlink" size="small" variant="ghost" disabled={onlyWay} testID={`account-unlink-${connection.provider}`} onPress={() => setAsking(connection.provider)} />} />
        </View>
      )) : <Text variant="small" tone="soft">No other accounts are linked.</Text>}
      {onlyWay ? <Text variant="caption" tone="soft">This is your only way to sign in, so it can't be unlinked.</Text> : null}
      <Dialog open={asking !== null} onClose={() => setAsking(null)} title={`Unlink ${PROVIDER_NAMES[asking ?? ""] ?? "this account"}?`} message="You won't be able to sign in with it any more." actions={[{ label: "Not now", onPress: () => setAsking(null) }, { label: "Unlink", variant: "critical", onPress: () => void unlink() }]} />
    </Stack>
  );
}

export function SecuritySection({ stats, onPlace }: { stats: UserStats; onPlace: (id: string, y: number) => void }) {
  const [changing, setChanging] = useState(false);
  return (
    <AccountSection id="security" title="Security" onPlace={onPlace}>
      <Stack gap="lg">
        {stats.hasPassword ? <View style={{ flexDirection: "row" }}><Button title="Change password" testID="account-change-password" onPress={() => setChanging(true)} /></View> : <Text variant="small" tone="soft" testID="account-no-password">You sign in with a linked account, so there is no password to change.</Text>}
        <Stack gap="sm"><Text variant="caption" tone="soft">Devices</Text><Devices /></Stack>
        <SignOutEverywhere stats={stats} />
        <Stack gap="sm"><Text variant="caption" tone="soft">Linked accounts</Text><Connected stats={stats} /></Stack>
      </Stack>
      <PasswordSheet open={changing} onClose={() => setChanging(false)} />
    </AccountSection>
  );
}
