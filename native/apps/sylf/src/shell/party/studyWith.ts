// Who the next session is with. One choice, read by every place a session can begin, so "Begin" means the same thing on Focus, in the dock and in the
// environment. It is never sticky: a session that begins with a party clears it, because starting a session should not quietly post to a room twice.
import { useSyncExternalStore } from "react";

export interface StudyWith { partyId: number; name: string }

let current: StudyWith | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

export const studyWith = {
  get: () => current,
  set(next: StudyWith | null) {
    if (current?.partyId === next?.partyId) return;
    current = next;
    listeners.forEach((listener) => listener());
  },
  /** Reads the choice for a session that is about to begin, and clears it. */
  take(): StudyWith | null {
    const taken = current;
    if (taken) studyWith.set(null);
    return taken;
  },
};

export const useStudyWith = () => useSyncExternalStore(subscribe, studyWith.get, studyWith.get);

/** The `party` field of a session about to begin, or nothing for a session on one's own. */
export const takeParty = (): { party: { partyId: number; name: string } } | Record<string, never> => {
  const taken = studyWith.take();
  return taken ? { party: { partyId: taken.partyId, name: taken.name } } : {};
};
