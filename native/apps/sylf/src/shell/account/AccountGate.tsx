// What a build with a backend shows. The account decides, in one place: nothing until the device has been read, the sign-in page when nobody is
// here, and the Spaces for someone who is. The Spaces are keyed by account, so a change of person drops every screen's state at once, which is
// what "no trace of the last person" needs: cached reads go through `resources.clear`, and everything held in a component goes here.
// This file loads only when a backend exists.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useNotice } from "@sylf/design-system";
import type { Backend } from "@sylf/backend";
import { speakSessionClock, type HomeNavigation, type WorkspaceModel } from "@sylf/spaces";
import { currentBridge, useResource } from "../backend";
import { AccountEntryProvider } from "../context";
import { SpacesShell } from "../SpacesShell";
import { ClaimSheet } from "./ClaimSheet";
import { OnboardingSurface } from "./OnboardingSurface";
import { SignInSurface } from "./SignInSurface";
import { AccountAccessStatus } from "./AccountAccessStatus";
import { audioEngine } from "../audio/engine";

// Document content and saved layouts have their own persistence. Only the open window's transient selection is reset.
const PERSONAL_TOOL_STATE = { thread: null, title: null, document: null, sound: null, done: null, day: null };

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

/** A person who has not answered the first-run questions sees them once, on any client. Nothing waits on this read when it fails: they keep studying. */
function FirstRun({ backend, children, home }: { backend: Backend; children: ReactNode; home: HomeNavigation }) {
  const resource = useMemo(() => backend.resources.resource({ key: "user-stats", load: (signal) => backend.reads.stats(signal), tags: ["progress", "traveller"], ttlMs: 60_000 }), [backend]);
  const state = useResource(resource);
  const [done, setDone] = useState(false);
  if (!done && !state.data && (state.status === "idle" || state.status === "loading")) return <AccountAccessStatus waiting />;
  if (done || state.data?.hasCompletedOnboarding !== false) return children;
  return <OnboardingSurface backend={backend} onDone={(next) => { home.select(next === "plan" ? "plan" : "focus"); setDone(true); }} />;
}

export default function AccountGate({ backend, workspace, home }: { backend: Backend; workspace: WorkspaceModel; home: HomeNavigation }) {
  const auth = useSyncExternalStore(backend.auth.subscribe, backend.auth.getSnapshot);
  const entry = useMemo(() => ({ open: () => home.setAccountOpen(true) }), [home]);

  // What the last person left in the device's own stores, which `resources.clear` cannot reach. It runs as they go, not when the next one arrives,
  // because the app may be closed in between.
  const lastOwner = useRef(auth.userId);
  useEffect(() => {
    if (lastOwner.current !== null && lastOwner.current !== auth.userId) {
      audioEngine.stop();
      workspace.state().windows.forEach((window) => workspace.patchTool(window.id, PERSONAL_TOOL_STATE));
      home.select("today");
      home.setAccountOpen(false);
    }
    lastOwner.current = auth.userId;
  }, [auth.userId, home, workspace]);

  if (auth.status === "restoring") return <AccountAccessStatus waiting />;
  if (auth.status !== "signed-in") return <SignInSurface backend={backend} ended={auth.ended} />;
  return (
    <AccountEntryProvider value={entry}>
      <FirstRun key={auth.userId} backend={backend} home={home}><SpacesShell /></FirstRun>
      <SavedNotices />
      <ClaimSheet backend={backend} />
    </AccountEntryProvider>
  );
}
