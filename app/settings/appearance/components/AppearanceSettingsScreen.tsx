"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Check, Moon, Sun, Undo2 } from "lucide-react";
import { AppearanceHubLayout } from "../../components/AppearanceHubLayout";
import {
  applyAppMode,
  applyGlobalTheme,
  applyGlobalBackground,
  markLocalAppearanceWrite,
} from "@/app/components/GlobalSystemWrapper";
import { useAuth } from "@/app/components/AuthProvider";
import {
  resolveLegacyTheme,
  resolveLegacyBackground,
  getRecommendedModeForBackground,
  DEFAULT_ACCENT_HEX,
  DEFAULT_DARK_BG_HEX,
  DEFAULT_LIGHT_BG_HEX,
  isValidHex,
} from "@/lib/color-utils";
import { ColorPickerBoard } from "./ColorPickerBoard";
import { MiniDashboardPreview } from "./MiniDashboardPreview";
import hub from "../../components/MainHub.module.css";
import styles from "./AppearanceSettingsScreen.module.css";
const ACCENT_PRESETS = [
  { name: "System Purple", hex: "#7c3aed" },
  { name: "Electric Cyan", hex: "#06b6d4" },
  { name: "Emerald", hex: "#10b981" },
  { name: "Rose", hex: "#ec4899" },
  { name: "Amber Gold", hex: "#f59e0b" },
  { name: "Crimson", hex: "#ef4444" },
  { name: "Neon Lime", hex: "#84cc16" },
  { name: "Royal Indigo", hex: "#6366f1" },
];

const DARK_BG_PRESETS = [
  { name: "Pure Black", hex: "#000000" },
  { name: "Night Slate", hex: "#0f172a" },
  { name: "Abyssal Navy", hex: "#0a0f1d" },
  { name: "Midnight", hex: "#121218" },
  { name: "Deep Void", hex: "#090d16" },
];

const LIGHT_BG_PRESETS = [
  { name: "Clean Light", hex: "#f8fafc" },
  { name: "Pure White", hex: "#ffffff" },
  { name: "Soft Fog", hex: "#f1f5f9" },
  { name: "Cool Zinc", hex: "#e2e8f0" },
];

interface Preference {
  mode: "light" | "dark";
  accent: string;
  background: string;
}
const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
function readLocal(key: string): string | null {
  try {
    return typeof window === "undefined" ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}
function readPreference(theme?: string, background?: string): Preference {
  const rawBackground = background || readLocal("app_background");
  const storedMode = readLocal("app_mode");
  const mode =
    storedMode === "light" || storedMode === "dark"
      ? storedMode
      : getRecommendedModeForBackground(rawBackground, "dark");
  return {
    mode,
    accent: resolveLegacyTheme(theme || readLocal("app_theme")),
    background: resolveLegacyBackground(rawBackground, mode),
  };
}
function readRecent(key: string): string[] {
  try {
    const value =
      typeof window === "undefined"
        ? []
        : JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value)
      ? value
          .filter(
            (item): item is string =>
              typeof item === "string" && isValidHex(item)
          )
          .slice(0, 6)
      : [];
  } catch {
    return [];
  }
}

export function AppearanceSettingsScreen() {
  const { user, mutateUser } = useAuth();
  const ready = useSyncExternalStore(subscribe, clientReady, serverReady);
  const source = `${user?.id}:${user?.activeTheme}:${user?.activeBackground}`;
  const [state, setState] = useState(() => {
    const preference = readPreference(
      user?.activeTheme,
      user?.activeBackground
    );
    return {
      source,
      userId: user?.id,
      applied: preference,
      draft: preference,
      userEdited: false,
      locallySaved: false,
    };
  });
  if (state.source !== source) {
    const preference = readPreference(
      user?.activeTheme,
      user?.activeBackground
    );
    const isAccountSwitch =
      state.userId !== undefined && user?.id !== state.userId;
    if (state.locallySaved && !isAccountSwitch) {
      const serverCaughtUp =
        preference.accent === state.applied.accent &&
        preference.background === state.applied.background;
      setState({
        ...state,
        source,
        userId: user?.id,
        locallySaved: !serverCaughtUp,
      });
    } else if (state.userEdited && !isAccountSwitch) {
      setState({
        ...state,
        source,
        userId: user?.id,
        applied: preference,
      });
    } else {
      setState({
        source,
        userId: user?.id,
        applied: preference,
        draft: preference,
        userEdited: false,
        locallySaved: false,
      });
    }
  }
  const { draft, applied } = state;
  const [recentAccents, setRecentAccents] = useState(() =>
    readRecent("sylf_recent_accents")
  );
  const [recentBgs, setRecentBgs] = useState(() =>
    readRecent("sylf_recent_bgs")
  );
  const [isSaving, setIsSaving] = useState(false);
  const [syncFailed, setSyncFailed] = useState(false);
  const [status, setStatus] = useState("");
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (
        !event.newValue ||
        !["app_mode", "app_theme", "app_background"].includes(event.key || "")
      )
        return;
      setState((current) => {
        const next = { ...current.applied };
        if (
          event.key === "app_mode" &&
          (event.newValue === "light" || event.newValue === "dark")
        )
          next.mode = event.newValue;
        if (event.key === "app_theme")
          next.accent = resolveLegacyTheme(event.newValue);
        if (event.key === "app_background")
          next.background = resolveLegacyBackground(event.newValue, next.mode);
        return {
          ...current,
          applied: next,
          draft: next,
          userEdited: false,
        };
      });
      setSyncFailed(false);
      setStatus("");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const hasChanges =
    draft.mode !== applied.mode ||
    draft.accent.toLowerCase() !== applied.accent.toLowerCase() ||
    draft.background.toLowerCase() !== applied.background.toLowerCase();
  const edit = (patch: Partial<Preference>) => {
    setState((current) => ({
      ...current,
      draft: { ...current.draft, ...patch },
      userEdited: true,
    }));
    setStatus("");
  };
  const changeMode = (mode: Preference["mode"]) => {
    if (mode === draft.mode) return;
    const presets =
      mode === "light"
        ? [...DARK_BG_PRESETS, { hex: DEFAULT_DARK_BG_HEX }]
        : [...LIGHT_BG_PRESETS, { hex: DEFAULT_LIGHT_BG_HEX }];
    edit({
      mode,
      ...(presets.some(
        (preset) => preset.hex.toLowerCase() === draft.background.toLowerCase()
      )
        ? {
            background:
              mode === "light" ? DEFAULT_LIGHT_BG_HEX : DEFAULT_DARK_BG_HEX,
          }
        : {}),
    });
  };
  const save = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setStatus("");
    const next = { ...draft };
    let locallyApplied = false;
    try {
      markLocalAppearanceWrite();
      localStorage.setItem("app_mode", next.mode);
      localStorage.setItem("app_theme", next.accent);
      localStorage.setItem("app_background", next.background);
      applyAppMode(next.mode);
      applyGlobalBackground(next.background, next.mode);
      applyGlobalTheme(next.accent);
      for (const name of [
        "mode-updated",
        "background-updated",
        "theme-updated",
      ])
        window.dispatchEvent(new Event(name));
      setState((current) => ({
        ...current,
        applied: next,
        draft: next,
        userEdited: false,
        locallySaved: true,
      }));
      locallyApplied = true;
      const accents = [
        next.accent,
        ...recentAccents.filter(
          (color) => color.toLowerCase() !== next.accent.toLowerCase()
        ),
      ].slice(0, 6);
      const backgrounds = [
        next.background,
        ...recentBgs.filter(
          (color) => color.toLowerCase() !== next.background.toLowerCase()
        ),
      ].slice(0, 6);
      setRecentAccents(accents);
      setRecentBgs(backgrounds);
      try {
        localStorage.setItem("sylf_recent_accents", JSON.stringify(accents));
        localStorage.setItem("sylf_recent_bgs", JSON.stringify(backgrounds));
      } catch {
        /* Recents are optional; the appearance itself is already saved. */
      }
      const responses = await Promise.all([
        fetch("/api/cosmetics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category: "THEME", itemKey: next.accent }),
        }),
        fetch("/api/cosmetics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category: "BACKGROUND",
            itemKey: next.background,
          }),
        }),
      ]);
      if (responses.some((response) => !response.ok))
        throw new Error("Account sync failed");
      mutateUser({
        activeTheme: next.accent,
        activeBackground: next.background,
      });
      setSyncFailed(false);
      setStatus("Appearance saved");
    } catch {
      setSyncFailed(true);
      setStatus(
        locallyApplied
          ? "Applied on this device. Account sync failed—please try again."
          : "Couldn’t save your appearance. Please try again."
      );
    } finally {
      setIsSaving(false);
    }
  };
  return (
    <AppearanceHubLayout title="Appearance">
      {ready && (
        <>
          <div className={styles.editor}>
            <fieldset className={styles.controls} disabled={isSaving}>
              <section className={styles.modeSection}>
                <div className={styles.sectionTitle}>
                  <h2>App mode</h2>
                  <p>Choose your starting atmosphere.</p>
                </div>
                <div className={styles.modes}>
                  {(["light", "dark"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={draft.mode === mode}
                      onClick={() => changeMode(mode)}
                    >
                      <span
                        className={`${styles.modeSample} ${mode === "dark" ? styles.darkSample : styles.lightSample}`}
                        aria-hidden="true"
                      >
                        <i />
                        <span>
                          <b />
                          <b />
                          <b />
                        </span>
                      </span>
                      <span>
                        {mode === "light" ? (
                          <Sun size={14} />
                        ) : (
                          <Moon size={14} />
                        )}
                        {mode === "light" ? "Light" : "Dark"}
                        {draft.mode === mode && (
                          <Check size={13} className={styles.modeCheck} />
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
              <section className={styles.colorSection}>
                <ColorPickerBoard
                  label="Accent Color"
                  description="A signature color for actions and highlights."
                  value={draft.accent}
                  defaultValue={DEFAULT_ACCENT_HEX}
                  onChange={(accent) => edit({ accent })}
                  presets={ACCENT_PRESETS}
                  recentColors={recentAccents}
                />
              </section>
              <section className={styles.colorSection}>
                <ColorPickerBoard
                  label="Background Color"
                  description="Your canvas. Text and surfaces adapt to it."
                  value={draft.background}
                  defaultValue={
                    draft.mode === "light"
                      ? DEFAULT_LIGHT_BG_HEX
                      : DEFAULT_DARK_BG_HEX
                  }
                  onChange={(background) => edit({ background })}
                  presets={
                    draft.mode === "light" ? LIGHT_BG_PRESETS : DARK_BG_PRESETS
                  }
                  recentColors={recentBgs}
                />
              </section>
            </fieldset>
            <section
              className={styles.previewSection}
              aria-label="Appearance preview"
            >
              <div className={styles.previewTitle}>
                <span>
                  <i />
                  Live preview
                </span>
                <small>
                  {hasChanges ? "Unsaved draft" : "Current appearance"}
                </small>
              </div>
              <MiniDashboardPreview
                mode={draft.mode}
                accentHex={draft.accent}
                canvasHex={draft.background}
              />
              <div className={styles.previewCaption}>
                <span style={{ background: draft.accent }} />
                <p>
                  Your color, carried through Sylf.
                  <small>
                    Changes stay in this preview until you apply them.
                  </small>
                </p>
              </div>
            </section>
          </div>
          <div
            className={`${styles.actionBar} ${hasChanges || syncFailed ? styles.pendingBar : ""}`}
          >
            <div className={styles.status}>
              <span className={styles.statusDot} />
              <p role="status">
                {status ||
                  (hasChanges
                    ? "Unsaved changes"
                    : "Your appearance is up to date")}
              </p>
            </div>
            <div className={styles.actions}>
              {hasChanges && (
                <button
                  className={hub.secondaryButton}
                  disabled={isSaving}
                  onClick={() => {
                    setState((current) => ({
                      ...current,
                      draft: current.applied,
                      userEdited: false,
                    }));
                    setStatus("");
                  }}
                >
                  <Undo2 size={14} />
                  Discard
                </button>
              )}
              <button
                className={hub.primaryButton}
                disabled={(!hasChanges && !syncFailed) || isSaving}
                onClick={() => {
                  void save();
                }}
              >
                {isSaving
                  ? "Applying…"
                  : syncFailed && !hasChanges
                    ? "Retry sync"
                    : "Apply changes"}
                {!isSaving && <Check size={14} />}
              </button>
            </div>
          </div>
        </>
      )}
    </AppearanceHubLayout>
  );
}
