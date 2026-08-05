"use client";

import BackToSettings from "../../components/BackToSettings";
import { useState, useEffect } from "react";

/* ─── Types ────────────────────────────────────────────────── */

interface StudyMode {
  id: string;
  name: string;
  description: string;
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
      onClick={() => onChange(!value)}
      style={{
        width: "44px",
        height: "24px",
        borderRadius: "12px",
        background: value ? color : "rgba(255,255,255,0.08)",
        border: value ? `1px solid ${color}` : "1px solid rgba(255,255,255,0.1)",
        position: "relative",
        cursor: "pointer",
        transition: "all 0.3s ease",
        boxShadow: value ? `0 0 12px ${color}40` : "none",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: "18px",
          height: "18px",
          borderRadius: "50%",
          background: value ? "#fff" : "rgba(255,255,255,0.3)",
          position: "absolute",
          top: "2px",
          left: value ? "22px" : "3px",
          transition: "left 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      />
    </button>
  );
}

/* ─── Slider ────────────────────────────────────────────────── */

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
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", width: "100%" }}>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          flex: 1,
          height: "4px",
          appearance: "none",
          background: `linear-gradient(to right, ${color} ${pct}%, rgba(255,255,255,0.08) ${pct}%)`,
          borderRadius: "2px",
          cursor: "pointer",
          outline: "none",
        }}
      />
      <span
        style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontWeight: 700,
          fontSize: "0.85rem",
          color: "var(--text-primary)",
          minWidth: "50px",
          textAlign: "right",
        }}
      >
        {value}{unit || ""}
      </span>
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
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div
      className="system-card"
      style={{
        padding: "0",
        marginBottom: "12px",
        overflow: "hidden",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(16px)",
        transition: "opacity 0.5s ease, transform 0.5s ease",
        borderColor: mode.isActive ? `${mode.color}40` : undefined,
        boxShadow: mode.isActive ? `0 0 20px ${mode.color}15` : undefined,
      }}
    >
      {/* Header */}
      <div
        onClick={onToggleExpand}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
          padding: "20px 24px",
          cursor: "pointer",
          transition: "background 0.2s ease",
        }}
      >
        <div
          style={{
            width: "44px",
            height: "44px",
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: `${mode.color}15`,
            border: `1px solid ${mode.color}30`,
            color: mode.color,
            flexShrink: 0,
          }}
        >
          {mode.icon}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <h3
              style={{
                fontFamily: "'Rajdhani', sans-serif",
                fontWeight: 700,
                fontSize: "1rem",
                color: "var(--text-primary)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {mode.name}
            </h3>
            {mode.isActive && (
              <span
                style={{
                  fontSize: "0.6rem",
                  padding: "2px 8px",
                  borderRadius: "3px",
                  background: `${mode.color}20`,
                  color: mode.color,
                  fontFamily: "'Rajdhani', sans-serif",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                Active
              </span>
            )}
          </div>
          <p style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: "0.75rem", color: "var(--text-muted)" }}>
            {mode.description}
          </p>
        </div>

        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          style={{
            color: "var(--text-muted)",
            transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.3s ease",
          }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Expanded Settings */}
      <div
        style={{
          maxHeight: isExpanded ? "600px" : "0px",
          overflow: "hidden",
          transition: "max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <div style={{ padding: "0 24px 20px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
          <div style={{ paddingTop: "16px" }}>
            {mode.settings.map((setting) => (
              <div
                key={setting.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "16px",
                  padding: "10px 0",
                  borderBottom: "1px solid rgba(255,255,255,0.03)",
                }}
              >
                <span
                  style={{
                    fontFamily: "'Rajdhani', sans-serif",
                    fontSize: "0.82rem",
                    color: "var(--text-secondary)",
                    minWidth: "120px",
                    flexShrink: 0,
                  }}
                >
                  {setting.label}
                </span>

                {setting.type === "toggle" && (
                  <ToggleSwitch
                    value={setting.value as boolean}
                    onChange={(v) => onSettingChange(setting.key, v)}
                    color={mode.color}
                  />
                )}

                {setting.type === "range" && (
                  <RangeSlider
                    value={setting.value as number}
                    onChange={(v) => onSettingChange(setting.key, v)}
                    min={setting.min || 0}
                    max={setting.max || 100}
                    unit={setting.unit}
                    color={mode.color}
                  />
                )}

                {setting.type === "select" && (
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    {setting.options?.map((opt) => (
                      <button
                        key={opt}
                        onClick={() => onSettingChange(setting.key, opt)}
                        style={{
                          padding: "4px 10px",
                          borderRadius: "4px",
                          fontFamily: "'Rajdhani', sans-serif",
                          fontWeight: 600,
                          fontSize: "0.7rem",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          background: setting.value === opt ? `${mode.color}20` : "transparent",
                          border: setting.value === opt ? `1px solid ${mode.color}40` : "1px solid rgba(255,255,255,0.06)",
                          color: setting.value === opt ? mode.color : "var(--text-muted)",
                          cursor: "pointer",
                          transition: "all 0.2s ease",
                        }}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={onActivate}
            style={{
              marginTop: "16px",
              width: "100%",
              padding: "10px",
              borderRadius: "6px",
              fontFamily: "'Rajdhani', sans-serif",
              fontWeight: 700,
              fontSize: "0.8rem",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              background: mode.isActive ? "rgba(255,255,255,0.03)" : `${mode.color}15`,
              border: mode.isActive ? "1px solid rgba(255,255,255,0.06)" : `1px solid ${mode.color}30`,
              color: mode.isActive ? "var(--text-muted)" : mode.color,
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            {mode.isActive ? "Currently Active" : "Set as Active Mode"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────────── */

const ICON_SIZE = "w-5 h-5";

const DEFAULT_MODES: StudyMode[] = [
  {
    id: "pomodoro",
    name: "Pomodoro",
    description: "Classic time-boxed sessions with regular breaks for sustained focus",
    color: "#ef4444",
    isActive: true,
    icon: (
      <svg className={ICON_SIZE} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    settings: [
      { key: "focusDuration", label: "Focus Duration", type: "range", value: 25, min: 5, max: 90, unit: " min" },
      { key: "shortBreak", label: "Short Break", type: "range", value: 5, min: 1, max: 15, unit: " min" },
      { key: "longBreak", label: "Long Break", type: "range", value: 15, min: 5, max: 30, unit: " min" },
      { key: "sessionsBeforeLong", label: "Sessions Before Long Break", type: "range", value: 4, min: 2, max: 8, unit: "" },
      { key: "autoStartBreak", label: "Auto-start Breaks", type: "toggle", value: true },
      { key: "autoStartFocus", label: "Auto-start Focus", type: "toggle", value: false },
    ],
  },
  {
    id: "deepwork",
    name: "Deep Work",
    description: "Extended uninterrupted sessions for maximum concentration and flow state",
    color: "var(--accent-primary)",
    icon: (
      <svg className={ICON_SIZE} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
    settings: [
      { key: "sessionLength", label: "Session Length", type: "range", value: 90, min: 30, max: 180, unit: " min" },
      { key: "breakLength", label: "Break Length", type: "range", value: 20, min: 5, max: 30, unit: " min" },
      { key: "blockNotifications", label: "Block Notifications", type: "toggle", value: true },
      { key: "ambientSound", label: "Ambient Sound", type: "select", value: "None", options: ["None", "Rain", "Fireplace", "White Noise", "Forest"] },
    ],
  },
  {
    id: "freeflow",
    name: "Free Flow",
    description: "Open-ended stopwatch with no time limits — study at your own pace",
    color: "#06b6d4",
    icon: (
      <svg className={ICON_SIZE} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    settings: [
      { key: "showElapsed", label: "Show Elapsed Time", type: "toggle", value: true },
      { key: "reminderInterval", label: "Break Reminder", type: "range", value: 45, min: 0, max: 120, unit: " min" },
      { key: "trackSessions", label: "Auto-track Sessions", type: "toggle", value: true },
    ],
  },
  {
    id: "sprint",
    name: "Sprint Mode",
    description: "Intense short bursts for high-energy tasks and quick review sessions",
    color: "#f59e0b",
    icon: (
      <svg className={ICON_SIZE} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    settings: [
      { key: "sprintDuration", label: "Sprint Duration", type: "range", value: 10, min: 5, max: 25, unit: " min" },
      { key: "restDuration", label: "Rest Duration", type: "range", value: 2, min: 1, max: 5, unit: " min" },
      { key: "totalSprints", label: "Total Sprints", type: "range", value: 6, min: 3, max: 12, unit: "" },
      { key: "intensity", label: "Intensity", type: "select", value: "High", options: ["Medium", "High", "Extreme"] },
    ],
  },
];

export default function ModesSettingsPage() {
  const [modes, setModes] = useState<StudyMode[]>(DEFAULT_MODES);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Load saved mode config from localStorage on mount
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
    } catch { /* ignore parse errors */ }
  }, []);

  // Persist to localStorage whenever modes state changes
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

  return (
    <div className="settings-page-container">
      <BackToSettings />

      <p className="settings-page-breadcrumb">Main → Modes</p>
      <h1 className="settings-page-header">Study Modes</h1>

      <p
        style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: "0.85rem",
          color: "var(--text-secondary)",
          marginBottom: "24px",
          lineHeight: 1.6,
        }}
      >
        Choose and customize your preferred study technique. The active mode determines how
        your focus timer behaves.
      </p>

      {modes.map((mode, i) => (
        <ModeCard
          key={mode.id}
          mode={mode}
          isExpanded={expandedId === mode.id}
          onToggleExpand={() => setExpandedId(expandedId === mode.id ? null : mode.id)}
          onSettingChange={(key, value) => handleSettingChange(mode.id, key, value)}
          onActivate={() => handleActivate(mode.id)}
          delay={i * 100}
        />
      ))}

      <style>{`
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: var(--text-primary);
          border: 2px solid var(--bg-panel);
          cursor: pointer;
          box-shadow: 0 0 6px rgba(255,255,255,0.2);
        }
        input[type="range"]::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: var(--text-primary);
          border: 2px solid var(--bg-panel);
          cursor: pointer;
          box-shadow: 0 0 6px rgba(255,255,255,0.2);
        }
      `}</style>
    </div>
  );
}
