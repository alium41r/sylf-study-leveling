// The timer journal's storage on Sylf Native (G-10). `TimerSync` from lib/timer-sync.ts is the journal, on every client, and it asks for a
// small part of the Storage interface. This gives it that over the two-call preferences adapter. There is no second journal.
//
// Everything sits in one preference value. A write replaces that whole value, which the platform stores atomically, so a crash leaves the
// last whole journal rather than half of one. Keys stay `sylf_timer_journal_v1:<owner>:<clientKey>:...`, so owners stay separate by key,
// exactly as they are in the web's localStorage. A journal holds a few hundred bytes a session, and TimerSync prunes it.
import type { JournalStorage } from "@sylf/shared/backend";

export const TIMER_JOURNAL_KEY = "sylf.native.timer-journal.v1";

export interface PreferenceStore { getItem(key: string): string | null; setItem(key: string, value: string): void }

export function createJournalStorage(preferences: PreferenceStore, key = TIMER_JOURNAL_KEY): JournalStorage {
  const entries = new Map<string, string>();
  try {
    const raw = preferences.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object") for (const [name, value] of Object.entries(parsed)) if (typeof value === "string") entries.set(name, value);
  } catch { /* Unreadable storage starts empty rather than stopping the app. */ }

  const save = () => { preferences.setItem(key, JSON.stringify(Object.fromEntries(entries))); };

  return {
    get length() { return entries.size; },
    key: (index) => [...entries.keys()][index] ?? null,
    getItem: (name) => entries.get(name) ?? null,
    // Unlike the session model, a failed write must surface: TimerSync reports it and keeps the intent in memory for this run.
    setItem(name, value) { entries.set(name, String(value)); save(); },
    removeItem(name) { if (entries.delete(name)) save(); },
  };
}
