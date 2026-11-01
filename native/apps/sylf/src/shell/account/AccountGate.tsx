// What a build with a backend shows. The account decides, in one place: nothing until the device has been read, the sign-in page when nobody is
// here, and the Spaces for someone who is. The Spaces are keyed by account, so a change of person drops every screen's state at once, which is
// what "no trace of the last person" needs: cached reads go through `resources.clear`, and everything held in a component goes here.
// This file loads only when a backend exists.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { View } from "react-native";
import { useNotice, useTheme } from "@sylf/design-system";
import type { Backend } from "@sylf/backend";
import { speakSessionClock, type HomeNavigation, type WorkspaceModel } from "@sylf/spaces";
import { currentBridge, currentPreferences } from "../backend";
import { AccountEntryProvider } from "../context";
import { SpacesShell } from "../SpacesShell";
import { AccountSheet } from "./AccountSheet";
import { ClaimSheet } from "./ClaimSheet";
import { SignInSurface } from "./SignInSurface";

const LOCAL_ONLY_KEY = "sylf.native.local-only.v1";
/** What a window remembers that belongs to a person rather than to the device. */
const PERSONAL_TOOL_STATE = { thread: null, title: null, document: null, sound: null, done: null, day: null };

function useLocalOnly() {
  const [localOnly, setLocalOnly] = useState(() => currentPreferences()?.getItem(LOCAL_ONLY_KEY) === "1");
  const set = useCallback((value: boolean) => { currentPreferences()?.setItem(LOCAL_ONLY_KEY, value ? "1" : "0"); setLocalOnly(value); }, []);
  return [localOnly, set] as const;
}

/** Says when the server has accepted a session, and when it credited less than the device tracked. */
function SavedNotices() {
  const notice = useNotice();
  const bridge = currentBridge();
  const seen = useRef(bridge?.state().savedCount ?? 0);
  useEffect(() => bridge?.subscribe(() => {
    const { savedCount, lastSaved } = bridge.state();
    if (savedCount === seen.current) return;
    seen.current = savedCount;
    if (!lastSaved || lastSaved.acceptedFocusSeconds === null) return;
    const credited = speakSessionClock(lastSaved.acceptedFocusSeconds);
    notice(lastSaved.acceptedFocusSeconds + 60 < lastSaved.focusSeconds ? `Saved. ${credited} of this session counted.` : `Saved to your study record. ${credited}.`);
  }), [bridge, notice]);
  return null;
}

export default function AccountGate({ backend, workspace, home }: { backend: Backend; workspace: WorkspaceModel; home: HomeNavigation }) {
  const { color } = useTheme();
  const auth = useSyncExternalStore(backend.auth.subscribe, backend.auth.getSnapshot);
  const [localOnly, setLocalOnly] = useLocalOnly();
  const [sheet, setSheet] = useState(false);
  const entry = useMemo(() => ({ open: () => setSheet(true) }), []);

  // What the last person left in the device's own stores, which `resources.clear` cannot reach. It runs as they go, not when the next one arrives,
  // because the app may be closed in between.
  const lastOwner = useRef(auth.userId);
  useEffect(() => {
    if (lastOwner.current !== null && lastOwner.current !== auth.userId) {
      workspace.state().windows.forEach((window) => workspace.patchTool(window.id, PERSONAL_TOOL_STATE));
      home.select("today");
    }
    lastOwner.current = auth.userId;
    if (auth.status === "signed-in" && localOnly) setLocalOnly(false);
  }, [auth.status, auth.userId, home, localOnly, setLocalOnly, workspace]);

  if (auth.status === "restoring") return <View style={{ flex: 1, backgroundColor: color.ground }} />;
  if (auth.status === "signed-out" && !localOnly) return <SignInSurface backend={backend} ended={auth.ended} onLater={() => setLocalOnly(true)} />;
  return (
    <AccountEntryProvider value={entry}>
      <SpacesShell key={auth.userId ?? "this-device"} />
      <SavedNotices />
      <ClaimSheet backend={backend} />
      <AccountSheet backend={backend} open={sheet} onClose={() => setSheet(false)} onSignIn={() => { setSheet(false); setLocalOnly(false); }} />
    </AccountEntryProvider>
  );
}
