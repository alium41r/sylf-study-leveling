// Where the person is studying, told to the party's room (ADR 0015 decisions 11 and 12, owner decision E-13). The study session is the only clock and
// the only record: this reads it and mirrors "focusing" or "paused" to the room's acknowledged actions so the others can see, and it computes nothing.
// A mirror that cannot reach the server is never a reason to stop the session. The time still counts through the session, and the room catches up.
//
// The exit is different: leaving the room must happen exactly once, at the right instant, even after a crash or days offline. That belongs to the
// journal (`createSessionBridge` hands a finished party session's exit to TimerSync's party branch), so this only has to make sure the record knows
// where the person was seated, which is what that exit needs to be replayed.
import type { StudySessionModel } from "@sylf/spaces";
import { BackendError } from "./errors";
import type { AuthModel } from "./auth-model";
import type { Connectivity } from "./connectivity";
import type { PartyReads, RoomAction } from "./party";
import { seatedAt } from "./party";

export type RoomLink = "idle" | "joining" | "in-room" | "retrying" | "unavailable";
export interface PartyPresenceState {
  clientKey: string | null;
  link: RoomLink;
  /** In words for a person, when the room cannot be reached. The session itself keeps counting. */
  message: string | null;
}

export interface PartyPresence {
  state(): PartyPresenceState;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

const RETRY_MS = 15_000;
const MAX_SEATING_TRIES = 6;
const IDLE: PartyPresenceState = { clientKey: null, link: "idle", message: null };

export function createPartyPresence({ session, parties, auth, connectivity, retryMs = RETRY_MS }: { session: StudySessionModel; parties: PartyReads; auth: AuthModel; connectivity: Connectivity; retryMs?: number }): PartyPresence {
  const listeners = new Set<() => void>();
  let snapshot: PartyPresenceState = IDLE;
  let mirrored: { clientKey: string; state: "focusing" | "paused" | null } = { clientKey: "", state: null };
  let busy = false;
  /** The session changed while a call was in flight, so the mirror reads it again when that call is done. */
  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** Ended sessions whose seating is being recovered, so a lost answer never leaves a person seated in a room they have left. */
  const recovering = new Map<string, number>();
  const refused = new Set<string>();
  let disposed = false;

  const publish = (next: PartyPresenceState) => {
    if (next.clientKey === snapshot.clientKey && next.link === snapshot.link && next.message === snapshot.message) return;
    snapshot = next;
    listeners.forEach((listener) => listener());
  };
  const later = () => { if (timer === undefined && !disposed) timer = setTimeout(() => { timer = undefined; void run(); }, retryMs); };

  /** Reads where the server seated this person, and puts it on the record so the exit can be replayed. */
  async function seat(clientKey: string, partyId: number, roomSessionId: number, me: number) {
    const state = await parties.state(partyId, new AbortController().signal);
    const joinedAt = seatedAt(state, me);
    if (joinedAt) session.setPartyRoom(clientKey, { roomSessionId, joinedAt });
    return joinedAt !== null;
  }

  async function mirror(me: number) {
    const { active } = session.state();
    if (!active?.party || active.ownerId !== me) { if (snapshot.link !== "idle") publish(IDLE); return; }
    const { clientKey, party } = active;
    if (refused.has(clientKey)) return;
    if (mirrored.clientKey !== clientKey) mirrored = { clientKey, state: null };
    const focusing = session.status() === "running" && active.snapshot.phase === "focus";
    const want = focusing ? "focusing" : "paused";
    if (mirrored.state === want && party.roomSessionId !== null) { publish({ clientKey, link: "in-room", message: null }); return; }
    const action: RoomAction = mirrored.state === null ? "start" : want === "focusing" ? "resume" : "pause";
    publish({ clientKey, link: mirrored.state === null ? "joining" : snapshot.link === "in-room" ? "in-room" : "retrying", message: null });
    try {
      const entry = await parties.timer(party.partyId, action, party.roomSessionId ? { sessionId: party.roomSessionId } : {});
      mirrored = { clientKey, state: action === "pause" ? "paused" : "focusing" };
      if (party.roomSessionId === null && !(await seat(clientKey, party.partyId, entry.sessionId, me))) throw new BackendError("server", "Not seated yet.");
      // The first "start" starts the room's timer. A session that began on a break wants the room paused as well, and the loop below does it.
      publish({ clientKey, link: "in-room", message: null });
    } catch (error) {
      const failure = error instanceof BackendError ? error : null;
      if (failure && !failure.transient && failure.kind !== "cancelled") {
        // The room refused: the party is gone, or this person is not in it. Say so once and stop asking. The session carries on.
        refused.add(clientKey);
        publish({ clientKey, link: "unavailable", message: failure.kind === "not-found" || failure.kind === "forbidden" ? "The party's room is not available. Your time still counts." : failure.message });
        return;
      }
      publish({ clientKey, link: "retrying", message: connectivity.state() === "offline" ? "Offline. Your time still counts, and the room catches up." : "Reconnecting to the room. Your time still counts." });
      later();
      return;
    }
    if (mirrored.state !== want) dirty = true;
  }

  /** A session that ended before anyone learned where the person was seated still has to leave the room. Seat first, then the journal can leave. */
  async function recover(me: number) {
    for (const item of session.state().ended) {
      if (!item.party || item.party.roomSessionId !== null || item.saved || item.ownerId !== me) continue;
      const tries = recovering.get(item.clientKey) ?? 0;
      if (tries >= MAX_SEATING_TRIES) continue;
      recovering.set(item.clientKey, tries + 1);
      try {
        const entry = await parties.enter(item.party.partyId);
        await seat(item.clientKey, item.party.partyId, entry.sessionId, me);
      } catch (error) {
        if (error instanceof BackendError && !error.transient) recovering.set(item.clientKey, MAX_SEATING_TRIES);
        else later();
      }
    }
  }

  async function run() {
    if (busy) { dirty = true; return; }
    const me = auth.getSnapshot().userId;
    if (me === null || disposed) return;
    busy = true;
    try {
      do { dirty = false; await mirror(me); await recover(me); } while (dirty && !disposed);
    } finally { busy = false; }
  }

  const stopSession = session.subscribe(() => { void run(); });
  const stopConnectivity = connectivity.subscribe(() => { if (connectivity.state() === "online") void run(); });
  const stopAuth = auth.subscribe(() => { void run(); });
  void run();

  return {
    state: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose() { disposed = true; stopSession(); stopConnectivity(); stopAuth(); if (timer !== undefined) clearTimeout(timer); },
  };
}
