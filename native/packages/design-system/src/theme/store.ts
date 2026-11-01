// The appearance store lives outside React: Android can recreate the React root (Phase 2), and the first frame must
// already wear the right theme, so state is read synchronously before anything renders.
//
// Changes apply live, with undo, instead of the web's draft-and-apply step. During a drag `preview` updates only the
// scoped preview tile; the whole app re-themes on commit, so a slider never re-renders every screen per frame.
import type { ThemeAxes } from "./axes";
import { DEFAULT_PREFERENCE, MAX_RECENTS, MAX_SAVED_THEMES, normalizePreference, resolveAxes, type AccessPreference, type AppearancePreference, type ModePreference, type SavedTheme } from "./preference";
import { THEME_PRESETS, type PresetId } from "./presets";

export interface PreferenceStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }

export const APPEARANCE_STORAGE_KEY = "sylf.native.appearance.v1";
const HISTORY_LIMIT = 30;
const PERSIST_DELAY_MS = 180;

export interface AppearanceSnapshot {
  preference: AppearancePreference;
  /** Live values during a gesture, seen only by preview scopes. */
  preview: Partial<ThemeAxes> | null;
  canUndo: boolean;
  canRedo: boolean;
}

export interface AppearanceStore {
  getSnapshot(): AppearanceSnapshot;
  subscribe(listener: () => void): () => void;
  selectTheme(id: string): void;
  setMode(mode: ModePreference): void;
  setAccess(patch: Partial<AccessPreference>): void;
  /** Applies a change to the whole app, as one undo step. */
  tweak(patch: Partial<ThemeAxes>): void;
  /** Gesture in progress: only preview scopes follow. Call commitPreview() on release. */
  preview(patch: Partial<ThemeAxes>): void;
  commitPreview(): void;
  cancelPreview(): void;
  /** Drops unsaved tweaks, returning to the theme as it was built or saved. */
  revert(): void;
  saveAs(name: string): SavedTheme | null;
  /** Writes current tweaks into the active saved theme. */
  updateSaved(): void;
  renameSaved(id: string, name: string): void;
  deleteSaved(id: string): void;
  undo(): void;
  redo(): void;
  resetAll(): void;
  flush(): void;
}

let nextId = 0;
const newThemeId = () => `custom-${Date.now().toString(36)}-${(nextId++).toString(36)}`;

function rememberColor(list: string[], hex: string | undefined) {
  if (!hex) return list;
  return [hex, ...list.filter((c) => c !== hex)].slice(0, MAX_RECENTS);
}

export function createAppearanceStore(storage?: PreferenceStorage): AppearanceStore {
  const load = (): AppearancePreference => {
    try {
      const raw = storage?.getItem(APPEARANCE_STORAGE_KEY);
      return raw ? normalizePreference(JSON.parse(raw)) : DEFAULT_PREFERENCE;
    } catch {
      return DEFAULT_PREFERENCE; // A corrupt record must never stop the app from starting.
    }
  };

  let preference = load();
  let preview: Partial<ThemeAxes> | null = null;
  const past: AppearancePreference[] = [];
  const future: AppearancePreference[] = [];
  let snapshot: AppearanceSnapshot = { preference, preview, canUndo: false, canRedo: false };
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = () => {
    if (timer) { clearTimeout(timer); timer = undefined; }
    try { storage?.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(preference)); } catch { /* Appearance still applies this session. */ }
  };
  const emit = () => {
    snapshot = { preference, preview, canUndo: past.length > 0, canRedo: future.length > 0 };
    listeners.forEach((listener) => listener());
  };
  const commit = (next: AppearancePreference, undoable = true) => {
    if (undoable) { past.push(preference); if (past.length > HISTORY_LIMIT) past.shift(); future.length = 0; }
    preference = next;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, PERSIST_DELAY_MS);
    emit();
  };
  const withRecents = (next: AppearancePreference, patch: Partial<ThemeAxes>): AppearancePreference => ({
    ...next,
    recents: {
      accents: rememberColor(next.recents.accents, patch.accentHex),
      grounds: rememberColor(rememberColor(next.recents.grounds, patch.groundDay), patch.groundNight),
    },
  });

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    selectTheme(id) {
      const exists = id in THEME_PRESETS || preference.saved.some((t) => t.id === id);
      if (exists) commit({ ...preference, themeId: id, overrides: {} });
    },
    setMode(mode) { commit({ ...preference, mode }); },
    setAccess(patch) { commit(normalizePreference({ ...preference, access: { ...preference.access, ...patch } })); },
    tweak(patch) { commit(withRecents(normalizePreference({ ...preference, overrides: { ...preference.overrides, ...patch } }), patch)); },
    preview(patch) { preview = { ...preview, ...patch }; emit(); },
    commitPreview() {
      if (!preview) return;
      const patch = preview;
      preview = null;
      commit(withRecents(normalizePreference({ ...preference, overrides: { ...preference.overrides, ...patch } }), patch));
    },
    cancelPreview() { if (preview) { preview = null; emit(); } },
    revert() { if (Object.keys(preference.overrides).length) commit({ ...preference, overrides: {} }); },
    saveAs(name) {
      const trimmed = name.trim().slice(0, 40);
      if (!trimmed || preference.saved.length >= MAX_SAVED_THEMES) return null;
      const active = preference.saved.find((t) => t.id === preference.themeId);
      const baseId: PresetId = active?.baseId ?? (preference.themeId as PresetId);
      const theme: SavedTheme = { id: newThemeId(), name: trimmed, baseId, axes: resolveAxes(preference) };
      commit({ ...preference, saved: [...preference.saved, theme], themeId: theme.id, overrides: {} });
      flush();
      return theme;
    },
    updateSaved() {
      const axes = resolveAxes(preference);
      if (preference.saved.some((t) => t.id === preference.themeId)) commit({ ...preference, saved: preference.saved.map((t) => (t.id === preference.themeId ? { ...t, axes } : t)), overrides: {} });
    },
    renameSaved(id, name) {
      const trimmed = name.trim().slice(0, 40);
      if (trimmed) commit({ ...preference, saved: preference.saved.map((t) => (t.id === id ? { ...t, name: trimmed } : t)) });
    },
    deleteSaved(id) {
      const removingActive = preference.themeId === id;
      const removed = preference.saved.find((t) => t.id === id);
      commit({ ...preference, saved: preference.saved.filter((t) => t.id !== id), themeId: removingActive ? (removed?.baseId ?? "signature") : preference.themeId, overrides: removingActive ? {} : preference.overrides });
    },
    undo() { const last = past.pop(); if (last) { future.push(preference); commit(last, false); } },
    redo() { const next = future.pop(); if (next) { past.push(preference); commit(next, false); } },
    resetAll() { commit({ ...DEFAULT_PREFERENCE, saved: preference.saved }); },
    flush,
  };
}
