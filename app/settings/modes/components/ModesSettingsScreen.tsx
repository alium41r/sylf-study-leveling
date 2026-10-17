"use client";

import { useState, useSyncExternalStore, type CSSProperties } from "react";
import {
  ArrowRight,
  Brain,
  Check,
  ChevronRight,
  Clock,
  Compass,
  Flame,
  Infinity as InfinityIcon,
  RotateCcw,
  Tv,
} from "lucide-react";
import {
  MainHubLayout,
  HubLink,
  HubState,
} from "../../components/MainHubLayout";
import hub from "../../components/MainHub.module.css";
import styles from "./ModesSettingsScreen.module.css";

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

const DEFAULT_MODES: StudyMode[] = [
  {
    id: "freeflow",
    name: "Free Flow",
    description:
      "Open-ended, unconstrained study session. Start when you're ready, pause as needed, and stop whenever you want.",
    bestFor: "Study at your own pace",
    color: "#10b981",
    icon: <InfinityIcon className="w-5 h-5" />,
    settings: [],
  },
  {
    id: "pomodoro",
    name: "Pomodoro",
    description:
      "Classic time-boxing: focus blocks with short breaks, plus a long break every few rounds.",
    bestFor: "Build momentum",
    color: "#ef4444",
    isActive: true,
    icon: <Clock className="w-5 h-5" />,
    settings: [
      {
        key: "focusDuration",
        label: "Focus Block Duration",
        type: "range",
        value: 25,
        min: 5,
        max: 90,
        unit: " min",
      },
      {
        key: "shortBreak",
        label: "Short Break Duration",
        type: "range",
        value: 5,
        min: 1,
        max: 15,
        unit: " min",
      },
      {
        key: "longBreak",
        label: "Long Recovery Break",
        type: "range",
        value: 15,
        min: 5,
        max: 30,
        unit: " min",
      },
      {
        key: "sessionsBeforeLong",
        label: "Rounds Before Long Break",
        type: "range",
        value: 4,
        min: 2,
        max: 8,
        unit: "",
      },
      {
        key: "autoStartBreaks",
        label: "Auto-start Break Timers",
        type: "toggle",
        value: true,
      },
      {
        key: "autoStartFocus",
        label: "Auto-start Next Focus Round",
        type: "toggle",
        value: false,
      },
      {
        key: "endChime",
        label: "Session Complete Chime",
        type: "toggle",
        value: true,
      },
    ],
  },
  {
    id: "5217",
    name: "52/17 Rhythm",
    description:
      "Longer focus blocks with generous breaks to recover between rounds.",
    bestFor: "Settle into dense material",
    color: "#3b82f6",
    icon: <RotateCcw className="w-5 h-5" />,
    settings: [
      {
        key: "workDuration",
        label: "Work Block",
        type: "range",
        value: 52,
        min: 40,
        max: 70,
        unit: " min",
      },
      {
        key: "breakDuration",
        label: "Recovery Break",
        type: "range",
        value: 17,
        min: 10,
        max: 25,
        unit: " min",
      },
      {
        key: "cycles",
        label: "Target Cycles",
        type: "range",
        value: 3,
        min: 2,
        max: 6,
        unit: "",
      },
      {
        key: "autoStartBreaks",
        label: "Auto-start Recovery Breaks",
        type: "toggle",
        value: true,
      },
      {
        key: "autoStartFocus",
        label: "Auto-start Next Cycle",
        type: "toggle",
        value: false,
      },
      {
        key: "endChime",
        label: "Session Complete Chime",
        type: "toggle",
        value: true,
      },
    ],
  },
  {
    id: "animedoro",
    name: "Animedoro",
    description:
      "Long focus blocks rewarded with a guilt-free fun break — watch an episode, scroll, or nap.",
    bestFor: "Focus with a reward",
    color: "#ec4899",
    icon: <Tv className="w-5 h-5" />,
    settings: [
      {
        key: "focusDuration",
        label: "Focus Marathon",
        type: "range",
        value: 45,
        min: 30,
        max: 60,
        unit: " min",
      },
      {
        key: "rewardBreak",
        label: "Episode Reward Break",
        type: "range",
        value: 20,
        min: 10,
        max: 30,
        unit: " min",
      },
      {
        key: "cycles",
        label: "Rounds Planned",
        type: "range",
        value: 3,
        min: 2,
        max: 6,
        unit: "",
      },
      {
        key: "autoStartBreaks",
        label: "Auto-start Reward Break",
        type: "toggle",
        value: true,
      },
      {
        key: "autoStartFocus",
        label: "Auto-start Next Work Round",
        type: "toggle",
        value: false,
      },
      {
        key: "endChime",
        label: "Session Complete Chime",
        type: "toggle",
        value: true,
      },
    ],
  },
  {
    id: "deepwork",
    name: "Deep Work",
    description:
      "One long, protected marathon block — optionally fullscreen — followed by a proper recovery break.",
    bestFor: "Protect uninterrupted time",
    color: "#a855f7",
    icon: <Brain className="w-5 h-5" />,
    settings: [
      {
        key: "sessionLength",
        label: "Protected Block Length",
        type: "range",
        value: 90,
        min: 30,
        max: 180,
        unit: " min",
      },
      {
        key: "breakLength",
        label: "Post-Session Recovery",
        type: "range",
        value: 20,
        min: 5,
        max: 30,
        unit: " min",
      },
      {
        key: "autoFullscreen",
        label: "Force Fullscreen Mode",
        type: "toggle",
        value: true,
      },
      {
        key: "endChime",
        label: "Session Complete Chime",
        type: "toggle",
        value: true,
      },
    ],
  },
  {
    id: "sprint",
    name: "Sprint Mode",
    description:
      "Short, intense bursts with micro-rests — cycle after cycle until the set is complete.",
    bestFor: "Quick drills and reviews",
    color: "#f59e0b",
    icon: <Flame className="w-5 h-5" />,
    settings: [
      {
        key: "sprintDuration",
        label: "Sprint Duration",
        type: "range",
        value: 10,
        min: 5,
        max: 25,
        unit: " min",
      },
      {
        key: "restDuration",
        label: "Micro-Rest Duration",
        type: "range",
        value: 2,
        min: 1,
        max: 5,
        unit: " min",
      },
      {
        key: "totalSprints",
        label: "Set Quantity",
        type: "range",
        value: 6,
        min: 3,
        max: 12,
        unit: "",
      },
      {
        key: "intensity",
        label: "Audio Intensity Accent",
        type: "select",
        value: "High",
        options: ["Medium", "High", "Extreme"],
      },
      {
        key: "autoStartRests",
        label: "Auto-trigger Rest Intervals",
        type: "toggle",
        value: true,
      },
      {
        key: "autoStartSprints",
        label: "Auto-trigger Next Sprint",
        type: "toggle",
        value: false,
      },
      {
        key: "endChime",
        label: "Sprint End Chime",
        type: "toggle",
        value: true,
      },
    ],
  },
  {
    id: "flowtime",
    name: "Flowtime",
    description:
      "No fixed blocks. Focus until you naturally slow down, then take a break sized to how long you lasted.",
    bestFor: "Follow your natural rhythm",
    color: "#06b6d4",
    icon: <Compass className="w-5 h-5" />,
    settings: [
      {
        key: "reminderInterval",
        label: "Check-in Posture Reminder",
        type: "range",
        value: 45,
        min: 15,
        max: 90,
        unit: " min",
      },
      {
        key: "autoScaleBreak",
        label: "Proportional Break Calculation",
        type: "toggle",
        value: true,
      },
      {
        key: "defaultBreak",
        label: "Baseline Break Length",
        type: "range",
        value: 10,
        min: 5,
        max: 20,
        unit: " min",
      },
      {
        key: "maxBreak",
        label: "Ceiling Recovery Break",
        type: "range",
        value: 20,
        min: 10,
        max: 30,
        unit: " min",
      },
      { key: "endChime", label: "Interval Chime", type: "toggle", value: true },
    ],
  },
];

function rhythm(mode: StudyMode) {
  const find = (keys: string[]) =>
    mode.settings.find((setting) => keys.includes(setting.key))?.value as
      | number
      | undefined;
  return {
    focus: find([
      "focusDuration",
      "workDuration",
      "sessionLength",
      "sprintDuration",
    ]),
    rest: find([
      "shortBreak",
      "breakDuration",
      "rewardBreak",
      "breakLength",
      "restDuration",
      "defaultBreak",
    ]),
    rounds: find(["sessionsBeforeLong", "cycles", "totalSprints"]),
  };
}

function restoreModes(raw: string | null): StudyMode[] {
  if (!raw) return DEFAULT_MODES;
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed?.modes)) return DEFAULT_MODES;
  const activeId =
    DEFAULT_MODES.find((mode) =>
      parsed.modes.some(
        (saved: { id?: string; isActive?: boolean }) =>
          saved?.id === mode.id && saved.isActive
      )
    )?.id ?? "pomodoro";
  return DEFAULT_MODES.map((mode) => {
    const saved = parsed.modes.find(
      (item: { id?: string }) => item?.id === mode.id
    );
    return {
      ...mode,
      isActive: mode.id === activeId,
      settings: mode.settings.map((setting) => {
        const value = Array.isArray(saved?.settings)
          ? saved.settings.find(
              (item: { key?: string }) => item?.key === setting.key
            )?.value
          : undefined;
        if (
          setting.type === "range" &&
          typeof value === "number" &&
          Number.isFinite(value)
        )
          return {
            ...setting,
            value: Math.max(
              setting.min ?? 0,
              Math.min(setting.max ?? 100, Math.round(value))
            ),
          };
        if (setting.type === "toggle" && typeof value === "boolean")
          return { ...setting, value };
        if (
          setting.type === "select" &&
          typeof value === "string" &&
          setting.options?.includes(value)
        )
          return { ...setting, value };
        return setting;
      }),
    };
  });
}

function RhythmPreview({ mode }: { mode: StudyMode }) {
  const { focus, rest, rounds } = rhythm(mode);
  const openEnded = !focus;
  const intervals = Array.from(
    { length: Math.min(rounds ?? 1, 12) },
    (_, index) => {
      const recovery =
        mode.id === "freeflow"
          ? 0
          : mode.id === "pomodoro" && index === (rounds ?? 1) - 1
            ? Number(
                mode.settings.find((setting) => setting.key === "longBreak")
                  ?.value ?? rest
              )
            : (rest ?? 1);
      return { focus: focus ?? 5, recovery };
    }
  );
  return (
    <div className={styles.preview}>
      <div className={styles.previewMetrics}>
        <div>
          <strong>
            {openEnded ? (
              <InfinityIcon
                size={42}
                strokeWidth={1.4}
                aria-label="Open ended"
              />
            ) : (
              <>
                {focus}
                <small>min</small>
              </>
            )}
          </strong>
          <span>{openEnded ? "Open-ended focus" : "Focus block"}</span>
        </div>
        {mode.id !== "freeflow" && (
          <>
            <span className={styles.previewDivider} aria-hidden="true">
              /
            </span>
            <div>
              <strong>
                {mode.id === "flowtime" &&
                mode.settings.find((s) => s.key === "autoScaleBreak")?.value ? (
                  <span className={styles.adaptive}>Adaptive</span>
                ) : (
                  <>
                    {rest}
                    <small>min</small>
                  </>
                )}
              </strong>
              <span>
                {mode.id === "animedoro"
                  ? "Reward break"
                  : mode.id === "sprint"
                    ? "Micro-rest"
                    : mode.id === "pomodoro"
                      ? "Short break"
                      : "Recovery break"}
              </span>
            </div>
          </>
        )}
        {rounds && (
          <span className={styles.rounds}>
            {rounds}{" "}
            {mode.id === "pomodoro" ? "rounds to long break" : "rounds"}
          </span>
        )}
      </div>
      <div className={styles.timeline} aria-hidden="true">
        {intervals.map((interval, index) => (
          <div
            key={index}
            className={styles.cycle}
            style={{ flex: interval.focus + interval.recovery }}
          >
            <span style={{ flex: interval.focus }} />
            {interval.recovery > 0 && <i style={{ flex: interval.recovery }} />}
          </div>
        ))}
      </div>
      <div className={styles.timelineLegend}>
        <span>
          <i />
          Focus
        </span>
        {mode.id !== "freeflow" && (
          <span>
            <i />
            Recovery
          </span>
        )}
        <small>
          {mode.id === "pomodoro"
            ? `${mode.settings.find((s) => s.key === "longBreak")?.value} min long break after ${rounds} rounds`
            : mode.id === "flowtime"
              ? "Pause when you’re ready for a break"
              : mode.id === "freeflow"
                ? "No fixed intervals"
                : "Your session rhythm"}
        </small>
      </div>
    </div>
  );
}

function ModeSettings({
  mode,
  onChange,
}: {
  mode: StudyMode;
  onChange: (key: string, value: boolean | number | string) => void;
}) {
  const ranges = mode.settings.filter((setting) => setting.type === "range");
  const preferences = mode.settings.filter(
    (setting) => setting.type !== "range"
  );
  return (
    <>
      {ranges.length > 0 && (
        <div className={styles.durations}>
          {ranges.map((setting) => (
            <div className={styles.rangeSetting} key={setting.key}>
              <div>
                <label htmlFor={`mode-${mode.id}-${setting.key}`}>
                  {setting.label}
                </label>
                <output htmlFor={`mode-${mode.id}-${setting.key}`}>
                  {setting.value}
                  {setting.unit || ""}
                </output>
              </div>
              <input
                id={`mode-${mode.id}-${setting.key}`}
                type="range"
                min={setting.min ?? 0}
                max={setting.max ?? 100}
                value={setting.value as number}
                onChange={(event) =>
                  onChange(setting.key, Number(event.target.value))
                }
                style={
                  {
                    "--range-progress": `${((Number(setting.value) - (setting.min ?? 0)) / ((setting.max ?? 100) - (setting.min ?? 0))) * 100}%`,
                  } as CSSProperties
                }
              />
              <div className={styles.rangeBounds} aria-hidden="true">
                <span>
                  {setting.min}
                  {setting.unit}
                </span>
                <span>
                  {setting.max}
                  {setting.unit}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
      {preferences.length > 0 && (
        <div className={styles.preferences}>
          {preferences.map((setting) => (
            <div className={styles.preference} key={setting.key}>
              <span id={`label-${mode.id}-${setting.key}`}>
                {setting.label}
              </span>
              {setting.type === "toggle" ? (
                <button
                  type="button"
                  className={styles.switch}
                  role="switch"
                  aria-labelledby={`label-${mode.id}-${setting.key}`}
                  aria-checked={Boolean(setting.value)}
                  onClick={() => onChange(setting.key, !setting.value)}
                >
                  <span />
                </button>
              ) : (
                <div
                  className={hub.segmented}
                  role="group"
                  aria-labelledby={`label-${mode.id}-${setting.key}`}
                >
                  {setting.options?.map((option) => (
                    <button
                      key={option}
                      aria-pressed={setting.value === option}
                      onClick={() => onChange(setting.key, option)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {mode.settings.length === 0 && (
        <div className={styles.freeflowNote}>
          <Compass size={19} aria-hidden="true" />
          <div>
            <h3>A little room to find your flow.</h3>
            <p>
              Start, pause, and finish on your terms. No countdowns or intervals
              to configure.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

const subscribeToHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function ModesSettingsScreen() {
  const ready = useSyncExternalStore(
    subscribeToHydration,
    clientSnapshot,
    serverSnapshot
  );
  const [modes, setModes] = useState<StudyMode[]>(() => {
    try {
      return restoreModes(
        typeof window === "undefined"
          ? null
          : localStorage.getItem("study_mode_config")
      );
    } catch {
      return DEFAULT_MODES;
    }
  });
  const [selectedId, setSelectedId] = useState(
    () => modes.find((mode) => mode.isActive)?.id ?? "pomodoro"
  );
  const [notice, setNotice] = useState("");
  const [saveError, setSaveError] = useState(false);

  const save = (updated: StudyMode[], message: string) => {
    try {
      localStorage.setItem(
        "study_mode_config",
        JSON.stringify({
          modes: updated.map((mode) => ({
            id: mode.id,
            name: mode.name,
            isActive: Boolean(mode.isActive),
            settings: mode.settings.map((setting) => ({
              key: setting.key,
              value: setting.value,
            })),
          })),
        })
      );
      setModes(updated);
      setNotice(message);
      setSaveError(false);
    } catch {
      setSaveError(true);
      setNotice("Couldn’t save on this device. Please try again.");
    }
  };
  const updateSetting = (key: string, value: boolean | number | string) =>
    save(
      modes.map((mode) =>
        mode.id === selectedId
          ? {
              ...mode,
              settings: mode.settings.map((setting) =>
                setting.key === key ? { ...setting, value } : setting
              ),
            }
          : mode
      ),
      "Settings saved"
    );
  const active = modes.find((mode) => mode.isActive) ?? modes[1];
  const selected = modes.find((mode) => mode.id === selectedId) ?? active;
  return (
    <MainHubLayout title="Modes">
      {!ready ? (
        <HubState loading title="Loading your modes…" />
      ) : (
        <>
          <div className={styles.activeStrip}>
            <span className={styles.activeIcon}>{active.icon}</span>
            <div>
              <span>For your next session</span>
              <strong>{active.name}</strong>
            </div>
            <HubLink href="/timer">Open timer</HubLink>
          </div>
          <div className={styles.layout}>
            <section
              className={styles.directory}
              aria-label="Choose a study mode"
            >
              <div className={styles.directoryHeading}>
                <h2>Find your rhythm</h2>
                <span>{modes.length} modes</span>
              </div>
              <div className={styles.modeList}>
                {modes.map((mode) => {
                  const { focus, rest } = rhythm(mode);
                  return (
                    <button
                      key={mode.id}
                      className={`${styles.modeChoice} ${selectedId === mode.id ? styles.chosen : ""}`}
                      aria-pressed={selectedId === mode.id}
                      aria-controls="mode-configuration"
                      onClick={() => {
                        setSelectedId(mode.id);
                        setNotice("");
                      }}
                    >
                      <span className={styles.modeIcon}>{mode.icon}</span>
                      <span className={styles.choiceText}>
                        <span>
                          <strong>{mode.name}</strong>
                          {mode.isActive && (
                            <Check size={12} aria-label="Active mode" />
                          )}
                        </span>
                        <small>{mode.bestFor}</small>
                        <span className={styles.choiceTiming}>
                          {focus
                            ? `${focus}m focus · ${rest}m break`
                            : mode.id === "freeflow"
                              ? "Open-ended"
                              : "Flexible focus · adaptive breaks"}
                        </span>
                      </span>
                      <ChevronRight
                        size={15}
                        className={styles.choiceArrow}
                        aria-hidden="true"
                      />
                    </button>
                  );
                })}
              </div>
              <p className={styles.directoryFoot}>
                Different days, different rhythms.
                <br />
                Choose what fits the work ahead.
              </p>
            </section>
            <section
              id="mode-configuration"
              className={styles.configuration}
              aria-label={`${selected.name} settings`}
            >
              <div className={styles.detailHeading}>
                <span className={styles.detailIcon}>{selected.icon}</span>
                <div>
                  <h2>{selected.name}</h2>
                  <p>{selected.bestFor}</p>
                </div>
                {selected.isActive && (
                  <span className={`${hub.pill} ${hub.accentPill}`}>
                    <Check size={11} aria-hidden="true" />
                    Active
                  </span>
                )}
              </div>
              <p className={styles.description}>{selected.description}</p>
              <RhythmPreview mode={selected} />
              <div className={styles.configureHeading}>
                <h3>
                  {selected.settings.length
                    ? "Make it yours"
                    : "Simply start studying"}
                </h3>
                {selected.settings.length > 0 && (
                  <span>Saved automatically</span>
                )}
              </div>
              <ModeSettings mode={selected} onChange={updateSetting} />
              <div className={styles.detailFooter}>
                <div>
                  <p>Saved on this device</p>
                  <span>Changes apply to your next focus session.</span>
                </div>
                <button
                  disabled={selected.isActive}
                  onClick={() =>
                    save(
                      modes.map((mode) => ({
                        ...mode,
                        isActive: mode.id === selected.id,
                      })),
                      `${selected.name} is ready for your next session`
                    )
                  }
                  className={
                    selected.isActive ? hub.secondaryButton : hub.primaryButton
                  }
                >
                  {selected.isActive ? (
                    <>
                      <Check size={14} aria-hidden="true" />
                      Current mode
                    </>
                  ) : (
                    <>
                      Use {selected.name}
                      <ArrowRight size={14} aria-hidden="true" />
                    </>
                  )}
                </button>
              </div>
              <div
                className={`${styles.saveStatus} ${saveError ? styles.saveError : ""}`}
                role="status"
                aria-live="polite"
              >
                {notice}
              </div>
            </section>
          </div>
        </>
      )}
    </MainHubLayout>
  );
}

export default ModesSettingsScreen;
