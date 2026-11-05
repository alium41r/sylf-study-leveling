// Sylf Native's way to the backend, joined once. It decides which client this is, and everything else lives in @sylf/backend.
//
// A build with no backend makes no request and does not load that package, so Sample data, "Not saved" and start-up are exactly what they
// were. Electron's host says whether it has one. On a device it is `EXPO_PUBLIC_SYLF_API_ORIGIN`. Screens read `useLiveBackend()`, and
// `useResource` gives them loading, empty, offline and failed through the same pattern as every other long-lived object here.
import { useEffect, useRef, useSyncExternalStore } from "react";
import { Linking } from "react-native";
import type { PlatformAdapters, PlatformCapabilities } from "@sylf/platform";
import type { StudySessionModel } from "@sylf/spaces";
import type { AuthSnapshot, Backend, PartyPresence, PartyPresenceState, Realtime, RealtimeLink, Resource, ResourceState, SessionBridge, SessionSyncState } from "@sylf/backend";

let backend: Backend | null = null;
let bridge: SessionBridge | null = null;
let presence: PartyPresence | null = null;
let realtime: Realtime | null = null;
let foreground = true;
/** "pending" exists only while Electron's host is being asked. It lasts one local request, and nothing is drawn that could be wrong. */
let phase: "pending" | "none" | "ready" = "none";
let preferences: PlatformAdapters["preferences"] | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

export const currentBackend = () => backend;
export const currentBridge = () => bridge;
export const currentPresence = () => presence;
export const currentPreferences = () => preferences;
export const useBackend = () => useSyncExternalStore(subscribe, currentBackend);
export const useBackendPhase = () => useSyncExternalStore(subscribe, () => phase);

const NO_AUTH: AuthSnapshot = { status: "not-configured", userId: null, user: null, ended: false };
const noSubscribe = () => () => undefined;

/** Who is signed in, or "not-configured" in a build with no backend. */
export function useAuth(): AuthSnapshot {
  const joined = useBackend();
  return useSyncExternalStore(joined?.auth.subscribe ?? noSubscribe, joined?.auth.getSnapshot ?? (() => NO_AUTH));
}

/** The backend, only while someone is signed in. This is what lets real data replace the sample and empty adapters, and go with the person. */
export function useLiveBackend(): Backend | null {
  const joined = useBackend();
  return useAuth().status === "signed-in" ? joined : null;
}

const NO_SYNC: SessionSyncState = { ownerId: null, pending: 0, offline: false, error: null, savedCount: 0, lastSaved: null };

/** How delivery is going, for the words beside a session. */
export function useSessionSync(): SessionSyncState {
  useBackend();
  return useSyncExternalStore(bridge?.subscribe ?? noSubscribe, bridge?.state ?? (() => NO_SYNC));
}

const noLink = (): RealtimeLink => "off";

/** Whether pushed changes are arriving. A screen with its own fallback poll slows it while this is "live", and runs it at full pace otherwise. */
export function useRealtimeLink(): RealtimeLink {
  useBackend();
  return useSyncExternalStore(realtime?.subscribe ?? noSubscribe, realtime?.state ?? noLink);
}

/** Runs `onNudge` when the server says these tags moved. It is a hint to read again, never content. */
export function useRealtimeNudge(tag: string, onNudge: () => void) {
  const joined = useBackend();
  const latest = useRef(onNudge);
  latest.current = onNudge;
  useEffect(() => realtime?.onNudge((tags) => { if (tags.has(tag)) latest.current(); }), [joined, tag]);
}

/** The app moved to or from the front. Realtime runs only in front, and only while someone is signed in. */
export function noteForeground(active: boolean) {
  foreground = active;
  syncRealtime();
}
function syncRealtime() { realtime?.setActive(foreground && backend?.auth.getSnapshot().status === "signed-in"); }

const NO_ROOM: PartyPresenceState = { clientKey: null, link: "idle", message: null };

/** How the party's room is reached for the session now running, for the words beside it. The session keeps counting whatever this says. */
export function usePartyPresence(): PartyPresenceState {
  useBackend();
  return useSyncExternalStore(presence?.subscribe ?? noSubscribe, presence?.state ?? (() => NO_ROOM));
}

/** Watching is what makes it load, and leaving is what cancels it. */
export const useResource = <T,>(resource: Resource<T>): ResourceState<T> => useSyncExternalStore(resource.subscribe, resource.getSnapshot);

const nothing = () => null;
/** The same, for a resource that may not exist: with nobody signed in there is nothing to watch. */
export const useOptionalResource = <T,>(resource: Resource<T> | null): ResourceState<T> | null => useSyncExternalStore(resource?.subscribe ?? noSubscribe, resource?.getSnapshot ?? nothing);

async function hostHasBackend() {
  try { return ((await (await fetch("/api/auth/native/session", { cache: "no-store" })).json()) as { configured?: boolean }).configured === true; }
  catch { return false; }
}

const installName = (capabilities: PlatformCapabilities) => `Sylf for ${{ android: "Android", ios: capabilities.formFactor === "phone" ? "iPhone" : "iPad", macos: "Mac", windows: "Windows", linux: "Linux", unknown: "this device" }[capabilities.os]}`;

/** Says before the first frame whether there is a question to wait for. */
export function prepareBackend(capabilities: PlatformCapabilities) {
  if (capabilities.runtime === "desktop" || (capabilities.runtime === "native" && process.env.EXPO_PUBLIC_SYLF_API_ORIGIN)) phase = "pending";
}

const settle = (next: "none" | "ready") => { phase = next; notify(); };

/** Runs once, after the first frame. */
export async function connectBackend(adapters: PlatformAdapters, capabilities: PlatformCapabilities, session: StudySessionModel): Promise<void> {
  if (backend) return;
  const desktop = capabilities.runtime === "desktop";
  const configuredOrigin = process.env.EXPO_PUBLIC_SYLF_API_ORIGIN;
  if (desktop ? !(await hostHasBackend()) : !(capabilities.runtime === "native" && configuredOrigin)) { settle("none"); return; }
  // A chunk that will not load must not leave the app on a blank page: it opens as a build with no backend, and studying still works.
  const loaded = await import("@sylf/backend").catch(() => null);
  if (!loaded) { console.warn("SYLF_BACKEND could not load its code."); settle("none"); return; }
  const { createBackend, createBearerGateway, createHostGateway, createPartyPresence, createRealtime, createSessionBridge, createSupabaseSocket, parseBackendOrigin } = loaded;
  const origin = desktop ? null : parseBackendOrigin(configuredOrigin);
  if (!desktop && !origin) { console.warn("SYLF_BACKEND refused an origin that is neither https nor this machine."); settle("none"); return; }
  let joined: Backend | null = null;
  const gateway = desktop ? createHostGateway() : createBearerGateway({
    origin: origin as string,
    clientName: installName(capabilities),
    vault: adapters.secureSession,
    crypto: adapters.crypto,
    openUrl: (url) => Linking.openURL(url),
    onEnded: () => joined?.auth.sessionEnded(),
  });
  joined = createBackend({ gateway, preferences: adapters.preferences, assetUrl: (path) => (origin ? `${origin}${path}` : path) });
  backend = joined;
  preferences = adapters.preferences;
  bridge = createSessionBridge({ session, delivery: joined.timer, auth: joined.auth, resources: joined.resources, connectivity: joined.connectivity });
  presence = createPartyPresence({ session, parties: joined.reads.parties, auth: joined.auth, connectivity: joined.connectivity });
  // Realtime is optional: with no address in this build it stays off, and the bounded fallbacks carry on exactly as they did.
  const realtimeUrl = process.env.EXPO_PUBLIC_SYLF_REALTIME_URL;
  const realtimeKey = process.env.EXPO_PUBLIC_SYLF_REALTIME_KEY;
  realtime = createRealtime({ client: joined.client, resources: joined.resources, config: realtimeUrl && realtimeKey ? { url: realtimeUrl, key: realtimeKey } : null, socket: createSupabaseSocket });
  joined.auth.subscribe(syncRealtime);
  settle("ready");
  await joined.start();
  syncRealtime();
}
