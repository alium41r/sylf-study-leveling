// The party this person belongs to, and its room. Both read through the shared resource store, so Circle, Focus and the environment ask once between
// them. The room is read while it is on screen and the app is in front, and never otherwise (R17): a hidden screen reads nothing.
import { useEffect, useMemo } from "react";
import { AppState } from "react-native";
import type { PartyState } from "@sylf/backend";
import { useLiveBackend, useOptionalResource, useRealtimeLink } from "../backend";

const ROOM_POLL_MS = 15_000;
/** With Realtime live the room is nudged when it changes, so this is only a safety net. */
const ROOM_POLL_LIVE_MS = 120_000;

export function usePartySummary() {
  const backend = useLiveBackend();
  const resource = useMemo(() => (backend ? backend.resources.resource({ key: "circle-party-summary", tags: ["circle", "party"], ttlMs: 30_000, load: (signal) => backend.reads.party(signal) }) : null), [backend]);
  const state = useOptionalResource(resource);
  return { summary: state?.data ?? null, loading: Boolean(resource) && state?.data == null && state?.status !== "failed" && state?.status !== "offline", resource };
}

export function useRoom(partyId: number | null, watching: boolean): { state: PartyState | null; failed: boolean; refresh: () => void } {
  const backend = useLiveBackend();
  const resource = useMemo(() => (backend && partyId ? backend.resources.resource({ key: `party-room-${partyId}`, tags: ["party"], ttlMs: 10_000, load: (signal) => backend.reads.parties.state(partyId, signal) }) : null), [backend, partyId]);
  const read = useOptionalResource(resource);
  const link = useRealtimeLink();
  useEffect(() => {
    if (!resource || !watching) return;
    const poll = () => { if (AppState.currentState === "active") resource.refresh(); };
    const timer = setInterval(poll, link === "live" ? ROOM_POLL_LIVE_MS : ROOM_POLL_MS);
    return () => clearInterval(timer);
  }, [resource, watching, link]);
  return { state: read?.data ?? null, failed: read?.status === "failed", refresh: () => resource?.refresh() };
}
