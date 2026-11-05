// Tests and any runtime without a platform store: memory only.
import { createMemoryStorage, type NotesStorage } from "@sylf/notes";

export const durableNotesStorage = false;
export function createPlatformNotesStorage(): NotesStorage { return createMemoryStorage(); }
