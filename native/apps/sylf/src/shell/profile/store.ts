// Whose profile is open. One choice, so a person tapped in Circle, Standing, a search or a room opens the same sheet, which the shell mounts once.
import { useSyncExternalStore } from "react";

let current: string | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const set = (next: string | null) => { if (next === current) return; current = next; listeners.forEach((listener) => listener()); };

export const profileTarget = { get: () => current, open: (username: string) => set(username), close: () => set(null) };
export const openProfile = profileTarget.open;
export const useProfileTarget = () => useSyncExternalStore(subscribe, profileTarget.get, profileTarget.get);

// A conversation to open in Circle's Messages, asked for from anywhere (a profile's Message button). Circle takes it when it shows, and clears it.
let requested: number | null = null;
const requestListeners = new Set<() => void>();
const subscribeRequest = (listener: () => void) => { requestListeners.add(listener); return () => { requestListeners.delete(listener); }; };
export const conversationRequest = { get: () => requested, ask(id: number | null) { requested = id; requestListeners.forEach((listener) => listener()); } };
export const useConversationRequest = () => useSyncExternalStore(subscribeRequest, conversationRequest.get, conversationRequest.get);
