"use client";

import { useState, useEffect } from "react";
import { Moon, Sun, Check, Save, Undo2, Sparkles } from "lucide-react";
import BackToSettings from "@/app/components/BackToSettings";
import {
  applyAppMode,
  applyGlobalTheme,
  applyGlobalBackground,
} from "@/app/components/GlobalSystemWrapper";
import { useAuth } from "@/app/components/AuthProvider";
import {
  resolveLegacyTheme,
  resolveLegacyBackground,
  DEFAULT_ACCENT_HEX,
  DEFAULT_DARK_BG_HEX,
  DEFAULT_LIGHT_BG_HEX,
} from "@/lib/color-utils";
import { ColorPickerBoard } from "./ColorPickerBoard";
import { MiniDashboardPreview } from "./MiniDashboardPreview";
import styles from "../../components/SystemHubPage.module.css";

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

export function AppearanceSettingsScreen() {
  const { user, mutateUser } = useAuth();

  // Canonical applied state (currently active in app)
  // Server-safe initial states ensuring byte-identical SSR and initial client hydration
  const [appliedMode, setAppliedMode] = useState<"light" | "dark">("dark");
  const [appliedAccent, setAppliedAccent] = useState<string>(() => resolveLegacyTheme(user?.activeTheme));
  const [appliedBackground, setAppliedBackground] = useState<string>(() =>
    resolveLegacyBackground(user?.activeBackground, "dark")
  );

  // Working draft state (edited on the page, committed ONLY when user clicks Save)
  const [draftMode, setDraftMode] = useState<"light" | "dark">("dark");
  const [draftAccent, setDraftAccent] = useState<string>(() => resolveLegacyTheme(user?.activeTheme));
  const [draftBackground, setDraftBackground] = useState<string>(() =>
    resolveLegacyBackground(user?.activeBackground, "dark")
  );

  const [recentAccents, setRecentAccents] = useState<string[]>([]);
  const [recentBgs, setRecentBgs] = useState<string[]>([]);

  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Mount sync: load user preferences from localStorage on client after hydration
  useEffect(() => {
    const curMode = (localStorage.getItem("app_mode") as "light" | "dark") || "dark";
    const rawTheme = user?.activeTheme || localStorage.getItem("app_theme") || DEFAULT_ACCENT_HEX;
    const resolvedTheme = resolveLegacyTheme(rawTheme);
    const rawBg =
      user?.activeBackground ||
      localStorage.getItem("app_background") ||
      (curMode === "light" ? DEFAULT_LIGHT_BG_HEX : DEFAULT_DARK_BG_HEX);
    const resolvedBg = resolveLegacyBackground(rawBg, curMode);

    setAppliedMode(curMode);
    setDraftMode(curMode);
    setAppliedAccent(resolvedTheme);
    setDraftAccent(resolvedTheme);
    setAppliedBackground(resolvedBg);
    setDraftBackground(resolvedBg);

    try {
      const storedAccents = JSON.parse(localStorage.getItem("sylf_recent_accents") || "[]");
      if (Array.isArray(storedAccents)) setRecentAccents(storedAccents);
    } catch {}

    try {
      const storedBgs = JSON.parse(localStorage.getItem("sylf_recent_bgs") || "[]");
      if (Array.isArray(storedBgs)) setRecentBgs(storedBgs);
    } catch {}
  }, [user?.activeTheme, user?.activeBackground]);

  // Listen for storage events from other tabs
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "app_mode" && (e.newValue === "light" || e.newValue === "dark")) {
        setAppliedMode(e.newValue);
        setDraftMode(e.newValue);
      } else if (e.key === "app_theme" && e.newValue) {
        const resolved = resolveLegacyTheme(e.newValue);
        setAppliedAccent(resolved);
        setDraftAccent(resolved);
      } else if (e.key === "app_background" && e.newValue) {
        const curMode = (localStorage.getItem("app_mode") as "light" | "dark") || "dark";
        const resolved = resolveLegacyBackground(e.newValue, curMode);
        setAppliedBackground(resolved);
        setDraftBackground(resolved);
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const hasChanges =
    draftMode !== appliedMode ||
    draftAccent.toLowerCase() !== appliedAccent.toLowerCase() ||
    draftBackground.toLowerCase() !== appliedBackground.toLowerCase();

  // Handle draft mode change
  const handleDraftModeChange = (newMode: "light" | "dark") => {
    if (newMode === draftMode) return;
    setDraftMode(newMode);

    const isDarkPreset =
      DARK_BG_PRESETS.some((p) => p.hex.toLowerCase() === draftBackground.toLowerCase()) ||
      draftBackground.toLowerCase() === DEFAULT_DARK_BG_HEX.toLowerCase();

    const isLightPreset =
      LIGHT_BG_PRESETS.some((p) => p.hex.toLowerCase() === draftBackground.toLowerCase()) ||
      draftBackground.toLowerCase() === DEFAULT_LIGHT_BG_HEX.toLowerCase();

    if (newMode === "light" && isDarkPreset) {
      setDraftBackground(DEFAULT_LIGHT_BG_HEX);
    } else if (newMode === "dark" && isLightPreset) {
      setDraftBackground(DEFAULT_DARK_BG_HEX);
    }
  };

  // Revert all draft changes to currently applied state
  const handleDiscard = () => {
    setDraftMode(appliedMode);
    setDraftAccent(appliedAccent);
    setDraftBackground(appliedBackground);
  };

  // Save & Apply Changes to the entire app and database
  const handleSaveAndApply = async () => {
    if (isSaving) return;
    setIsSaving(true);

    try {
      // 1. Commit to localStorage
      localStorage.setItem("app_mode", draftMode);
      localStorage.setItem("app_theme", draftAccent);
      localStorage.setItem("app_background", draftBackground);

      // 2. Apply globally across the application DOM
      applyAppMode(draftMode);
      applyGlobalTheme(draftAccent);
      applyGlobalBackground(draftBackground, draftMode);

      // 3. Dispatch events to sync active UI components
      window.dispatchEvent(new Event("mode-updated"));
      window.dispatchEvent(new Event("theme-updated"));
      window.dispatchEvent(new Event("background-updated"));

      // 4. Update applied state
      setAppliedMode(draftMode);
      setAppliedAccent(draftAccent);
      setAppliedBackground(draftBackground);

      // 5. Update recents lists
      setRecentAccents((prev) => {
        const filtered = prev.filter((c) => c.toLowerCase() !== draftAccent.toLowerCase());
        const next = [draftAccent, ...filtered].slice(0, 6);
        localStorage.setItem("sylf_recent_accents", JSON.stringify(next));
        return next;
      });

      setRecentBgs((prev) => {
        const filtered = prev.filter((c) => c.toLowerCase() !== draftBackground.toLowerCase());
        const next = [draftBackground, ...filtered].slice(0, 6);
        localStorage.setItem("sylf_recent_bgs", JSON.stringify(next));
        return next;
      });

      // 6. Persist to API
      await Promise.all([
        fetch("/api/cosmetics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category: "THEME", itemKey: draftAccent }),
        }),
        fetch("/api/cosmetics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category: "BACKGROUND", itemKey: draftBackground }),
        }),
      ])
        .then(async ([resTheme, resBackground]) => {
          if (resTheme.ok && resBackground.ok) {
            const data = await resTheme.json().catch(() => ({}));
            if (data.user) mutateUser({ ...data.user, activeTheme: draftAccent, activeBackground: draftBackground });
          }
        })
        .catch(console.error);

      setSaveStatus("Appearance saved & applied successfully");
      setTimeout(() => setSaveStatus(null), 3500);
    } catch (err) {
      console.error("Failed to apply appearance:", err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={styles.hubContainer}>
      <div className={styles.topGlow} aria-hidden="true" />
      <div className={`${styles.contentWrapper} flex flex-col gap-8 pb-32`}>
        {/* ─── Header & Breadcrumb ─────────────────────────────────── */}
        <div>
          <BackToSettings />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-4">
          <div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-1,var(--bg-abyss))]/60 text-xs font-['Rajdhani'] font-bold tracking-widest text-[var(--accent-text,var(--accent-primary))] uppercase mb-2">
              <Sparkles className="w-3.5 h-3.5" />
              <span>System Settings &rarr; Appearance</span>
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold font-['Rajdhani'] uppercase tracking-wider text-[var(--text-primary)]">
              Appearance
            </h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-xl">
              Customize your application mode, accent color, and canvas background.
              Changes preview below in real-time and apply across the entire system when saved.
            </p>
          </div>

          {/* Quick save status feedback */}
          {saveStatus && (
            <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[var(--accent-primary-dim)] border border-[var(--accent-primary-mid)] text-[var(--text-primary)] text-xs font-semibold shadow-md animate-fadeIn self-start sm:self-auto">
              <Check className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
              <span>{saveStatus}</span>
            </div>
          )}
        </div>
      </div>

      {/* ─── Live HUD Preview ────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full animate-pulse shrink-0"
              style={{
                backgroundColor: draftAccent,
                boxShadow: `0 0 8px ${draftAccent}`,
              }}
            />
            <h2 className="text-xs sm:text-sm font-bold font-['Rajdhani'] uppercase tracking-wider text-[var(--text-muted)]">
              Live HUD Preview
            </h2>
          </div>
          <span className="text-xs font-mono text-[var(--text-secondary)]">
            {hasChanges ? "Previewing unsaved draft" : "Reflecting active system"}
          </span>
        </div>

        <MiniDashboardPreview
          mode={draftMode}
          accentHex={draftAccent}
          canvasHex={draftBackground}
        />
      </section>

      {/* ─── 1. App Mode ─────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold font-['Rajdhani'] uppercase tracking-wider text-[var(--text-muted)]">
          1. App Mode
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 max-w-md">
          <button
            type="button"
            onClick={() => handleDraftModeChange("dark")}
            className={`flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl border text-sm font-semibold transition-all cursor-pointer ${
              draftMode === "dark"
                ? "border-[var(--accent-primary)] bg-[var(--accent-primary-dim)] text-[var(--text-primary)] shadow-sm ring-1 ring-[var(--accent-primary)]"
                : "border-[var(--border-subtle)] bg-[var(--surface-1,var(--bg-abyss))]/80 text-[var(--text-secondary)] hover:border-[var(--accent-primary-mid)] hover:text-[var(--text-primary)]"
            }`}
          >
            <Moon className="w-4 h-4" />
            <span>Dark</span>
          </button>

          <button
            type="button"
            onClick={() => handleDraftModeChange("light")}
            className={`flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl border text-sm font-semibold transition-all cursor-pointer ${
              draftMode === "light"
                ? "border-[var(--accent-primary)] bg-[var(--accent-primary-dim)] text-[var(--text-primary)] shadow-sm ring-1 ring-[var(--accent-primary)]"
                : "border-[var(--border-subtle)] bg-[var(--surface-1,var(--bg-abyss))]/80 text-[var(--text-secondary)] hover:border-[var(--accent-primary-mid)] hover:text-[var(--text-primary)]"
            }`}
          >
            <Sun className="w-4 h-4" />
            <span>Light</span>
          </button>
        </div>
      </section>

      {/* ─── 2. Accent Color ─────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold font-['Rajdhani'] uppercase tracking-wider text-[var(--text-muted)]">
          2. Accent Color
        </h2>
        <ColorPickerBoard
          label="Accent Color"
          description="Controls primary actions, active navigation, progress indicators, selected borders, and glow highlights."
          value={draftAccent}
          defaultValue={DEFAULT_ACCENT_HEX}
          onChange={(hex) => setDraftAccent(hex)}
          presets={ACCENT_PRESETS}
          recentColors={recentAccents}
        />
      </section>

      {/* ─── 3. Background Color ─────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold font-['Rajdhani'] uppercase tracking-wider text-[var(--text-muted)]">
          3. Background Color
        </h2>
        <ColorPickerBoard
          label="Background Color"
          description="Sets the solid canvas backdrop. Surface cards and text adapt automatically to preserve readability and contrast."
          value={draftBackground}
          defaultValue={draftMode === "light" ? DEFAULT_LIGHT_BG_HEX : DEFAULT_DARK_BG_HEX}
          onChange={(hex) => setDraftBackground(hex)}
          presets={draftMode === "light" ? LIGHT_BG_PRESETS : DARK_BG_PRESETS}
          recentColors={recentBgs}
        />
      </section>

      {/* ─── Sticky Bottom Action Bar ────────────────────────────── */}
      <div className="sticky bottom-6 z-30 p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1,var(--bg-abyss))]/95 text-[var(--text-primary)] backdrop-blur-xl shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4 transition-all">
        <div className="flex items-center gap-3">
          <div
            className={`w-3 h-3 rounded-full ${
              hasChanges ? "bg-[var(--accent-primary)] animate-pulse" : "bg-emerald-500"
            }`}
          />
          <div>
            <p className="text-xs sm:text-sm font-bold font-['Rajdhani'] uppercase tracking-wider text-[var(--text-primary)]">
              {hasChanges ? "Unsaved Appearance Changes" : "Canonical Appearance Active"}
            </p>
            <p className="text-xs text-[var(--text-muted)] hidden sm:block">
              {hasChanges
                ? "Click Apply Changes to update the entire application and persist your settings."
                : "All current theme, accent, and canvas preferences are applied."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
          {hasChanges && (
            <button
              type="button"
              onClick={handleDiscard}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-[var(--border-subtle)] hover:border-red-500/50 hover:bg-red-500/10 text-xs font-semibold text-[var(--text-secondary)] hover:text-red-400 transition-all cursor-pointer"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>Discard</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleSaveAndApply}
            disabled={!hasChanges || isSaving}
            className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-['Rajdhani'] font-bold uppercase tracking-wider transition-all shadow-md cursor-pointer ${
              hasChanges && !isSaving
                ? "bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-foreground,#ffffff)] shadow-[0_0_20px_var(--accent-muted)] active:scale-98"
                : "bg-[var(--surface-2,var(--bg-shadow))] border border-[var(--border-subtle)] text-[var(--text-muted)] cursor-not-allowed opacity-60"
            }`}
          >
            {isSaving ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Applying...</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Save & Apply Changes</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
    </div>
  );
}
