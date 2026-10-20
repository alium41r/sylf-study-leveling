"use client";

import React from "react";
import Companion from "@/app/components/landing/companion/Companion";
import { Moon, Sun, Check, ArrowRight, ArrowLeft } from "lucide-react";
import { getAccentForeground as getContrastForeground } from "@/lib/color-utils";
import styles from "../Onboarding.module.css";

interface AppearanceStepProps {
  selectedMode: "dark" | "light";
  selectedAccent: string;
  selectedBackground: string;
  onSelectMode: (mode: "dark" | "light") => void;
  onSelectAccent: (hex: string) => void;
  onSelectBackground: (bgId: string) => void;
  onNext: () => void;
  onPrev: () => void;
}

export const ACCENT_PRESETS = [
  { name: "System Purple", hex: "#7c3aed" },
  { name: "Electric Cyan", hex: "#06b6d4" },
  { name: "Emerald", hex: "#10b981" },
  { name: "Rose", hex: "#ec4899" },
  { name: "Amber Gold", hex: "#f59e0b" },
  { name: "Crimson", hex: "#ef4444" },
  { name: "Neon Lime", hex: "#84cc16" },
  { name: "Royal Indigo", hex: "#6366f1" },
];

export const BACKGROUND_PRESETS = [
  {
    id: "simple",
    name: "Pure Canvas",
    desc: "Minimalist distraction-free canvas (OLED black / pure white)",
  },
  {
    id: "void",
    name: "Deep Void",
    desc: "Atmospheric darkness with subtle ambient glow",
  },
];

export function AppearanceStep({
  selectedMode,
  selectedAccent,
  selectedBackground,
  onSelectMode,
  onSelectAccent,
  onSelectBackground,
  onNext,
  onPrev,
}: AppearanceStepProps) {
  return (
    <div className={styles.stepCard}>
      {/* ─── Companion Header ─── */}
      <div className={styles.stepHeader}>
        <div className="flex items-center justify-center my-1">
          <Companion state="PLANNING" size={110} />
        </div>
        <span className={styles.stepEyebrow}>Interface Calibration</span>
        <h1 className={styles.stepTitle}>Personalize your workspace</h1>
        <p className={styles.stepSubtitle}>
          Choose your interface contrast and aura. You can adjust these anytime in System Settings.
        </p>
      </div>

      {/* ─── Mode Selection (Dark / Light) ─── */}
      <div className="flex flex-col gap-2">
        <label className={styles.label}>
          <span>Interface Contrast</span>
        </label>
        <div className={styles.modeCardGrid} role="radiogroup" aria-label="Interface mode">
          <button
            type="button"
            role="radio"
            aria-checked={selectedMode === "dark"}
            onClick={() => onSelectMode("dark")}
            className={`${styles.modeCard} ${selectedMode === "dark" ? styles.modeCardSelected : ""}`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-black/60 border border-white/10 flex items-center justify-center text-accent shadow-inner">
                <Moon className="w-5 h-5" aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-['Rajdhani'] font-bold text-sm text-ink m-0">Dark Mode (Default)</h3>
                <p className="text-xs text-muted m-0">Stealth atmosphere & focused contrast</p>
              </div>
            </div>
            <div
              className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                selectedMode === "dark" ? "border-accent bg-accent-strong text-accent-fg" : "border-[var(--subtle-line)]"
              }`}
            >
              {selectedMode === "dark" && <Check className="w-3 h-3 stroke-[3]" />}
            </div>
          </button>

          <button
            type="button"
            role="radio"
            aria-checked={selectedMode === "light"}
            onClick={() => onSelectMode("light")}
            className={`${styles.modeCard} ${selectedMode === "light" ? styles.modeCardSelected : ""}`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-amber-500 shadow-inner">
                <Sun className="w-5 h-5" aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-['Rajdhani'] font-bold text-sm text-ink m-0">Light Mode</h3>
                <p className="text-xs text-muted m-0">Clean daylight & high readability</p>
              </div>
            </div>
            <div
              className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                selectedMode === "light" ? "border-accent bg-accent-strong text-accent-fg" : "border-[var(--subtle-line)]"
              }`}
            >
              {selectedMode === "light" && <Check className="w-3 h-3 stroke-[3]" />}
            </div>
          </button>
        </div>
      </div>

      {/* ─── Accent Color Picker ─── */}
      <div className="flex flex-col gap-2">
        <label className={styles.label}>
          <span>Core System Aura (Accent Tint)</span>
        </label>
        <div className={styles.accentSwatchesRow} role="radiogroup" aria-label="System accent tint">
          {ACCENT_PRESETS.map((preset) => {
            const isSelected = selectedAccent.toLowerCase() === preset.hex.toLowerCase();
            return (
              <button
                key={preset.hex}
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-label={`Accent color ${preset.name}`}
                title={preset.name}
                onClick={() => onSelectAccent(preset.hex)}
                className={`${styles.swatchBtn} ${isSelected ? styles.swatchBtnSelected : ""}`}
                style={{
                  backgroundColor: preset.hex,
                  color: getContrastForeground(preset.hex),
                }}
              >
                {isSelected && <Check className="w-4 h-4 stroke-[3]" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Compact Canvas Background ─── */}
      <div className="flex flex-col gap-2">
        <label className={styles.label}>
          <span>Environment Atmosphere</span>
        </label>
        <div className={styles.modeCardGrid} role="radiogroup" aria-label="Environment atmosphere">
          {BACKGROUND_PRESETS.map((bg) => {
            const isSelected = selectedBackground === bg.id;
            return (
              <button
                key={bg.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => onSelectBackground(bg.id)}
                className={`${styles.modeCard} ${isSelected ? styles.modeCardSelected : ""}`}
              >
                <div>
                  <h3 className="font-['Rajdhani'] font-bold text-sm text-ink m-0">{bg.name}</h3>
                  <p className="text-xs text-muted m-0">{bg.desc}</p>
                </div>
                <div
                  className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                    isSelected ? "border-accent bg-accent-strong text-accent-fg" : "border-[var(--subtle-line)]"
                  }`}
                >
                  {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Live Mini Preview ─── */}
      <div className={styles.previewBox} aria-hidden="true">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-accent-fg shrink-0 shadow-sm"
          style={{
            backgroundColor: selectedAccent,
            color: "var(--accent-foreground, #ffffff)",
          }}
        >
          <span className="font-['Rajdhani'] font-bold text-sm">Lv.1</span>
        </div>
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-['Rajdhani'] font-bold text-sm text-ink truncate">
              Preview: Daily Quest Complete
            </span>
            <span
              className="text-[10px] font-mono px-1.5 py-0.5 rounded font-bold uppercase"
              style={{
                backgroundColor: `${selectedAccent}25`,
                color: `var(--accent-text, ${selectedAccent})`,
                border: `1px solid ${selectedAccent}40`,
              }}
            >
              +150 XP
            </span>
          </div>
          <p className="text-xs text-muted m-0 truncate">
            {selectedMode === "dark" ? "Dark Mode" : "Light Mode"} • {selectedBackground === "simple" || selectedBackground === "pure-black" ? "Pure Canvas" : selectedBackground === "void" ? "Deep Void" : "Custom Canvas"}
          </p>
        </div>
      </div>

      {/* ─── Actions Bar ─── */}
      <div className={styles.actionsBar}>
        <button type="button" onClick={onPrev} className={styles.btnSecondary}>
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>Back</span>
        </button>

        <button
          type="button"
          onClick={onNext}
          className={styles.btnPrimary}
        >
          <span>Complete Setup</span>
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
