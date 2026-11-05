// The Notes library for whoever is using the device: an account's own library when signed in, and the device library otherwise.
// One instance per owner for the life of the app, so every window, Home and Resources read the same documents.
import { useEffect, useSyncExternalStore } from "react";
import { DEVICE_OWNER, createNotesLibrary, ownerKey, type LibrarySnapshot, type NotesLibrary } from "@sylf/notes";
import { useAuth } from "../backend";
import { sha256 } from "./hash";
import { createPlatformNotesStorage, durableNotesStorage } from "./storage";

const libraries = new Map<string, NotesLibrary>();
let storage: ReturnType<typeof createPlatformNotesStorage> | null = null;

export function notesLibraryFor(owner: string): NotesLibrary {
  const existing = libraries.get(owner);
  if (existing) return existing;
  storage ??= createPlatformNotesStorage();
  const library = createNotesLibrary(storage, owner, { sha256 });
  libraries.set(owner, library);
  return library;
}

/** Writes every open document now: before the app is backgrounded or someone signs out. */
export const flushNotes = () => Promise.all([...libraries.values()].map((library) => library.flush().catch(() => undefined)));

/** Moves the device's notes into the signed-in account's library, then forgets the device library's stale view of them. */
export async function adoptDeviceNotes(into: NotesLibrary) {
  const device = notesLibraryFor(DEVICE_OWNER);
  const moved = await into.adopt(device);
  libraries.delete(DEVICE_OWNER);
  await device.close();
  return moved;
}

export const notesAreDurable = durableNotesStorage;

export function useNotesOwner() {
  const auth = useAuth();
  return ownerKey(auth.status === "signed-in" ? auth.userId : null);
}

export function useNotesLibrary(): NotesLibrary {
  return notesLibraryFor(useNotesOwner());
}

export function useLibrarySnapshot(library: NotesLibrary): LibrarySnapshot {
  return useSyncExternalStore(library.subscribe, library.getSnapshot);
}

/** How many notes wait in the device library while someone is signed in. */
export function useDeviceNotesWaiting(owner: string) {
  const device = owner === DEVICE_OWNER ? null : notesLibraryFor(DEVICE_OWNER);
  const snapshot = useSyncExternalStore(device?.subscribe ?? noSubscribe, device?.getSnapshot ?? empty);
  useEffect(() => { void device?.ready(); }, [device]);
  return snapshot.entries.length;
}
const noSubscribe = () => () => undefined;
const EMPTY: LibrarySnapshot = { ready: true, entries: [], notebooks: [], failure: null };
const empty = () => EMPTY;
