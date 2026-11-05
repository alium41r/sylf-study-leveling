// Browser and desktop: IndexedDB. Without it (a locked-down browser), notes live for this run only, and the library says so.
import { createIndexedDbStorage, createMemoryStorage, type NotesStorage } from "@sylf/notes";

export const durableNotesStorage = typeof indexedDB !== "undefined";
export function createPlatformNotesStorage(): NotesStorage {
  return durableNotesStorage ? createIndexedDbStorage() : createMemoryStorage();
}
