// The account, as one long page with an index beside it, reached from the foot of Home's rail. You, Study, Appearance, Privacy, Notifications, Security and
// Leaving, in that order, each its own section. Nothing here is a second copy of something another place owns: Study opens Plan and Focus, and the
// appearance is this device's. Signing out with a session going asks first: it belongs to them, and the next person must not inherit a running clock.
import { useRef, useState, useSyncExternalStore, type ComponentRef } from "react";
import { ScrollView, View } from "react-native";
import { Button, Callout, Chip, Dialog, IconButton, Press, Stack, Text, ThemeStudio, useDismiss, useTheme, useWindowClass } from "@sylf/design-system";
import { speakSessionClock } from "@sylf/spaces";
import { currentBridge, useBackend, useSessionSync } from "../backend";
import { useHomeNavigation, useShellMetrics, useStudySession } from "../context";
import { useStats } from "../live";
import { useAccountEntry } from "../context";
import { AppearanceSection } from "./sections/AppearanceSection";
import { LeavingSection } from "./sections/LeavingSection";
import { NotificationsSection } from "./sections/NotificationsSection";
import { PrivacySection } from "./sections/PrivacySection";
import { SecuritySection } from "./sections/SecuritySection";
import { StudySection } from "./sections/StudySection";
import { YouSection } from "./sections/YouSection";

/** How long a finished session gets to reach the server before signing out carries on without it. It stays safe in the journal either way. */
const FLUSH_MS = 3_000;
const INDEX = [["you", "You"], ["study", "Study"], ["appearance", "Appearance"], ["privacy", "Privacy"], ["notifications", "Notifications"], ["security", "Security"], ["leaving", "Leaving"]] as const;

function StudyBack({ onBack, title }: { onBack: () => void; title: string }) {
  const { space } = useTheme();
  useDismiss(true, onBack);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.xl, paddingBottom: space.sm }}>
      <IconButton icon="chevronLeft" label="Back" testID="account-studio-back" onPress={onBack} />
      <Text variant="heading" role="heading" aria-level={1}>{title}</Text>
    </View>
  );
}

export default function AccountPage() {
  const { space } = useTheme();
  const { size } = useWindowClass();
  const wide = size !== "compact";
  const { top, control } = useShellMetrics();
  const navigation = useHomeNavigation();
  const entry = useAccountEntry();
  const backend = useBackend();
  const session = useStudySession();
  const stats = useStats();
  const sync = useSessionSync();
  const auth = useSyncExternalStore(backend!.auth.subscribe, backend!.auth.getSnapshot);
  const [asking, setAsking] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [studio, setStudio] = useState(false);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const places = useRef<Record<string, number>>({});
  const place = (id: string, y: number) => { places.current[id] = y; };
  const jump = (id: string) => scroller.current?.scrollTo({ y: Math.max(0, (places.current[id] ?? 0) - space.md), animated: true });
  const close = () => navigation.setAccountOpen(false);
  useDismiss(!studio, close);
  const signedIn = auth.status === "signed-in";
  const name = stats?.name || stats?.username || auth.user?.name || auth.user?.username || "Your account";

  const leave = async () => {
    setAsking(null);
    setLeaving(true);
    if (session.state().active) session.end();
    await currentBridge()?.flush(FLUSH_MS);
    close();
    await backend!.auth.signOut();
    setLeaving(false);
  };
  const signOut = () => {
    if (session.state().active) setAsking(speakSessionClock(session.readout().focusSeconds));
    else void leave();
  };

  if (studio) {
    return (
      <View testID="account-studio" style={{ flex: 1, paddingTop: top + control + space.sm }}>
        <StudyBack onBack={() => setStudio(false)} title="Appearance" />
        <ThemeStudio />
      </View>
    );
  }
  const index = (
    wide
      ? <Stack gap="xs" style={{ width: 168 }} testID="account-index">{INDEX.map(([id, label]) => <Press key={id} role="button" label={label} testID={`account-index-${id}`} onPress={() => jump(id)} bodyStyle={{ paddingVertical: space.sm, paddingHorizontal: space.sm }}><Text variant="small" tone="soft">{label}</Text></Press>)}</Stack>
      : <ScrollView horizontal showsHorizontalScrollIndicator={false} testID="account-index" contentContainerStyle={{ gap: space.xs }}>{INDEX.map(([id, label]) => <Chip key={id} label={label} onPress={() => jump(id)} />)}</ScrollView>
  );
  return (
    <View testID="account-page" style={{ flex: 1, paddingTop: top + control + space.sm }}>
      <View style={{ flex: 1, flexDirection: wide && signedIn && stats ? "row" : "column", alignSelf: "center", width: "100%", maxWidth: wide ? 960 : 720, paddingHorizontal: space.xl, gap: space.xl }}>
        {wide && signedIn && stats ? <View style={{ paddingTop: control + space.md }}>{index}</View> : null}
        <ScrollView ref={scroller} keyboardShouldPersistTaps="handled" style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: space.sky }}>
          <View style={{ width: "100%", maxWidth: 720, alignSelf: "center", gap: space.xl }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              <IconButton icon="chevronLeft" label="Back" testID="account-back" onPress={close} />
              <Text variant="display" role="heading" aria-level={1}>Account</Text>
            </View>
            {signedIn ? (
              <Stack gap="xl">
                {!wide && stats ? index : null}
                {sync.pending ? <Callout tone="caution" title="A session is still being saved" message="If you sign out now it stays on this device, and is saved the next time you sign in here." /> : null}
                {stats ? (
                  <>
                    <YouSection stats={stats} onPlace={place} />
                    <StudySection onPlace={place} onLeave={close} />
                    <AppearanceSection onPlace={place} onOpen={() => setStudio(true)} />
                    <PrivacySection onPlace={place} />
                    <NotificationsSection onPlace={place} />
                    <SecuritySection stats={stats} onPlace={place} />
                    <LeavingSection stats={stats} onPlace={place} onDeleted={close} />
                  </>
                ) : <Text tone="soft" testID="account-loading">{name}</Text>}
                <View style={{ flexDirection: "row" }}><Button title={leaving ? "Signing out" : "Sign out"} disabled={leaving} testID="account-sign-out" onPress={signOut} /></View>
              </Stack>
            ) : (
              <Stack gap="lg">
                <Text variant="small" tone="soft">You're using Sylf on this device only. Time you track stays here and earns nothing until you add it to an account.</Text>
                <View style={{ flexDirection: "row" }}><Button title="Sign in" variant="emphasis" testID="account-sign-in" onPress={() => { close(); entry?.signIn(); }} /></View>
              </Stack>
            )}
          </View>
        </ScrollView>
      </View>
      <Dialog
        open={asking !== null}
        onClose={() => setAsking(null)}
        title="End your session and sign out?"
        message={`${asking ?? ""} so far. It ends now and is saved to your study record.`}
        actions={[{ label: "Keep studying", onPress: () => setAsking(null) }, { label: "End and sign out", variant: "critical", onPress: () => void leave() }]}
      />
    </View>
  );
}
