"use client";

import BackToSettings from "@/app/components/BackToSettings";
import { useState, useEffect } from "react";
import {
  Compass,
  Clock,
  Zap,
  Sparkles,
  Check,
  ChevronDown,
  Layers,
  Flame,
  Infinity,
  Tv,
  Brain,
  Sliders,
  BellRing,
  RotateCcw,
} from "lucide-react";
import styles from "../../components/SystemHubPage.module.css";

/* ─── Types ────────────────────────────────────────────────── */

interface StudyMode {
  id: string;
  name: string;
  description: string;
  bestFor: string;
  icon: React.ReactNode;
  color: string;
  settings: ModeSetting[];
  isActive?: boolean;
}

interface ModeSetting {
  key: string;
  label: string;
  type: "toggle" | "range" | "select";
  value: boolean | number | string;
  options?: string[];
  min?: number;
  max?: number;
  unit?: string;
}

/* ─── Toggle Switch ─────────────────────────────────────────── */

function ToggleSwitch({
  value,
  onChange,
  color,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  color: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={styles.toggleBtn}
      style={{
        backgroundColor: value ? color : "var(--toggle-off-bg)",
        boxShadow: value ? `0 0 12px ${color}55` : "none",
        borderColor: value ? color : "var(--toggle-off-border)",
      }}
    >
      <span
        className={styles.toggleThumb}
        style={{
          transform: value ? "translateX(21px)" : "translateX(2px)",
          backgroundColor: "var(--toggle-thumb)",
        }}
      />
    </button>
  );
}

/* ─── Range Slider ──────────────────────────────────────────── */

function RangeSlider({
  value,
  onChange,
  min,
  max,
  unit,
  color,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  unit?: string;
  color: string;
}) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));

  return (
    <div className="flex items-center gap-3 w-full">
      <div className="relative flex-1 flex items-center">
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={styles.rangeInput}
          style={{
            background: `linear-gradient(to right, ${color} 0%, ${color} ${pct}%, var(--track-bg) ${pct}%, var(--track-bg) 100%)`,
          }}
        />
      </div>
      <span
        className="font-['Rajdhani'] font-extrabold text-sm sm:text-base min-w-[58px] text-right shrink-0"
        style={{ color }}
      >
        {value}
        {unit || ""}
      </span>
    </div>
  );
}

/* ─── Quick Parameter Summary Chips ────────────────────────── */

function ModeSummaryChips({ mode }: { mode: StudyMode }) {
  if (mode.settings.length === 0) {
    return (
      <span className={styles.chip}>
        Stopwatch Mode
      </span>
    );
  }

  const chips: string[] = [];

  const focusSetting = mode.settings.find(
    (s) => s.key === "focusDuration" || s.key === "workDuration" || s.key === "sessionLength"
  );
  if (focusSetting) chips.push(`${focusSetting.value}${focusSetting.unit || "m"}`);

  const breakSetting = mode.settings.find(
    (s) => s.key === "shortBreak" || s.key === "breakDuration" || s.key === "rewardBreak" || s.key === "breakLength"
  );
  if (breakSetting) chips.push(`${breakSetting.value}${breakSetting.unit || "m"} break`);

  const cyclesSetting = mode.settings.find((s) => s.key === "cycles" || s.key === "totalSprints");
  if (cyclesSetting) chips.push(`${cyclesSetting.value} cycles`);

  return (
    <div className="hidden sm:flex items-center gap-1.5 flex-wrap">
      {chips.map((c) => (
        <span
          key={c}
          className={styles.chip}
        >
          {c}
        </span>
      ))}
    </div>
  );
}

/* ─── Mode Card ─────────────────────────────────────────────── */

function ModeCard({
  mode,
  isExpanded,
  onToggleExpand,
  onSettingChange,
  onActivate,
  delay,
}: {
  mode: StudyMode;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onSettingChange: (key: string, value: boolean | number | string) => void;
  onActivate: () => void;
  delay: number;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), Math.min(delay, 400));
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div
      className={`${styles.glassCard} transition-all duration-300 ${
        mode.isActive ? "border-[var(--line)] shadow-[0_0_24px_-4px_var(--accent-dim)]" : ""
      }`}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(12px)",
      }}
    >
      {/* Header Bar */}
      <div
        onClick={onToggleExpand}
        className="p-4 sm:p-5 flex items-center justify-between gap-3 sm:gap-4 cursor-pointer select-none hover:bg-[var(--sub-surface)] transition-colors"
      >
        <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
          {/* Mode Icon */}
          <div
            className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0 border transition-transform duration-200 group-hover:scale-105"
            style={{
              backgroundColor: `${mode.color}15`,
              borderColor: `${mode.color}40`,
              color: mode.color,
              boxShadow: mode.isActive ? `0 0 16px ${mode.color}35` : "none",
            }}
          >
            {mode.icon}
          </div>

          {/* Title & Metadata */}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-['Rajdhani'] font-extrabold text-base sm:text-lg text-[var(--text-primary)] uppercase tracking-wide leading-tight">
                {mode.name}
              </h3>
              {mode.isActive && (
                <span
                  className="px-2 py-0.5 rounded-full text-[9px] font-['Rajdhani'] font-extrabold uppercase tracking-widest flex items-center gap-1 shadow-sm"
                  style={{
                    backgroundColor: `${mode.color}25`,
                    borderColor: `${mode.color}60`,
                    borderWidth: "1px",
                    color: mode.color,
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: mode.color }} />
                  <span>Active</span>
                </span>
              )}
            </div>

            <p className="text-xs text-[var(--text-muted)] truncate max-w-md sm:max-w-xl mt-0.5">
              {mode.description}
            </p>

            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span
                className="text-[10px] font-['Rajdhani'] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border"
                style={{
                  color: mode.color,
                  borderColor: `${mode.color}33`,
                  backgroundColor: `${mode.color}10`,
                }}
              >
                {mode.bestFor}
              </span>
              <ModeSummaryChips mode={mode} />
            </div>
          </div>
        </div>

        {/* Chevron */}
        <div className="flex items-center gap-2 shrink-0">
          <ChevronDown
            className={`w-5 h-5 text-[var(--text-muted)] transition-transform duration-300 ${
              isExpanded ? "rotate-180 text-[var(--text-primary)]" : ""
            }`}
          />
        </div>
      </div>

      {/* Expanded Settings Drawer */}
      <div
        className={`transition-all duration-300 ease-in-out overflow-hidden ${
          isExpanded ? "max-h-[900px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="px-4 sm:px-6 pb-5 pt-2 border-t border-[var(--subtle-line)] flex flex-col gap-4">
          {mode.settings.length > 0 ? (
            <div className="flex flex-col divide-y divide-[var(--subtle-line)]">
              {mode.settings.map((setting) => (
                <div
                  key={setting.key}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-6"
                >
                  <div className="sm:max-w-xs">
                    <span className="font-['Rajdhani'] font-bold text-xs sm:text-sm text-[var(--text-primary)] uppercase tracking-wide">
                      {setting.label}
                    </span>
                  </div>

                  <div className="flex-1 flex justify-end">
                    {setting.type === "toggle" && (
                      <ToggleSwitch
                        value={setting.value as boolean}
                        onChange={(v) => onSettingChange(setting.key, v)}
                        color={mode.color}
                      />
                    )}

                    {setting.type === "range" && (
                      <div className="w-full sm:max-w-xs">
                        <RangeSlider
                          value={setting.value as number}
                          onChange={(v) => onSettingChange(setting.key, v)}
                          min={setting.min || 0}
                          max={setting.max || 100}
                          unit={setting.unit}
                          color={mode.color}
                        />
                      </div>
                    )}

                    {setting.type === "select" && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {setting.options?.map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => onSettingChange(setting.key, opt)}
                            className={`px-3 py-1 rounded-lg font-['Rajdhani'] font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
                              setting.value === opt
                                ? "text-white shadow-sm"
                                : `${styles.subRow} text-[var(--text-secondary)] hover:text-[var(--text-primary)]`
                            }`}
                            style={{
                              backgroundColor: setting.value === opt ? mode.color : undefined,
                            }}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-3">
              <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                Continuous stopwatch focus with manual pause and finish controls. No fixed countdown blocks, alarms, or interval limits. Study completely at your own rhythm.
              </p>
            </div>
          )}

          {/* Activate Protocol Button */}
          <div className="pt-2">
            <button
              type="button"
              onClick={onActivate}
              disabled={mode.isActive}
              className={`w-full py-2.5 rounded-xl font-['Rajdhani'] font-extrabold text-xs sm:text-sm uppercase tracking-widest transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 ${
                mode.isActive
                  ? `${styles.subRow} text-[var(--text-muted)] cursor-default`
                  : "hover:scale-[1.01] active:scale-[0.99] text-white shadow-md"
              }`}
              style={{
                backgroundColor: !mode.isActive ? mode.color : undefined,
                boxShadow: !mode.isActive ? `0 0 20px ${mode.color}40` : undefined,
              }}
            >
              {mode.isActive ? (
                <>
                  <Check className="w-4 h-4 text-emerald-500" />
                  <span>Protocol Currently Engaged</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  <span>Engage {mode.name} Protocol</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Default Study Modes Definitions ───────────────────────── */

const DEFAULT_MODES: StudyMode[] = [
  {
    id: "freeflow",
    name: "Free Flow",
    description: "Open-ended, unconstrained study session. Start when you're ready, pause as needed, and stop whenever you want.",
    bestFor: "Self-paced study & deep focus without alarms",
    color: "#10b981",
    icon: <Infinity className="w-5 h-5" />,
    settings: [],
  },
  {
    id: "pomodoro",
    name: "Pomodoro",
    description: "Classic time-boxing: focus blocks with short breaks, plus a long break every few rounds.",
    bestFor: "Beating procrastination & high momentum",
    color: "#ef4444",
    isActive: true,
    icon: <Clock className="w-5 h-5" />,
    settings: [
      { key: "focusDuration", label: "Focus Block Duration", type: "range", value: 25, min: 5, max: 90, unit: " min" },
      { key: "shortBreak", label: "Short Break Duration", type: "range", value: 5, min: 1, max: 15, unit: " min" },
      { key: "longBreak", label: "Long Recovery Break", type: "range", value: 15, min: 5, max: 30, unit: " min" },
      { key: "sessionsBeforeLong", label: "Rounds Before Long Break", type: "range", value: 4, min: 2, max: 8, unit: "" },
      { key: "autoStartBreaks", label: "Auto-start Break Timers", type: "toggle", value: true },
      { key: "autoStartFocus", label: "Auto-start Next Focus Round", type: "toggle", value: false },
      { key: "endChime", label: "Session Complete Chime", type: "toggle", value: true },
    ],
  },
  {
    id: "5217",
    name: "52/17 Rhythm",
    description: "The data-backed rhythm: 52 minutes of deep work, then a real 17-minute recovery break.",
    bestFor: "Full-day marathons & dense material",
    color: "#3b82f6",
    icon: <RotateCcw className="w-5 h-5" />,
    settings: [
      { key: "workDuration", label: "Work Block", type: "range", value: 52, min: 40, max: 70, unit: " min" },
      { key: "breakDuration", label: "Recovery Break", type: "range", value: 17, min: 10, max: 25, unit: " min" },
      { key: "cycles", label: "Target Cycles", type: "range", value: 3, min: 2, max: 6, unit: "" },
      { key: "autoStartBreaks", label: "Auto-start Recovery Breaks", type: "toggle", value: true },
      { key: "autoStartFocus", label: "Auto-start Next Cycle", type: "toggle", value: false },
      { key: "endChime", label: "Session Complete Chime", type: "toggle", value: true },
    ],
  },
  {
    id: "animedoro",
    name: "Animedoro",
    description: "Long focus blocks rewarded with a guilt-free fun break — watch an episode, scroll, or nap.",
    bestFor: "Reward-driven stamina & long sessions",
    color: "#ec4899",
    icon: <Tv className="w-5 h-5" />,
    settings: [
      { key: "focusDuration", label: "Focus Marathon", type: "range", value: 45, min: 30, max: 60, unit: " min" },
      { key: "rewardBreak", label: "Episode Reward Break", type: "range", value: 20, min: 10, max: 30, unit: " min" },
      { key: "cycles", label: "Rounds Planned", type: "range", value: 3, min: 2, max: 6, unit: "" },
      { key: "autoStartBreaks", label: "Auto-start Reward Break", type: "toggle", value: true },
      { key: "autoStartFocus", label: "Auto-start Next Work Round", type: "toggle", value: false },
      { key: "endChime", label: "Session Complete Chime", type: "toggle", value: true },
    ],
  },
  {
    id: "deepwork",
    name: "Deep Work",
    description: "One long, protected marathon block — optionally fullscreen — followed by a proper recovery break.",
    bestFor: "Final exams, research, and complex problem sets",
    color: "#a855f7",
    icon: <Brain className="w-5 h-5" />,
    settings: [
      { key: "sessionLength", label: "Protected Block Length", type: "range", value: 90, min: 30, max: 180, unit: " min" },
      { key: "breakLength", label: "Post-Session Recovery", type: "range", value: 20, min: 5, max: 30, unit: " min" },
      { key: "autoFullscreen", label: "Force Fullscreen Mode", type: "toggle", value: true },
      { key: "endChime", label: "Session Complete Chime", type: "toggle", value: true },
    ],
  },
  {
    id: "sprint",
    name: "Sprint Mode",
    description: "Short, intense bursts with micro-rests — cycle after cycle until the set is complete.",
    bestFor: "Rapid drills, vocabulary flashcards & reviews",
    color: "#f59e0b",
    icon: <Flame className="w-5 h-5" />,
    settings: [
      { key: "sprintDuration", label: "Sprint Duration", type: "range", value: 10, min: 5, max: 25, unit: " min" },
      { key: "restDuration", label: "Micro-Rest Duration", type: "range", value: 2, min: 1, max: 5, unit: " min" },
      { key: "totalSprints", label: "Set Quantity", type: "range", value: 6, min: 3, max: 12, unit: "" },
      { key: "intensity", label: "Audio Intensity Accent", type: "select", value: "High", options: ["Medium", "High", "Extreme"] },
      { key: "autoStartRests", label: "Auto-trigger Rest Intervals", type: "toggle", value: true },
      { key: "autoStartSprints", label: "Auto-trigger Next Sprint", type: "toggle", value: false },
      { key: "endChime", label: "Sprint End Chime", type: "toggle", value: true },
    ],
  },
  {
    id: "flowtime",
    name: "Flowtime",
    description: "No fixed blocks. Focus until you naturally slow down, then take a break sized to how long you lasted.",
    bestFor: "Creative writing, reading & uninterrupted flow",
    color: "#06b6d4",
    icon: <Compass className="w-5 h-5" />,
    settings: [
      { key: "reminderInterval", label: "Check-in Posture Reminder", type: "range", value: 45, min: 15, max: 90, unit: " min" },
      { key: "autoScaleBreak", label: "Proportional Break Calculation", type: "toggle", value: true },
      { key: "defaultBreak", label: "Baseline Break Length", type: "range", value: 10, min: 5, max: 20, unit: " min" },
      { key: "maxBreak", label: "Ceiling Recovery Break", type: "range", value: 20, min: 10, max: 30, unit: " min" },
      { key: "endChime", label: "Interval Chime", type: "toggle", value: true },
    ],
  },
];

/* ─── Main Screen Component ─────────────────────────────────── */

export function ModesSettingsScreen() {
  const [modes, setModes] = useState<StudyMode[]>(DEFAULT_MODES);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("study_mode_config");
      if (saved) {
        const parsed = JSON.parse(saved);
        setModes((prev) =>
          prev.map((m) => {
            const savedMode = parsed.modes?.find((sm: { id: string }) => sm.id === m.id);
            if (!savedMode) return m;
            return {
              ...m,
              isActive: savedMode.isActive || false,
              settings: m.settings.map((s) => {
                const savedSetting = savedMode.settings?.find((ss: { key: string }) => ss.key === s.key);
                return savedSetting ? { ...s, value: savedSetting.value } : s;
              }),
            };
          })
        );
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  const persistModes = (updatedModes: StudyMode[]) => {
    const serializable = updatedModes.map((m) => ({
      id: m.id,
      name: m.name,
      isActive: m.isActive,
      settings: m.settings.map((s) => ({ key: s.key, value: s.value })),
    }));
    localStorage.setItem("study_mode_config", JSON.stringify({ modes: serializable }));
  };

  const handleSettingChange = (modeId: string, key: string, value: boolean | number | string) => {
    setModes((prev) => {
      const updated = prev.map((m) =>
        m.id === modeId
          ? { ...m, settings: m.settings.map((s) => (s.key === key ? { ...s, value } : s)) }
          : m
      );
      persistModes(updated);
      return updated;
    });
  };

  const handleActivate = (modeId: string) => {
    setModes((prev) => {
      const updated = prev.map((m) => ({ ...m, isActive: m.id === modeId }));
      persistModes(updated);
      return updated;
    });
  };

  const activeMode = modes.find((m) => m.isActive) || modes[0];

  return (
    <div className={styles.hubContainer}>
      <div className={styles.topGlow} aria-hidden="true" />

      <div className={styles.contentWrapper}>
        {/* Navigation & Header */}
        <div>
          <BackToSettings />
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-4">
            <div>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-['Rajdhani'] font-bold tracking-widest text-[var(--green)] uppercase mb-2 ${styles.chip}`}>
                <Compass className="w-3.5 h-3.5" />
                <span>System Hub &rarr; Modes</span>
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold font-['Rajdhani'] uppercase tracking-wider text-[var(--text-primary)]">
                Study Protocols & Modes
              </h1>
              <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-xl">
                Select and configure the operational protocol powering your Focus Timer and daily study rhythms.
              </p>
            </div>
          </div>
        </div>

        {/* ─── Active Protocol Spotlight Hero ────────────────────── */}
        {activeMode && (
          <div className={`${styles.glassCard} p-5 sm:p-6 lg:p-7 mt-6 relative overflow-hidden`}>
            {/* Ambient Mode Glow */}
            <div
              className="absolute top-0 right-0 w-72 h-72 pointer-events-none rounded-full blur-3xl opacity-20 -mr-16 -mt-16"
              style={{ backgroundColor: activeMode.color }}
            />

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 relative z-10">
              <div className="flex items-center gap-4 sm:gap-5">
                <div
                  className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center shrink-0 border"
                  style={{
                    backgroundColor: `${activeMode.color}20`,
                    borderColor: `${activeMode.color}50`,
                    color: activeMode.color,
                    boxShadow: `0 0 20px ${activeMode.color}35`,
                  }}
                >
                  {activeMode.icon}
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-['Rajdhani'] font-extrabold uppercase tracking-widest text-[var(--text-muted)]">
                      Current Operational Protocol
                    </span>
                    <span
                      className="w-2 h-2 rounded-full animate-ping"
                      style={{ backgroundColor: activeMode.color }}
                    />
                  </div>
                  <h2 className="font-['Rajdhani'] font-extrabold text-xl sm:text-2xl text-[var(--text-primary)] uppercase tracking-wide">
                    {activeMode.name}
                  </h2>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5 max-w-md">
                    {activeMode.description}
                  </p>
                </div>
              </div>

              {/* Active Protocol Quick Stats */}
              <div className="flex items-center gap-2 pt-3 sm:pt-0 border-t sm:border-t-0 border-[var(--subtle-line)] self-start sm:self-auto flex-wrap">
                <span
                  className="text-xs font-['Rajdhani'] font-bold uppercase tracking-wider px-3 py-1 rounded-full border"
                  style={{
                    color: activeMode.color,
                    borderColor: `${activeMode.color}44`,
                    backgroundColor: `${activeMode.color}15`,
                  }}
                >
                  {activeMode.bestFor}
                </span>
                <ModeSummaryChips mode={activeMode} />
              </div>
            </div>
          </div>
        )}

        {/* ─── Protocol Directory ────────────────────────────────── */}
        <div className="flex flex-col gap-3.5 mt-6">
          <div className="flex items-center justify-between">
            <span className="font-['Rajdhani'] font-bold text-xs uppercase tracking-widest text-[var(--text-muted)]">
              All Available Protocols (Tap to Configure)
            </span>
            <span className="text-[11px] font-['Rajdhani'] text-[var(--text-muted)]">
              {modes.length} Protocols Loaded
            </span>
          </div>

          {modes.map((mode, i) => (
            <ModeCard
              key={mode.id}
              mode={mode}
              isExpanded={expandedId === mode.id}
              onToggleExpand={() => setExpandedId(expandedId === mode.id ? null : mode.id)}
              onSettingChange={(key, value) => handleSettingChange(mode.id, key, value)}
              onActivate={() => handleActivate(mode.id)}
              delay={i * 60}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default ModesSettingsScreen;
