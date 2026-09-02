"use client";

import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../components/AuthProvider";
import { motion, AnimatePresence } from "framer-motion";
import { FocusToolsProvider } from "./components/FocusToolsContext";
import FocusToolsDock from "./components/FocusToolsDock";
import FocusToolWindow from "./components/FocusToolWindow";
import { useFocusEyeComfort } from "./hooks/useFocusEyeComfort";
import { useScreenWakeLock } from "./hooks/useScreenWakeLock";
import { useTimerLeadership } from "./hooks/useTimerLeadership";
import { SESSION_ENDED_EVENT, SESSION_SUMMARY_KEY } from "../components/SessionEndToast";
import { CheckCircle2 } from "lucide-react";
import {
  createInitialSnapshot,
  deriveTimer,
  pauseSnapshot,
  resumeSnapshot,
  setCountdownSnapshot,
  transitionSnapshot,
  legacyCacheToSnapshot,
  isBreakPhase,
  type TimerSnapshot,
  type TimerPhase,
} from "@/lib/timer-engine";

/* ─── Types ────────────────────────────────────────────────── */

interface ModeConfig {
  id: string;
  name: string;
  isActive?: boolean;
  settings: { key: string; value: boolean | number | string }[];
}

/** Reasons the timer can be paused (drives the paused indicator copy). */
type PauseReason = "manual" | "break-over";

const VALID_PHASES = ["focus", "short-break", "long-break", "rest", "done"];

function getSetting(mode: ModeConfig, key: string, fallback: number | boolean | string = 0): number | boolean | string {
  const found = mode.settings.find((s) => s.key === key);
  return found ? found.value : fallback;
}

/* ─── FocusContent ─────────────────────────────────────────── */

function FocusContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshStats } = useAuth();

  // Eye-Comfort Dimming (Light Mode only) — zero-IOPS client state
  const { isDimActive, isLightMode, toggleDim } = useFocusEyeComfort();

  // Keep the screen awake during the study session (Web Screen Wake Lock)
  const keepAwake = useScreenWakeLock();

  const subjectId = searchParams.get("subjectId");
  const subjectName = searchParams.get("subjectName") || "Focus Session";
  const questId = searchParams.get("questId");

  const cacheKey = `runningTimerState_${subjectId || "general"}_${questId || "none"}`;
  const timerKey = `runningTimerSeconds_${subjectId || "general"}_${questId || "none"}`;

  // Single-writer tab leadership: only the PRIMARY tab creates sessions and
  // flushes; mirror tabs display the synced epoch state read-only. Explicit
  // user actions take over leadership first. The server (adopt-POST + row
  // locks + delta accounting + monotonic durations) is the final authority.
  const { isPrimary, isPrimaryRef, acquireLeadership, releaseLeadership } =
    useTimerLeadership(cacheKey);

  // Timer state (displayed values are always DERIVED from the epoch snapshot)
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [breakSeconds, setBreakSeconds] = useState(0); // break/rest time inside this session (never counts as study)
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null); // null = stopwatch mode
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [isEnding, setIsEnding] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [pauseReason, setPauseReason] = useState<PauseReason>("manual");

  // Daily totals
  const [initialSubjectSeconds, setInitialSubjectSeconds] = useState(0);
  const [initialTotalSeconds, setInitialTotalSeconds] = useState(0);

  // Mode-specific state
  const [activeMode, setActiveMode] = useState<ModeConfig | null>(null);
  const [phase, setPhase] = useState<TimerPhase>("focus");
  const [currentSession, setCurrentSession] = useState(1);
  const [totalSessions, setTotalSessions] = useState(1);
  const [phaseLabel, setPhaseLabel] = useState("FOCUS");
  const [questData, setQuestData] = useState<any>(null);
  const [showQuestPopup, setShowQuestPopup] = useState(false);
  // Flowtime mode: stretch-break nudge banner
  const [flowNudge, setFlowNudge] = useState(false);

  const questPopupTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const sessionStartedRef = useRef(false);

  // ─── Epoch-anchored engine state (single source of truth) ───
  // elapsed/break/countdown are DERIVED from these wall-clock anchors on
  // every tick, on visibility changes, and on restore — never accumulated
  // by tick counters. Backgrounded tabs, throttled intervals, and sleep/
  // wake gaps are therefore credited exactly.
  const snapRef = useRef<TimerSnapshot>(createInitialSnapshot(Date.now()));
  const transitionFiredRef = useRef(false);
  const lastPersistRef = useRef(0);
  const sessionStartPendingRef = useRef(false);
  const bcRef = useRef<BroadcastChannel | null>(null);
  const lastRemoteTsRef = useRef(0);

  // Stale State Closure Protection Refs (async flush paths read these)
  const elapsedSecondsRef = useRef<number>(0);
  const breakSecondsRef = useRef<number>(0);
  const sessionIdRef = useRef<number | null>(null);
  const lastSyncedSecondsRef = useRef<number>(0);
  const lastSyncedBreakSecondsRef = useRef<number>(0);
  const isSyncingRef = useRef<boolean>(false);
  const isPausedRef = useRef<boolean>(false);
  const phaseRef = useRef<TimerPhase>("focus");
  const phaseLabelRef = useRef<string>("FOCUS");
  const remainingSecondsRef = useRef<number | null>(null);
  const currentSessionRef = useRef<number>(1);
  const totalSessionsRef = useRef<number>(1);
  // True when a persisted running timer state was restored — the
  // mode-initializer must not clobber the restored phase.
  const restoredStateRef = useRef<boolean>(false);
  // Holds the in-flight flush promise so overlapping calls serialize.
  const flushInFlightRef = useRef<Promise<boolean> | null>(null);
  // Set inside the timer tick (no side effects allowed there) and consumed
  // by a dedicated effect so the 3-minute auto-save fires exactly once.
  const autoFlushDueRef = useRef<boolean>(false);
  // Live mirrors for the tick callback (never stale).
  const questDataRef = useRef<any>(null);
  const activeModeRef = useRef<ModeConfig | null>(null);
  const tickRef = useRef<() => void>(() => {});
  const transitionPhaseRef = useRef<() => void>(() => {});

  // Keep refs in sync with React state
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    elapsedSecondsRef.current = elapsedSeconds;
  }, [elapsedSeconds]);

  useEffect(() => {
    breakSecondsRef.current = breakSeconds;
  }, [breakSeconds]);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    phaseLabelRef.current = phaseLabel;
  }, [phaseLabel]);

  useEffect(() => {
    remainingSecondsRef.current = remainingSeconds;
  }, [remainingSeconds]);

  useEffect(() => {
    currentSessionRef.current = currentSession;
  }, [currentSession]);

  useEffect(() => {
    totalSessionsRef.current = totalSessions;
  }, [totalSessions]);

  useEffect(() => {
    questDataRef.current = questData;
  }, [questData]);

  useEffect(() => {
    activeModeRef.current = activeMode;
  }, [activeMode]);

  // ─── Load Mode Config & Cached Timer State ────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem("study_mode_config");
      if (saved) {
        const parsed = JSON.parse(saved);
        const active = parsed.modes?.find((m: ModeConfig) => m.isActive);
        if (active) {
          setActiveMode(active);
          return;
        }
      }
    } catch { /* default to pomodoro/freeflow */ }

    setActiveMode({
      id: "pomodoro",
      name: "Pomodoro",
      isActive: true,
      settings: [
        { key: "focusDuration", value: 25 },
        { key: "shortBreak", value: 5 },
        { key: "longBreak", value: 15 },
        { key: "sessionsBeforeLong", value: 4 },
        { key: "autoStartBreaks", value: true },
        { key: "autoStartFocus", value: false },
        { key: "endChime", value: true },
      ],
    });

    // Load persisted epoch snapshot (new format) or a legacy cache entry.
    try {
      const savedState = localStorage.getItem(cacheKey);
      if (savedState) {
        const parsed = JSON.parse(savedState);

        if (parsed.v === 2 && typeof parsed.focusMs === "number") {
          // New epoch format: anchors restore EXACTLY where the session was.
          // When the timer was running, the wall-clock anchor automatically
          // credits the time spent away (background, sleep, closed tab).
          const restoredPhase = VALID_PHASES.includes(parsed.phase)
            ? (parsed.phase as TimerPhase)
            : "focus";
          snapRef.current = {
            v: 2,
            focusMs: parsed.focusMs,
            breakMs: parsed.breakMs ?? 0,
            runningSinceMs: parsed.isPaused
              ? null
              : typeof parsed.runningSinceMs === "number"
                ? parsed.runningSinceMs
                : Date.now(),
            isPaused: parsed.isPaused === true,
            phase: restoredPhase,
            remainingMs:
              parsed.remainingMs === null || parsed.remainingMs === undefined
                ? null
                : parsed.remainingMs,
            timestamp: Date.now(),
          };

          if (parsed.sessionId) {
            setSessionId(parsed.sessionId);
            sessionIdRef.current = parsed.sessionId;
          }
          if (typeof parsed.lastSyncedSeconds === "number") {
            lastSyncedSecondsRef.current = parsed.lastSyncedSeconds;
          }
          if (typeof parsed.lastSyncedBreakSeconds === "number") {
            lastSyncedBreakSecondsRef.current = parsed.lastSyncedBreakSeconds;
          }
          if (parsed.pauseReason === "break-over") setPauseReason("break-over");
          if (typeof parsed.phaseLabel === "string") {
            setPhaseLabel(parsed.phaseLabel);
            phaseLabelRef.current = parsed.phaseLabel;
          }
          if (typeof parsed.currentSession === "number") setCurrentSession(parsed.currentSession);
          if (typeof parsed.totalSessions === "number") setTotalSessions(parsed.totalSessions);
          setPhase(restoredPhase);
          phaseRef.current = restoredPhase;
          setIsPaused(parsed.isPaused === true);
          isPausedRef.current = parsed.isPaused === true;
          restoredStateRef.current = true;

          const d = deriveTimer(snapRef.current, Date.now());
          setElapsedSeconds(d.focusSec);
          setBreakSeconds(d.breakSec);
          setRemainingSeconds(d.remainingSec);
          remainingSecondsRef.current = d.remainingSec;
        } else {
          // Legacy tick-accumulator format → convert to an epoch snapshot.
          // The legacy `timestamp` becomes the live anchor, so time away
          // from the page is credited instead of discarded.
          const snap = legacyCacheToSnapshot(parsed, Date.now());
          snapRef.current = snap;

          if (typeof parsed.elapsedSeconds === "number") {
            setElapsedSeconds(parsed.elapsedSeconds);
            elapsedSecondsRef.current = parsed.elapsedSeconds;
            lastSyncedSecondsRef.current = parsed.lastSyncedSeconds ?? 0;
          }
          if (typeof parsed.breakSeconds === "number") {
            setBreakSeconds(parsed.breakSeconds);
            breakSecondsRef.current = parsed.breakSeconds;
            lastSyncedBreakSecondsRef.current = parsed.lastSyncedBreakSeconds ?? 0;
          }
          if (parsed.sessionId) {
            setSessionId(parsed.sessionId);
            sessionIdRef.current = parsed.sessionId;
          }
          setIsPaused(snap.isPaused);
          isPausedRef.current = snap.isPaused;
          if (parsed.pauseReason === "break-over") setPauseReason("break-over");
          if (VALID_PHASES.includes(parsed.phase)) {
            const restoredPhase = parsed.phase as TimerPhase;
            setPhase(restoredPhase);
            phaseRef.current = restoredPhase;
            restoredStateRef.current = true;
          }
          if (typeof parsed.phaseLabel === "string") {
            setPhaseLabel(parsed.phaseLabel);
            phaseLabelRef.current = parsed.phaseLabel;
          }
          if (typeof parsed.remainingSeconds === "number" || parsed.remainingSeconds === null) {
            setRemainingSeconds(parsed.remainingSeconds);
            remainingSecondsRef.current = parsed.remainingSeconds;
          }
          if (typeof parsed.currentSession === "number") setCurrentSession(parsed.currentSession);
          if (typeof parsed.totalSessions === "number") setTotalSessions(parsed.totalSessions);
        }
      } else {
        const savedSeconds = sessionStorage.getItem(timerKey);
        if (savedSeconds) {
          const sec = parseInt(savedSeconds, 10);
          if (Number.isFinite(sec) && sec > 0) {
            snapRef.current = legacyCacheToSnapshot({ elapsedSeconds: sec }, Date.now());
            setElapsedSeconds(sec);
            elapsedSecondsRef.current = sec;
          }
        }
      }
    } catch {
      snapRef.current = createInitialSnapshot(Date.now());
      setElapsedSeconds(0);
    }
  }, [cacheKey, timerKey]);

  // ─── Persist Timer State (single writer, exact live values) ────
  const persistTimerState = useCallback(
    () => {
      try {
        const snap = snapRef.current;
        const d = deriveTimer(snap, Date.now());
        localStorage.setItem(
          cacheKey,
          JSON.stringify({
            v: 2,
            focusMs: snap.focusMs + (snap.phase === "focus" ? d.liveMs : 0),
            breakMs: snap.breakMs + (isBreakPhase(snap.phase) ? d.liveMs : 0),
            runningSinceMs: snap.runningSinceMs,
            isPaused: snap.isPaused,
            phase: snap.phase,
            remainingMs: snap.remainingMs,
            sessionId: sessionIdRef.current,
            pauseReason: isPausedRef.current ? pauseReason : undefined,
            phaseLabel: phaseLabelRef.current,
            currentSession: currentSessionRef.current,
            totalSessions: totalSessionsRef.current,
            lastSyncedSeconds: lastSyncedSecondsRef.current,
            lastSyncedBreakSeconds: lastSyncedBreakSecondsRef.current,
            timestamp: Date.now(),
          })
        );
      } catch {
        /* storage full/unavailable — in-memory state is still authoritative */
      }
    },
    [cacheKey, pauseReason]
  );

  // ─── Multi-Tab Synchronization (BroadcastChannel, best-effort) ──
  const broadcastSnapshot = useCallback(() => {
    const bc = bcRef.current;
    if (!bc) return;
    try {
      bc.postMessage({
        key: cacheKey,
        ts: Date.now(),
        snap: snapRef.current,
        sessionId: sessionIdRef.current,
      });
    } catch { /* channel closed */ }
  }, [cacheKey]);

  useEffect(() => {
    const bc =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("sylf-timer-sync")
        : null;
    bcRef.current = bc;
    if (bc) {
      bc.onmessage = (e: MessageEvent) => {
        const msg = e.data;
        if (
          !msg ||
          msg.key !== cacheKey ||
          typeof msg.ts !== "number" ||
          msg.ts <= lastRemoteTsRef.current ||
          !msg.snap
        ) {
          return;
        }
        lastRemoteTsRef.current = msg.ts;
        snapRef.current = {
          ...snapRef.current,
          focusMs: typeof msg.snap.focusMs === "number" ? msg.snap.focusMs : snapRef.current.focusMs,
          breakMs: typeof msg.snap.breakMs === "number" ? msg.snap.breakMs : snapRef.current.breakMs,
          runningSinceMs: msg.snap.runningSinceMs ?? null,
          isPaused: msg.snap.isPaused === true,
          phase: VALID_PHASES.includes(msg.snap.phase) ? msg.snap.phase : snapRef.current.phase,
          remainingMs:
            msg.snap.remainingMs === undefined ? snapRef.current.remainingMs : msg.snap.remainingMs,
          timestamp: msg.ts,
        };
        // Adopt the primary tab's session id so every tab settles ONE row.
        if (typeof msg.sessionId === "number" && !sessionIdRef.current) {
          sessionIdRef.current = msg.sessionId;
          setSessionId(msg.sessionId);
        }
        setIsPaused(snapRef.current.isPaused);
        isPausedRef.current = snapRef.current.isPaused;
        setPhase(snapRef.current.phase);
        phaseRef.current = snapRef.current.phase;
        const d = deriveTimer(snapRef.current, Date.now());
        setElapsedSeconds(d.focusSec);
        elapsedSecondsRef.current = d.focusSec;
        setBreakSeconds(d.breakSec);
        breakSecondsRef.current = d.breakSec;
        setRemainingSeconds(d.remainingSec);
        remainingSecondsRef.current = d.remainingSec;
      };
      return () => {
        bc.close();
        bcRef.current = null;
      };
    }
  }, [cacheKey]);

  // ─── Derivation → React state sync (single path) ────────
  const syncStateFromSnapshot = useCallback(() => {
    const d = deriveTimer(snapRef.current, Date.now());
    if (d.focusSec !== elapsedSecondsRef.current) {
      elapsedSecondsRef.current = d.focusSec;
      setElapsedSeconds(d.focusSec);
      try {
        sessionStorage.setItem(timerKey, String(d.focusSec));
      } catch { /* ignore */ }
    }
    if (d.breakSec !== breakSecondsRef.current) {
      breakSecondsRef.current = d.breakSec;
      setBreakSeconds(d.breakSec);
    }
    if (d.remainingSec !== remainingSecondsRef.current) {
      remainingSecondsRef.current = d.remainingSec;
      setRemainingSeconds(d.remainingSec);
    }
  }, [timerKey]);

  // ─── Countdown setter (banks the live stretch, re-anchors) ──
  const setCountdown = useCallback(
    (sec: number | null) => {
      snapRef.current = setCountdownSnapshot(snapRef.current, sec, Date.now());
      const d = deriveTimer(snapRef.current, Date.now());
      remainingSecondsRef.current = d.remainingSec;
      setRemainingSeconds(d.remainingSec);
      transitionFiredRef.current = false;
      persistTimerState();
      broadcastSnapshot();
    },
    [persistTimerState, broadcastSnapshot]
  );

  // ─── Throttled Flush Helper ────────────────────────
  const flushSessionProgress = useCallback(
    async (isFinal: boolean = false, completeQuest: boolean = false): Promise<boolean> => {
      // Serialize flushes: if one is in flight, the next waits for it instead
      // of racing. Races could deliver an older durationSeconds after the
      // final flush, and overlapping retries looked like a dead button.
      if (flushInFlightRef.current) {
        try {
          await flushInFlightRef.current;
        } catch {
          // swallow — the new flush below will do the authoritative write
        }
      }

      const currSeconds = elapsedSecondsRef.current;
      const currBreakSeconds = breakSecondsRef.current;
      const currentSessionId = sessionIdRef.current;

      // Mirror tabs never write to the server — only the primary tab flushes.
      if (!isPrimaryRef.current) return false;
      if (!currentSessionId) return false;
      // Skip redundant zero-delta writes if not final (break time is a SET on
      // the server, so it must still be sent whenever it advanced too).
      if (
        !isFinal &&
        currSeconds <= lastSyncedSecondsRef.current &&
        currBreakSeconds <= lastSyncedBreakSecondsRef.current
      ) {
        return true;
      }
      if (isSyncingRef.current && !isFinal) return false;

      isSyncingRef.current = true;
      const durationMinutes = Math.floor(currSeconds / 60);
      const durationSeconds = currSeconds;

      const run = (async () => {
        try {
          const res = await fetch("/api/sessions", {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              id: currentSessionId,
              durationMinutes,
              durationSeconds,
              breakSeconds: currBreakSeconds,
              questId: questId ? parseInt(questId) : undefined,
              completeQuest: completeQuest || undefined,
              // Only the final flush triggers the single canonical reward award;
              // the RPC performs exact delta accounting on every flush.
              final: isFinal || undefined,
            }),
            keepalive: true,
          });

          if (res.ok) {
            lastSyncedSecondsRef.current = currSeconds;
            lastSyncedBreakSecondsRef.current = currBreakSeconds;
            if (isFinal) {
              // Local Storage Cleanup ONLY after 200 OK
              localStorage.removeItem(cacheKey);
              sessionStorage.removeItem(timerKey);
              sessionStorage.removeItem("runningTimerSeconds");
            } else {
              persistTimerState();
            }
            return true;
          }
          return false;
        } catch (err) {
          console.error("Failed to flush session progress:", err);
          return false;
        } finally {
          isSyncingRef.current = false;
        }
      })();

      flushInFlightRef.current = run;
      run.finally(() => {
        if (flushInFlightRef.current === run) flushInFlightRef.current = null;
      });
      return run;
    },
    [cacheKey, timerKey, questId, persistTimerState]
  );

  // ─── Fire-and-forget unload flush (no awaits — keepalive survives) ──
  const sendBeaconFlush = useCallback(() => {
    const sid = sessionIdRef.current;
    // Mirror tabs never write to the server — only the primary tab flushes.
    if (!isPrimaryRef.current) return;
    if (!sid) return;
    try {
      const payload = JSON.stringify({
        id: sid,
        durationMinutes: Math.floor(elapsedSecondsRef.current / 60),
        durationSeconds: elapsedSecondsRef.current,
        breakSeconds: breakSecondsRef.current,
        questId: questId ? parseInt(questId) : undefined,
        final: false,
      });
      fetch("/api/sessions", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    } catch { /* ignore */ }
  }, [questId]);

  // ─── Fetch Quest Data if questId is present ────────
  useEffect(() => {
    if (!questId) return;
    fetch(`/api/quests/${questId}`)
      .then(async (res) => (res.ok ? res.json().catch(() => ({})) : {}))
      .then(data => {
        if (data.id) setQuestData(data);
      })
      .catch(console.error);
  }, [questId]);

  // ─── Initialize Timer Based on Mode ────────────────
  useEffect(() => {
    if (activeMode === null && !questData) return; // wait for mode or quest

    // A persisted running timer was restored — the exact phase/countdown must
    // win over the mode defaults, otherwise a reload mid-break would silently
    // restart/overwrite the session state.
    if (restoredStateRef.current) return;

    if (questData) {
      const remaining = Math.max(0, (questData.requiredMinutes * 60) - (questData.elapsedSeconds || 0));
      if (remaining === 0) {
        setCountdown(null); // Already reached time, straight to overtime
        setPhaseLabel("QUEST OVERTIME");
        phaseLabelRef.current = "QUEST OVERTIME";
      } else {
        setCountdown(remaining);
        setPhaseLabel("QUEST FOCUS");
        phaseLabelRef.current = "QUEST FOCUS";
      }
      setPhase("focus");
      phaseRef.current = "focus";
      setTotalSessions(1);
      return;
    }

    if (activeMode === null) return;

    const get = (key: string, fallback: number) =>
      Number(getSetting(activeMode, key, fallback));

    switch (activeMode.id) {
      case "pomodoro": {
        const focusMin = get("focusDuration", 25);
        const sessionsBeforeLong = get("sessionsBeforeLong", 4);
        setCountdown(focusMin * 60);
        setTotalSessions(sessionsBeforeLong);
        setPhase("focus");
        setPhaseLabel("FOCUS");
        break;
      }
      case "5217": {
        // Data-backed 52/17 rhythm: long work block, real recovery break.
        const workMin = get("workDuration", 52);
        const cycles = get("cycles", 3);
        setCountdown(workMin * 60);
        setTotalSessions(cycles);
        setPhase("focus");
        setPhaseLabel("52/17 FOCUS");
        break;
      }
      case "animedoro": {
        // Long focus block rewarded with a guilt-free fun break.
        const focusMin = get("focusDuration", 45);
        const cycles = get("cycles", 3);
        setCountdown(focusMin * 60);
        setTotalSessions(cycles);
        setPhase("focus");
        setPhaseLabel("ANIMEDORO FOCUS");
        break;
      }
      case "deepwork": {
        const sessionMin = get("sessionLength", 90);
        setCountdown(sessionMin * 60);
        setPhase("focus");
        setPhaseLabel("DEEP WORK");
        setTotalSessions(1);
        break;
      }
      case "sprint": {
        const sprintMin = get("sprintDuration", 10);
        const sprints = get("totalSprints", 6);
        setCountdown(sprintMin * 60);
        setTotalSessions(sprints);
        setPhase("focus");
        setPhaseLabel("SPRINT 1/" + sprints);
        break;
      }
      case "flowtime": {
        // Flexible: open-ended stopwatch; breaks are taken on demand.
        setCountdown(null);
        setPhase("focus");
        setPhaseLabel("FLOW");
        setTotalSessions(1);
        break;
      }
      case "freeflow":
      default: {
        // Stopwatch mode
        setCountdown(null);
        setPhase("focus");
        setPhaseLabel("FREE FLOW");
        break;
      }
    }

    // Trigger Fullscreen for Deep Work (respects the autoFullscreen setting)
    if (
      activeMode.id === "deepwork" &&
      getSetting(activeMode, "autoFullscreen", true) !== false
    ) {
      try {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
      } catch {
        // ignore if not allowed by browser
      }
    }
  }, [activeMode, questData, setCountdown]);

  // ─── Notification chime (uses Web Audio API) ───────
  const playChime = useCallback(() => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
      osc.start();
      osc.stop(ctx.currentTime + 0.8);
    } catch { /* audio not available */ }
  }, []);

  // ─── Handle Phase Transition (epoch-anchored) ────────
  const transitionPhase = useCallback(() => {
    if (questData) {
      playChime();
      setShowQuestPopup(true);
      questPopupTimeoutRef.current = setTimeout(() => {
        setShowQuestPopup(false);
        setCountdown(null); // switch to stopwatch (Free Flow)
        setPhaseLabel("QUEST OVERTIME");
        phaseLabelRef.current = "QUEST OVERTIME";
      }, 15000);
      return;
    }

    if (!activeMode) return;

    const get = (key: string, fallback: number) =>
      Number(getSetting(activeMode, key, fallback));

    // End-of-session chime is a per-mode setting (silent modes stay silent).
    const chimeEnabled = getSetting(activeMode, "endChime", true) !== false;
    if (chimeEnabled) playChime();

    let nextPhase: TimerPhase;
    let nextRemaining: number | null;
    let nextPaused = false;
    let nextSession = currentSession;
    let nextLabel = phaseLabel;
    let nextPauseReason: PauseReason = "manual";

    // Auto-start boundaries: when disabled, the timer pauses at the
    // transition so the next block only begins when the user resumes.
    const pauseIf = (autoSetting: string) => {
      if (getSetting(activeMode, autoSetting, true) === false) nextPaused = true;
    };

    if (activeMode.id === "pomodoro") {
      const sessionsBeforeLong = get("sessionsBeforeLong", 4);
      if (phase === "focus") {
        if (currentSession >= sessionsBeforeLong) {
          // Long break
          nextPhase = "long-break";
          nextRemaining = get("longBreak", 15) * 60;
          nextLabel = "LONG BREAK";
        } else {
          // Short break
          nextPhase = "short-break";
          nextRemaining = get("shortBreak", 5) * 60;
          nextLabel = "SHORT BREAK";
        }
        pauseIf("autoStartBreaks");
      } else {
        // After a break → next focus session
        nextSession = phase === "long-break" ? 1 : currentSession + 1;
        nextPhase = "focus";
        nextRemaining = get("focusDuration", 25) * 60;
        nextLabel = `FOCUS ${nextSession}/${totalSessions}`;
        pauseIf("autoStartFocus");
      }
    } else if (activeMode.id === "5217") {
      // 52/17 rhythm: work block ↔ real recovery break, cycling.
      if (phase === "focus") {
        nextPhase = "short-break";
        nextRemaining = get("breakDuration", 17) * 60;
        nextLabel = "RECOVERY BREAK";
        pauseIf("autoStartBreaks");
      } else {
        nextSession = currentSession + 1;
        nextPhase = "focus";
        nextRemaining = get("workDuration", 52) * 60;
        nextLabel = `52/17 FOCUS ${nextSession}/${totalSessions}`;
        pauseIf("autoStartFocus");
      }
    } else if (activeMode.id === "animedoro") {
      // Animedoro: focus block → guilt-free reward break, cycling.
      if (phase === "focus") {
        nextPhase = "long-break";
        nextRemaining = get("rewardBreak", 20) * 60;
        nextLabel = "REWARD BREAK";
        pauseIf("autoStartBreaks");
      } else {
        nextSession = currentSession + 1;
        nextPhase = "focus";
        nextRemaining = get("focusDuration", 45) * 60;
        nextLabel = `ANIMEDORO FOCUS ${nextSession}/${totalSessions}`;
        pauseIf("autoStartFocus");
      }
    } else if (activeMode.id === "sprint") {
      if (phase === "focus") {
        if (currentSession >= totalSessions) {
          // All sprints done
          nextPhase = "done";
          nextRemaining = null;
          nextLabel = "SPRINTS COMPLETE";
        } else {
          nextPhase = "rest";
          nextRemaining = get("restDuration", 2) * 60;
          nextLabel = "REST";
          pauseIf("autoStartRests");
        }
      } else {
        // After rest → next sprint
        nextSession = currentSession + 1;
        nextPhase = "focus";
        nextRemaining = get("sprintDuration", 10) * 60;
        nextLabel = `SPRINT ${nextSession}/${totalSessions}`;
        pauseIf("autoStartSprints");
      }
    } else if (activeMode.id === "deepwork") {
      // Deep work done → break
      if (phase === "focus") {
        nextPhase = "long-break";
        nextRemaining = get("breakLength", 20) * 60;
        nextLabel = "BREAK";
      } else {
        nextPhase = "done";
        nextRemaining = null;
        nextLabel = "SESSION COMPLETE";
      }
    } else if (activeMode.id === "flowtime") {
      // Flowtime: the break countdown finished. NEVER silently resume the
      // open-ended focus stopwatch — the user must consciously resume. This
      // is what made a break bleed into study time: an auto-resumed stopwatch
      // kept counting while the user was away from the phone.
      nextPhase = "focus";
      nextRemaining = null;
      nextLabel = "BREAK OVER";
      nextPaused = true;
      nextPauseReason = "break-over";
      setFlowNudge(false);
    } else {
      return;
    }

    // Epoch transition: bank the current stretch, switch phase, re-anchor
    // the countdown at the wall clock. No tick arithmetic anywhere.
    snapRef.current = transitionSnapshot(snapRef.current, Date.now(), {
      phase: nextPhase,
      remainingSec: nextRemaining,
      paused: nextPaused,
    });

    setPhase(nextPhase);
    phaseRef.current = nextPhase;
    setPhaseLabel(nextLabel);
    phaseLabelRef.current = nextLabel;
    setCurrentSession(nextSession);
    currentSessionRef.current = nextSession;
    setRemainingSeconds(nextRemaining);
    remainingSecondsRef.current = nextRemaining;
    setIsPaused(nextPaused);
    isPausedRef.current = nextPaused;
    if (nextPaused) setPauseReason(nextPauseReason);
    transitionFiredRef.current = false;
    persistTimerState();
    broadcastSnapshot();
  }, [activeMode, phase, currentSession, totalSessions, phaseLabel, questData, playChime, setCountdown, persistTimerState, broadcastSnapshot]);

  useEffect(() => {
    transitionPhaseRef.current = transitionPhase;
  }, [transitionPhase]);

  // ─── Session helpers ───────────────────────────────
  // End/Complete used to silently no-op when the session had failed to start
  // (sessionIdRef null) — the buttons looked dead. ensureSession() retries the
  // start so a user can always recover, and returns the live session id.
  // initialSeconds backdates the new session row so the server-side wall-clock
  // clamp never truncates legitimate carried-over time.
  const ensureSession = useCallback(async (initialSeconds: number = 0): Promise<number | null> => {
    if (sessionIdRef.current) return sessionIdRef.current;
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subjectId: subjectId ? parseInt(subjectId) : undefined,
          questId: questId ? parseInt(questId) : undefined,
          initialSeconds,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.id) {
          setSessionId(data.id);
          sessionIdRef.current = data.id;
          broadcastSnapshot();
          return data.id;
        }
      }
    } catch (err) {
      console.error("Failed to (re)start session:", err);
    }
    return null;
  }, [subjectId, questId, broadcastSnapshot]);

  // ─── Fetch daily baselines on mount (no eager session row!) ────
  // A StudySession row is now created LAZILY — after 15 seconds of real
  // focus — so merely visiting /focus no longer leaks abandoned 0-second
  // rows. A carried-over legacy timer is attached immediately instead.
  useEffect(() => {
    if (sessionStartedRef.current) return;
    sessionStartedRef.current = true;

    async function startSessionAndFetchData() {
      try {
        const [subRes, statsRes] = await Promise.all([
          fetch("/api/subjects"),
          fetch("/api/user/stats"),
        ]);

        let total = 0;
        if (statsRes.ok) {
          const stats = await statsRes.json();
          // todayStudySeconds includes this session's already-flushed
          // (stored) seconds; completedTodaySeconds excludes active sessions.
          total = stats.todayStudySeconds ?? stats.completedTodaySeconds ?? 0;
        }

        let currentSubjectTime = 0;
        if (subRes.ok) {
          const subjects = await subRes.json();
          let subjectsTotal = 0;
          subjects.forEach((sub: { id: number; todaySeconds: number }) => {
            subjectsTotal += sub.todaySeconds;
            if (subjectId && sub.id === parseInt(subjectId)) {
              currentSubjectTime = sub.todaySeconds;
            }
          });
          if (total === 0) total = subjectsTotal;
        }

        // The daily baselines include this session's previously-flushed
        // (credited) seconds — subtract them so the displayed total is
        // exactly: completed-earlier + live-elapsed. (This is the correct
        // complement of todayStudySeconds now that active sessions keep
        // endedAt = NULL between flushes.)
        const alreadyCredited = lastSyncedSecondsRef.current || 0;
        setInitialTotalSeconds(Math.max(0, total - alreadyCredited));
        setInitialSubjectSeconds(Math.max(0, currentSubjectTime - alreadyCredited));

        // Legacy carry: seconds restored without a session id → attach now.
        if (!sessionIdRef.current && elapsedSecondsRef.current > 0) {
          void ensureSession(elapsedSecondsRef.current);
        }

        persistTimerState();
      } catch (err) {
        console.error("Failed to fetch baseline stats:", err);
      }
    }

    startSessionAndFetchData();
  }, [subjectId, cacheKey, persistTimerState, ensureSession]);

  // ─── Main Timer Tick (derivation only — no accumulation) ──
  const tick = useCallback(() => {
    const now = Date.now();
    const snap = snapRef.current;
    if (snap.isPaused || snap.phase === "done") return;
    const d = deriveTimer(snap, now);

    // Countdown crossed (possibly while backgrounded/sleeping) → transition
    // exactly once. Only fires when the mode/quest context is loaded so the
    // correct next phase can be chosen; it retries every tick until then.
    if (
      !transitionFiredRef.current &&
      snap.remainingMs !== null &&
      d.remainingRawMs !== null &&
      d.remainingRawMs <= 0
    ) {
      const ready = questDataRef.current !== null || activeModeRef.current !== null;
      if (ready) {
        transitionFiredRef.current = true;
        transitionPhaseRef.current();
        return;
      }
    }

    // Derived values → display state (no-op when unchanged).
    syncStateFromSnapshot();

    // Lazy session start: create the DB row after 15s of real focus.
    // Only the primary tab may create the session or queue auto-saves;
    // mirror tabs display the synced state read-only.
    if (isPrimaryRef.current) {
      if (
        !sessionIdRef.current &&
        snap.phase === "focus" &&
        d.focusSec >= 15 &&
        !sessionStartPendingRef.current
      ) {
        sessionStartPendingRef.current = true;
        ensureSession(d.focusSec).finally(() => {
          sessionStartPendingRef.current = false;
        });
      }

      // Throttled Auto-Save Checkpoint: flush every 3 minutes (180s) of
      // active focus. No side effects inside the tick — just flag it.
      if (d.focusSec - lastSyncedSecondsRef.current >= 180) {
        autoFlushDueRef.current = true;
      }
    }

    // Persist at most once per second (anchors, never counters).
    if (now - lastPersistRef.current >= 1000) {
      lastPersistRef.current = now;
      persistTimerState();
    }
  }, [syncStateFromSnapshot, ensureSession, persistTimerState]);

  useEffect(() => {
    tickRef.current = tick;
  });

  // Interval is created ONCE per pause/phase change (not every second) —
  // the tick re-derives everything from the wall clock.
  useEffect(() => {
    if (isPaused || phase === "done") return;

    intervalRef.current = setInterval(() => {
      tickRef.current?.();
    }, 500);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPaused, phase]);

  // ─── Auto-save checkpoint (consumes the flag set by the tick) ──
  useEffect(() => {
    if (!autoFlushDueRef.current) return;
    autoFlushDueRef.current = false;
    if (!isPrimaryRef.current) return;
    flushSessionProgress(false);
  }, [elapsedSeconds, flushSessionProgress]);

  // ─── Page Lifecycle, Visibility & Unload Sync ─────────
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Synchronous fire-and-forget: no awaits, keepalive survives unload.
      persistTimerState();
      sendBeaconFlush();
    };

    const handlePageHide = () => {
      persistTimerState();
      sendBeaconFlush();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        lastPersistRef.current = 0;
        persistTimerState();
        sendBeaconFlush();
      } else {
        // Returning from a backgrounded tab / sleep / lock: recalculate
        // immediately from the wall-clock anchor — background time counts.
        lastPersistRef.current = 0;
        tickRef.current?.();
      }
    };

    const handlePageShow = () => {
      // bfcache restore / back-forward navigation: recalculate from the
      // wall-clock anchors immediately.
      lastPersistRef.current = 0;
      tickRef.current?.();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [persistTimerState, sendBeaconFlush]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleTogglePause = async () => {
    // A mirror tab takes over leadership before mutating anything.
    await acquireLeadership();
    // Anchor-based pause/resume — immune to stale render closures and
    // rapid double-clicks (each call reads the live snapshot).
    if (snapRef.current.isPaused) {
      snapRef.current = resumeSnapshot(snapRef.current, Date.now());
      setIsPaused(false);
      isPausedRef.current = false;
    } else {
      snapRef.current = pauseSnapshot(snapRef.current, Date.now());
      setIsPaused(true);
      isPausedRef.current = true;
      setPauseReason("manual");
    }
    syncStateFromSnapshot();
    // Persist immediately so a backgrounded/killed tab restores the pause
    // state (a reload while paused must never silently resume counting).
    persistTimerState();
    broadcastSnapshot();
    // Flush on pause/resume boundary
    await flushSessionProgress(false);
  };

  const handleEndSession = async () => {
    if (isEnding) return;
    setIsEnding(true);
    setEndError(null);

    try {
      // A mirror tab takes over leadership before finalizing.
      await acquireLeadership();
      // If the session never started (flaky start request), retry it first —
      // previously the button silently no-op'd and looked broken.
      const sid = sessionIdRef.current || (await ensureSession(elapsedSecondsRef.current));
      if (!sid) {
        setIsEnding(false);
        setEndError("Couldn't start the session — check your connection and try again.");
        return;
      }
      // isFinal = true, completeQuest = false (logs time, keeps quest active)
      const success = await flushSessionProgress(true, false);
      if (success) {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
        releaseLeadership();
        void refreshStats();
        announceSessionEnd();
        router.push("/timer");
      } else {
        setIsEnding(false);
        setEndError("Couldn't finish the session — check your connection and try again. Your in-session progress is safe.");
      }
    } catch (err) {
      console.error("Failed to end session:", err);
      setIsEnding(false);
      setEndError("Couldn't finish the session — check your connection and try again. Your in-session progress is safe.");
    }
  };

  const handleCompleteQuest = async () => {
    if (isEnding) return;
    setIsEnding(true);
    setEndError(null);

    try {
      // A mirror tab takes over leadership before finalizing.
      await acquireLeadership();
      const sid = sessionIdRef.current || (await ensureSession(elapsedSecondsRef.current));
      if (!sid) {
        setIsEnding(false);
        setEndError("Couldn't start the session — check your connection and try again.");
        return;
      }
      // isFinal = true, completeQuest = true (completes quest, credits XP and node progress)
      const success = await flushSessionProgress(true, true);
      if (success) {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
        releaseLeadership();
        void refreshStats();
        announceSessionEnd();
        router.push("/timer");
      } else {
        setIsEnding(false);
        setEndError("Couldn't complete the quest — check your connection and try again. Your in-session progress is safe.");
      }
    } catch (err) {
      console.error("Failed to complete quest:", err);
      setIsEnding(false);
      setEndError("Couldn't complete the quest — check your connection and try again. Your in-session progress is safe.");
    }
  };

  /**
   * Broadcast the just-finished session so the global toast can surface the
   * exact duration on the next page, and persist it for reload resilience.
   */
  const announceSessionEnd = () => {
    const summary = {
      durationSeconds: elapsedSecondsRef.current,
      breakSeconds: breakSecondsRef.current,
      subjectName: subjectName || null,
      questTitle: questData?.title || null,
    };
    try {
      localStorage.setItem(SESSION_SUMMARY_KEY, JSON.stringify(summary));
    } catch {}
    // Small delay so the redirect lands first — toast appears "after" the
    // focus room, on the destination page.
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent(SESSION_ENDED_EVENT, { detail: summary }));
    }, 300);
  };

  // ─── Flowtime: on-demand, focus-scaled breaks ────────
  const handleTakeFlowBreak = () => {
    if (activeMode?.id !== "flowtime") return;
    const focusMinutes = Math.max(1, Math.round(elapsedSecondsRef.current / 60));
    const autoScale = getSetting(activeMode, "autoScaleBreak", true) !== false;
    const defaultBreak = Number(getSetting(activeMode, "defaultBreak", 10));
    const maxBreak = Number(getSetting(activeMode, "maxBreak", 20));
    // Flowtime doctrine: ~10% of the focus block, clamped to 5–max minutes.
    const scaled = Math.max(5, Math.round(focusMinutes * 0.1));
    const breakMin = Math.max(1, Math.min(maxBreak, autoScale ? scaled : defaultBreak));
    setCountdown(breakMin * 60);
    setPhase("long-break");
    phaseRef.current = "long-break";
    setPhaseLabel("FLOW BREAK");
    phaseLabelRef.current = "FLOW BREAK";
    setFlowNudge(false);
    persistTimerState();
  };

  const handleSkipFlowBreak = () => {
    setCountdown(null);
    setPhase("focus");
    phaseRef.current = "focus";
    setPhaseLabel("FLOW");
    phaseLabelRef.current = "FLOW";
    setFlowNudge(false);
    persistTimerState();
  };

  // Flowtime stretch nudge — fires at the configured reminder interval.
  useEffect(() => {
    if (!activeMode || activeMode.id !== "flowtime" || phase !== "focus") return;
    const intervalMin = Number(getSetting(activeMode, "reminderInterval", 45));
    if (intervalMin <= 0) return;
    if (elapsedSeconds > 0 && elapsedSeconds % (intervalMin * 60) === 0) {
      setFlowNudge(true);
      const timer = setTimeout(() => setFlowNudge(false), 12000);
      return () => clearTimeout(timer);
    }
  }, [elapsedSeconds, activeMode, phase]);

  // Determine display time — countdown for timed modes, elapsed for stopwatch
  const displayTime = remainingSeconds !== null ? remainingSeconds : elapsedSeconds;
  const isCountdown = remainingSeconds !== null;
  const isBreak = phase === "short-break" || phase === "long-break" || phase === "rest";

  // Phase color (sprint intensity shifts the focus accent)
  const sprintIntensity =
    activeMode?.id === "sprint" ? String(getSetting(activeMode, "intensity", "High")) : null;
  const phaseColor = isBreak
    ? "var(--accent-green)"
    : phase === "done"
    ? "var(--accent-gold)"
    : activeMode?.id === "sprint" && phase === "focus"
    ? sprintIntensity === "Extreme"
      ? "#ef4444"
      : sprintIntensity === "Medium"
      ? "#fbbf24"
      : "#fb923c"
    : activeMode?.id === "freeflow" && phase === "focus"
    ? "#10b981"
    : "var(--accent-primary)";

  // Mode display name
  const modeDisplayName = activeMode?.name || "Free Flow";

  return (
    <FocusToolsProvider subjectName={subjectName} questTitle={questData?.title}>
      <div
        className="h-screen flex flex-col justify-between items-center py-6 sm:py-8 px-4 select-none relative overflow-hidden bg-bg-void text-text-primary transition-colors duration-500"
      style={{
        // Height-lock the focus page to the visible viewport: `min-h-screen`
        // let the page grow past the viewport on mobile, so the document (and
        // the fixed tool windows with it) scrolled. `100dvh` tracks the
        // mobile URL-bar-aware height; `h-screen` above is the old-browser
        // fallback since an unsupported inline value is simply ignored.
        height: "100dvh",
        background: phase.includes("break") || phase === "rest"
          ? "radial-gradient(ellipse at center, rgba(34, 197, 94, 0.08) 0%, var(--bg-void) 75%)"
          : "radial-gradient(ellipse at center, var(--accent-primary-dim) 0%, var(--bg-void) 75%)",
      }}
    >
      {/* Mirror-tab notice: another tab is the single writer for this
          session. Display stays synced; the next explicit action here
          takes over leadership. */}
      {!isPrimary && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-full border border-amber-500/40 bg-amber-500/10 backdrop-blur-xl text-amber-300 text-xs font-bold uppercase tracking-wider">
          Timer is running in another tab of this browser — your next action will take over
        </div>
      )}
      {/* Eye-Comfort Dim Layer (Light Mode only) — a full-viewport,
          non-interactive dimmer above ALL focus UI: the whole screen
          (background, timer digits, controls, dock) drops to low
          luminance while every control stays clickable underneath. */}
      {isDimActive && (
        <div aria-hidden="true" className="focus-dim-overlay" data-testid="focus-dim-overlay" />
      )}
      {/* ─── Top Header Section ─────────────────── */}
      <div className="w-full flex flex-col items-center text-center gap-1.5 shrink-0 z-10 max-w-2xl px-4">
        {/* Mode / Phase Badge */}
        <div className="flex items-center justify-center">
          <span
            className="text-xs tracking-[0.2em] uppercase font-bold px-3.5 py-1 rounded-full border shadow-sm transition-colors"
            style={{
              fontFamily: "'Rajdhani', sans-serif",
              color: phaseColor,
              backgroundColor: "var(--accent-primary-dim)",
              borderColor: "var(--accent-primary-mid)",
            }}
          >
            {questData ? phaseLabel : (modeDisplayName.toUpperCase() === phaseLabel.toUpperCase() ? phaseLabel : `${modeDisplayName} • ${phaseLabel}`)}
          </span>
        </div>

        {/* Main Focus Title (Quest Title or Subject Name) */}
        <h1
          className="text-xl sm:text-2xl md:text-3xl font-bold tracking-wide text-text-primary mt-1 leading-snug line-clamp-2"
          style={{ fontFamily: "'Rajdhani', sans-serif" }}
        >
          {questData ? questData.title : subjectName}
        </h1>

        {/* Secondary Context (Subject tag if different from Quest title) */}
        {questData && subjectName && subjectName.toLowerCase() !== questData.title.toLowerCase() && (
          <span className="text-xs text-text-muted font-mono bg-bg-abyss/80 border border-border-subtle px-2.5 py-0.5 rounded-full mt-0.5">
            Subject: {subjectName}
          </span>
        )}
      </div>

      {/* ─── Center Core: Digital Timer & Sub-stats ─ */}
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center my-auto py-4 z-10 w-full max-w-4xl text-center">
        {/* Dynamic Responsive Digital Timer */}
        <div
          className="text-5xl xs:text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-bold font-mono tracking-tight leading-none my-2 select-none"
          style={{
            color: phaseColor,
            textShadow: `0 0 35px var(--accent-primary-dim)`,
            transition: "color 0.5s ease",
          }}
        >
          {formatTime(displayTime)}
        </div>

        {/* Sub-timers (only in countdown modes, show elapsed) */}
        {isCountdown && (
          <p
            className="mt-2 font-mono text-sm sm:text-base text-text-muted"
          >
            Total elapsed: {formatTime(elapsedSeconds)}
            {breakSeconds > 0 && (
              <span className="text-accent-green/80">
                {" · "}Break: {formatTime(breakSeconds)}
              </span>
            )}
          </p>
        )}

        {/* Stopwatch (freeflow/flowtime): break time shown when on a break */}
        {!isCountdown && isBreak && breakSeconds > 0 && (
          <p className="mt-2 font-mono text-sm sm:text-base text-text-muted">
            Break: {formatTime(breakSeconds)} — not counted as study time
          </p>
        )}
        {/* Flowtime break-over hint while paused */}
        {isPaused && pauseReason === "break-over" && !isCountdown && (
          <p className="mt-2 font-mono text-xs sm:text-sm text-accent-gold/80 font-['Rajdhani'] font-bold uppercase tracking-wider">
            Break over — press Resume to continue focusing
          </p>
        )}
        {/* Manual pause hint */}
        {isPaused && pauseReason === "manual" && (
          <p className="mt-2 font-mono text-xs sm:text-sm text-accent-gold/80 font-['Rajdhani'] font-bold uppercase tracking-wider">
            Session paused — press Resume to continue
          </p>
        )}

        {/* Flowtime stretch-break nudge */}
        {flowNudge && (
          <button
            onClick={handleTakeFlowBreak}
            className="mt-4 px-5 py-2.5 rounded-full border border-amber-400/50 bg-amber-400/10 text-amber-300 text-xs sm:text-sm font-['Rajdhani'] font-bold uppercase tracking-wider hover:bg-amber-400/20 transition-all animate-pulse"
          >
            ☕ You&apos;ve focused {formatTime(elapsedSeconds)} — stretch break?
          </button>
        )}

        {/* Daily Cumulative Totals */}
        <div className="flex flex-wrap gap-6 sm:gap-12 mt-6 justify-center font-mono text-base sm:text-lg text-text-secondary">
          <div className="flex flex-col items-center">
            <span
              className="text-xs tracking-widest uppercase mb-1 text-text-muted font-bold"
              style={{ fontFamily: "'Rajdhani', sans-serif" }}
            >
              Today&apos;s Subject Total
            </span>
            <span className="font-bold text-text-primary">{formatTime(initialSubjectSeconds + elapsedSeconds)}</span>
          </div>
          <div className="flex flex-col items-center">
            <span
              className="text-xs tracking-widest uppercase mb-1 text-text-muted font-bold"
              style={{ fontFamily: "'Rajdhani', sans-serif" }}
            >
              Daily Cumulative Focus
            </span>
            <span className="font-bold text-text-primary">{formatTime(initialTotalSeconds + elapsedSeconds)}</span>
          </div>
        </div>

        {/* Pomodoro / 52·17 / Animedoro / Sprint session dots */}
        {activeMode && (activeMode.id === "pomodoro" || activeMode.id === "sprint" || activeMode.id === "5217" || activeMode.id === "animedoro") && (
          <div className="flex gap-2 mt-6">
            {Array.from({ length: totalSessions }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  background:
                    i + 1 < currentSession
                      ? phaseColor
                      : i + 1 === currentSession
                      ? `${phaseColor}`
                      : "var(--border-subtle)",
                  boxShadow:
                    i + 1 === currentSession ? `0 0 8px ${phaseColor}` : "none",
                  transition: "all 0.3s ease",
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* ─── Bottom Action Controls ──────────────── */}
      <div className="w-full flex flex-wrap justify-center items-center gap-3 sm:gap-4 shrink-0 z-10 px-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        {/* Pause/Resume button */}
        {phase !== "done" && (
          <button
            onClick={handleTogglePause}
            className="flex items-center gap-3 px-6 py-3 rounded-full bg-bg-panel hover:bg-bg-shadow hover:scale-105 active:scale-95 transition-all duration-200 border border-border-subtle hover:border-accent-primary-mid shadow-lg text-text-primary"
          >
            {isPaused ? (
              <>
                <svg className="w-5 h-5 text-accent-light" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                <span
                  className="text-sm uppercase tracking-wider font-bold"
                  style={{ fontFamily: "'Rajdhani', sans-serif" }}
                >
                  Resume
                </span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5 text-gold" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                </svg>
                <span
                  className="text-sm uppercase tracking-wider font-bold"
                  style={{ fontFamily: "'Rajdhani', sans-serif" }}
                >
                  Pause
                </span>
              </>
            )}
          </button>
        )}

        {/* Flowtime: on-demand break controls */}
        {activeMode?.id === "flowtime" && phase === "focus" && remainingSeconds === null && (
          <button
            onClick={handleTakeFlowBreak}
            className="flex items-center gap-3 px-6 py-3 rounded-full bg-amber-500/10 hover:bg-amber-500/20 hover:scale-105 active:scale-95 transition-all duration-200 border border-amber-500/40 hover:border-amber-400/60 shadow-lg text-amber-300"
          >
            <span className="text-lg leading-none">☕</span>
            <span
              className="text-sm uppercase tracking-wider font-bold"
              style={{ fontFamily: "'Rajdhani', sans-serif" }}
            >
              Take a Break
            </span>
          </button>
        )}
        {activeMode?.id === "flowtime" && isBreak && (
          <button
            onClick={handleSkipFlowBreak}
            className="flex items-center gap-3 px-6 py-3 rounded-full bg-bg-panel hover:bg-bg-shadow hover:scale-105 active:scale-95 transition-all duration-200 border border-border-subtle hover:border-accent-primary-mid shadow-lg text-text-primary"
          >
            <span
              className="text-sm uppercase tracking-wider font-bold"
              style={{ fontFamily: "'Rajdhani', sans-serif" }}
            >
              Skip Break → Focus
            </span>
          </button>
        )}

        {/* End Session */}
        <button
          onClick={handleEndSession}
          disabled={isEnding}
          className="flex items-center gap-3 px-8 py-3.5 rounded-full bg-red-500/10 hover:bg-red-500/20 hover:scale-105 active:scale-95 transition-all duration-200 border border-red-500/30 hover:border-red-500/50 shadow-xl text-red-600 dark:text-red-400"
        >
          {isEnding ? (
            <span className="text-base sm:text-lg uppercase tracking-wider font-bold">
              Ending...
            </span>
          ) : (
            <>
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
              <span
                className="text-base sm:text-lg uppercase tracking-wider font-bold text-text-primary"
                style={{ fontFamily: "'Rajdhani', sans-serif" }}
              >
                End Session
              </span>
            </>
          )}
        </button>

        {/* Complete Quest (only shown when bound to an active quest) */}
        {questData && (
          <button
            onClick={handleCompleteQuest}
            disabled={isEnding}
            className="flex items-center gap-3 px-8 py-3.5 rounded-full bg-emerald-600 hover:bg-emerald-500 hover:scale-105 active:scale-95 transition-all duration-200 border border-emerald-400/50 shadow-[0_0_20px_rgba(16,185,129,0.35)] text-white"
            title="Complete quest and claim XP rewards"
          >
            <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-200" />
            <span
              className="text-base sm:text-lg uppercase tracking-wider font-bold"
              style={{ fontFamily: "'Rajdhani', sans-serif" }}
            >
              Complete Quest
            </span>
          </button>
        )}
      </div>

      {/* End / Complete failure feedback — never fail silently */}
      <AnimatePresence>
        {endError && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="fixed bottom-36 left-1/2 -translate-x-1/2 z-30 max-w-md w-[calc(100%-2rem)] px-4 py-3 rounded-xl border border-amber-500/40 bg-amber-500/10 backdrop-blur-xl text-center"
          >
            <p className="text-xs font-['Rajdhani'] font-semibold text-amber-300 leading-relaxed">
              {endError}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Paused Indicator — NO blur, NO dim: the timer stays fully visible so
          the session state is never hidden. The ring sits BELOW the main
          timer/totals block (never overlapping the digits) and above the
          bottom controls. */}
      <AnimatePresence>
        {isPaused && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-x-0 top-[25%] z-20 pointer-events-none flex justify-center"
          >
            <div className="flex flex-col items-center gap-2.5 select-none -translate-y-1/2">
              {/* Distinct paused symbol: pause bars inside a glowing amber ring */}
              <div
                className="w-16 h-16 rounded-full border-2 flex items-center justify-center"
                style={{
                  borderColor: "rgba(245, 158, 11, 0.55)",
                  background: "rgba(245, 158, 11, 0.08)",
                  boxShadow: "0 0 28px rgba(245, 158, 11, 0.22)",
                }}
              >
                <svg
                  className="w-7 h-7"
                  viewBox="0 0 24 24"
                  fill="var(--accent-gold)"
                >
                  <rect x="7" y="6" width="3.4" height="12" rx="1.2" />
                  <rect x="13.6" y="6" width="3.4" height="12" rx="1.2" />
                </svg>
              </div>
              <p
                style={{
                  fontFamily: "'Rajdhani', sans-serif",
                  fontSize: "1.1rem",
                  fontWeight: 700,
                  color: "var(--accent-gold)",
                  textTransform: "uppercase",
                  letterSpacing: "0.3em",
                }}
              >
                {pauseReason === "break-over" ? "Break Over" : "Paused"}
              </p>
              <p
                className="text-[0.65rem] uppercase tracking-[0.28em]"
                style={{ fontFamily: "'Rajdhani', sans-serif", color: "var(--text-muted)" }}
              >
                {pauseReason === "break-over"
                  ? "Resume when you're ready"
                  : "Timer on hold"}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      {/* Quest Completion Popup */}
      <AnimatePresence>
        {showQuestPopup && questData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-bg-overlay backdrop-blur-md"
              onClick={() => setShowQuestPopup(false)}
            />

            {/* Modal Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 12 }}
              transition={{ type: "spring", damping: 28, stiffness: 380 }}
              className="relative z-10 bg-bg-abyss border border-border-subtle p-8 rounded-2xl text-center max-w-md w-full shadow-2xl mx-4"
            >
              <h2 className="text-3xl font-bold text-accent-text-light mb-2" style={{ fontFamily: "'Rajdhani', sans-serif" }}>TIME&apos;S UP</h2>
              <p className="text-text-primary mb-8 font-medium">{questData.title}</p>
              
              <p className="text-sm text-amber-500 dark:text-yellow-400 mb-6 animate-pulse font-['Rajdhani'] font-bold tracking-wider uppercase">Did you successfully complete this quest?</p>

              <div className="flex flex-col gap-3">
                <button
                  onClick={async () => {
                    setShowQuestPopup(false);
                    if (questPopupTimeoutRef.current) clearTimeout(questPopupTimeoutRef.current);
                    await handleCompleteQuest();
                  }}
                  className="w-full py-3.5 rounded-xl bg-green-500/15 hover:bg-green-500/25 text-green-600 dark:text-green-400 font-bold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] border border-green-500/30 shadow-lg"
                >
                  Yes, Quest Completed!
                </button>
                
                <button
                  onClick={() => {
                    setShowQuestPopup(false);
                    if (questPopupTimeoutRef.current) clearTimeout(questPopupTimeoutRef.current);
                    setPhaseLabel("QUEST OVERTIME");
                    phaseLabelRef.current = "QUEST OVERTIME";
                    setCountdown(null);
                  }}
                  className="w-full py-3.5 rounded-xl bg-bg-panel hover:bg-bg-shadow text-text-primary font-bold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] border border-border-subtle"
                >
                  No, I Need More Time (Overtime)
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

        {/* ─── Floating Focus Tools Dock & Expandable Window ─── */}
        <FocusToolWindow />
        <FocusToolsDock
          dimControl={{ isDimActive, isLightMode, onToggleDim: toggleDim }}
          keepAwakeControl={{
            isActive: keepAwake.isActive,
            isSupported: keepAwake.isSupported,
            error: keepAwake.error,
            onToggle: keepAwake.toggle,
          }}
        />
      </div>
    </FocusToolsProvider>
  );
}

export default function FocusPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg-void" />}>
      <FocusContent />
    </Suspense>
  );
}
