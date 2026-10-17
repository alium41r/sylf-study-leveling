/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect, react-hooks/purity */
"use client";

import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/app/components/AuthProvider";
import { motion, AnimatePresence } from "framer-motion";
import { FocusToolsProvider } from "./FocusToolsContext";
import FocusToolsDock from "./FocusToolsDock";
import FocusToolWindow from "./FocusToolWindow";
import { useFocusEyeComfort } from "../hooks/useFocusEyeComfort";
import { useScreenWakeLock } from "../hooks/useScreenWakeLock";
import { useTimerLeadership } from "../hooks/useTimerLeadership";
import { SESSION_ENDED_EVENT, SESSION_SUMMARY_KEY } from "@/app/components/SessionEndToast";
import { useFocusBackground } from "../hooks/useFocusBackground";
import { reconcileSessionSnapshot, type SessionActionV2 } from "@/lib/planner/v2/session-client";
import { fetchWithTimeout } from "@/lib/api-transport";
import { TimezoneService } from "@/lib/timezone-service";
import { getTimerSync, TIMER_SYNC_EVENT, type TimerJournal } from "@/lib/timer-sync";
import { FocusBackgroundRenderer } from "./FocusBackgroundRenderer";
import FocusBackgroundPicker from "./FocusBackgroundPicker";
import { FocusTimerLayoutRouter } from "./FocusTimerLayoutRouter";
import { AcousticsProvider } from "@/app/components/AcousticsContext";
import {
  createInitialSnapshot,
  deriveTimer,
  pauseSnapshot,
  resumeSnapshot,
  setCountdownSnapshot,
  transitionSnapshot,
  legacyCacheToSnapshot,
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
  const { user } = useAuth();
  useEffect(() => { router.prefetch?.("/timer"); }, [router]);

  // Eye-Comfort Dimming (Light Mode only) — zero-IOPS client state
  const { isDimActive, isLightMode, toggleDim } = useFocusEyeComfort();

  // Keep the screen awake during the study session (Web Screen Wake Lock)
  const keepAwake = useScreenWakeLock();

  // Focus Background Atmosphere Engine (Phase 2)
  const focusBg = useFocusBackground();

  const subjectId = searchParams.get("subjectId");
  const subjectName = searchParams.get("subjectName") || "Focus Session";
  const questId = searchParams.get("questId");

  const legacyCacheKey = `runningTimerState_${subjectId || "general"}_${questId || "none"}`;
  const cacheKey = `${legacyCacheKey}_${user?.id}`;
  const timerKey = `runningTimerSeconds_${subjectId || "general"}_${questId || "none"}_${user?.id}`;

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
  const [attributedDay, setAttributedDay] = useState(() => TimezoneService.getUserLocalDate(user?.timezone ?? "UTC"));

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

  // ─── Epoch-anchored engine state (single source of truth) ───
  // elapsed/break/countdown are DERIVED from these wall-clock anchors on
  // every tick, on visibility changes, and on restore — never accumulated
  // by tick counters. Backgrounded tabs, throttled intervals, and sleep/
  // wake gaps are therefore credited exactly.
  const snapRef = useRef<TimerSnapshot>(createInitialSnapshot(Date.now()));
  const lastPersistRef = useRef(0);
  const lastCheckpointRef = useRef(0);
  const sessionStartPendingRef = useRef(false);
  const bcRef = useRef<BroadcastChannel | null>(null);
  const lastRemoteTsRef = useRef(0);

  // Stale State Closure Protection Refs (async flush paths read these)
  const elapsedSecondsRef = useRef<number>(0);
  const breakSecondsRef = useRef<number>(0);
  const sessionIdRef = useRef<number | null>(null);
  const journalRef = useRef<TimerJournal | null>(null);
  const endingRef = useRef(false);
  const startedAtRef = useRef(new Date().toISOString());
  const lastSyncedSecondsRef = useRef<number>(0);
  const lastSyncedBreakSecondsRef = useRef<number>(0);

  const isPausedRef = useRef<boolean>(false);
  const phaseRef = useRef<TimerPhase>("focus");
  const phaseLabelRef = useRef<string>("FOCUS");
  const remainingSecondsRef = useRef<number | null>(null);
  const currentSessionRef = useRef<number>(1);
  const totalSessionsRef = useRef<number>(1);
  // True when a persisted running timer state was restored — the
  // mode-initializer must not clobber the restored phase.
  const restoredStateRef = useRef<boolean>(false);
  const modeInitializedRef = useRef(false);

  // Set inside the timer tick (no side effects allowed there) and consumed
  // by a dedicated effect so the 3-minute auto-save fires exactly once.
  const autoFlushDueRef = useRef<boolean>(false);
  // Live mirrors for the tick callback (never stale).
  const questDataRef = useRef<any>(null);
  const activeModeRef = useRef<ModeConfig | null>(null);
  const tickRef = useRef<() => void>(() => {});
  const transitionPhaseRef = useRef<(forEnd?: boolean) => void>(() => {});

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
        }
      }
    } catch { /* default to pomodoro/freeflow */ }

    setActiveMode(previous => previous ?? {
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
      const savedState = localStorage.getItem(cacheKey) ?? localStorage.getItem(legacyCacheKey);
      if (savedState) {
        const parsed = JSON.parse(savedState);
        if (parsed.ownerId && parsed.ownerId !== user?.id) return;
        if (parsed.journalKey && user) {
          const journal = getTimerSync(user.id).journal(parsed.journalKey);
          if (journal?.endedAt) {
            localStorage.removeItem(cacheKey);
            sessionStorage.removeItem(timerKey);
            return;
          }
          journalRef.current = journal;
        }
        // An older cache may lack its journal key. A durable END on that row
        // still wins over the cache, including before the server acknowledges it.
        if (!parsed.journalKey && parsed.sessionId && user) {
          const sync = getTimerSync(user.id);
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key?.startsWith(`sylf_timer_journal_v1:${user.id}:`) || !key.endsWith(":meta")) continue;
            const meta = JSON.parse(localStorage.getItem(key)!);
            if (meta.sessionId === parsed.sessionId && sync.journal(meta.clientKey)?.endedAt) return;
          }
        }
        startedAtRef.current = parsed.startedAt ?? new Date(parsed.runningSinceMs ?? parsed.timestamp ?? Date.now()).toISOString();
        setAttributedDay(parsed.attributedDay ?? TimezoneService.getUserLocalDate(user?.timezone ?? "UTC", new Date(startedAtRef.current)));

        if (parsed.v === 2 && typeof parsed.focusMs === "number") {
          // New epoch format: anchors restore EXACTLY where the session was.
          // When the timer was running, the wall-clock anchor automatically
          // credits the time spent away (background, sleep, closed tab).
          const restoredPhase = VALID_PHASES.includes(parsed.phase)
            ? (parsed.phase as TimerPhase)
            : "focus";
          const persistedLive = parsed.cacheVersion === 3 || parsed.isPaused || !parsed.runningSinceMs ? 0
            : Math.max(0, (parsed.timestamp ?? parsed.runningSinceMs) - parsed.runningSinceMs);
          snapRef.current = {
            v: 2,
            focusMs: Math.max(0, parsed.focusMs - (restoredPhase === "focus" ? persistedLive : 0)),
            breakMs: Math.max(0, (parsed.breakMs ?? 0) - (restoredPhase !== "focus" && restoredPhase !== "done" ? persistedLive : 0)),
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
  // This content remounts on account/route changes; stats refreshes must not restore it again.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, legacyCacheKey, timerKey, user?.id]);

  // ─── Persist Timer State (single writer, exact live values) ────
  const persistTimerState = useCallback(
    () => {
      try {
        if (!isPrimaryRef.current || endingRef.current || !user) return;
        if (journalRef.current && getTimerSync(user.id).journal(journalRef.current.clientKey)?.endedAt) return;
        const snap = snapRef.current;
        localStorage.setItem(
          cacheKey,
          JSON.stringify({
            v: 2,
            cacheVersion: 3,
            ownerId: user.id,
            journalKey: journalRef.current?.clientKey,
            startedAt: startedAtRef.current,
            attributedDay,
            focusMs: snap.focusMs,
            breakMs: snap.breakMs,
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
    [cacheKey, pauseReason, user, isPrimaryRef, attributedDay]
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
        journalKey: journalRef.current?.clientKey,
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
          (msg.ts <= lastRemoteTsRef.current && msg.snap?.phase !== "done") ||
          !msg.snap
        ) {
          return;
        }
        if (msg.journalKey && journalRef.current && msg.journalKey !== journalRef.current.clientKey) return;
        if (endingRef.current) return;
        lastRemoteTsRef.current = msg.ts;
        if (msg.journalKey && user) journalRef.current = getTimerSync(user.id).journal(msg.journalKey);
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
  }, [cacheKey, user]);

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
      persistTimerState();
      broadcastSnapshot();
    },
    [persistTimerState, broadcastSnapshot]
  );

  // The same durable journal owns every write, including unload recovery.
  const ensureJournal = useCallback(() => {
    if (!user) throw new Error("Sign in before starting a timer.");
    const sync = getTimerSync(user.id);
    if (!journalRef.current) {
      // Adopt a mirror's identity before creating a new one.
      const saved = localStorage.getItem(cacheKey);
      const cached = saved ? JSON.parse(saved) : null;
      if (cached?.ownerId === user.id && cached.journalKey) journalRef.current = sync.journal(cached.journalKey);
      journalRef.current ??= sync.create({ ownerId: user.id, clientKey: crypto.randomUUID(), startedAt: startedAtRef.current,
        subjectId: subjectId ? Number(subjectId) : undefined, questId: questId ? Number(questId) : undefined,
        sessionId: sessionIdRef.current ?? undefined });
      let recoveredBoundary = false;
      if (sessionIdRef.current) {
        const pendingKey = `sylf_session_transition_v2_${sessionIdRef.current}`;
        const pending = sessionStorage.getItem(pendingKey);
        if (pending) { sync.importPending(journalRef.current.clientKey, pending); sessionStorage.removeItem(pendingKey); recoveredBoundary = true; }
      }
      if (!recoveredBoundary && snapRef.current.isPaused && !cached?.journalKey) {
        const d = deriveTimer(snapRef.current, Date.now());
        sync.enqueue(journalRef.current.clientKey, "PAUSE", d.focusSec, d.breakSec);
      }
      persistTimerState(); broadcastSnapshot();
    }
    return journalRef.current;
  }, [user, cacheKey, subjectId, questId, persistTimerState, broadcastSnapshot]);

  const flushSessionProgress = useCallback(async (isFinal = false, completeQuest = false,
    action: SessionActionV2 = isFinal ? "END" : "PROGRESS"): Promise<boolean> => {
    if (!user || endingRef.current || !isPrimaryRef.current) return false;
    try {
      const journal = ensureJournal();
      const d = deriveTimer(snapRef.current, Date.now());
      const sync = getTimerSync(user.id);
      if (isFinal) sync.finish(journal.clientKey, d.focusSec, d.breakSec, completeQuest);
      else sync.enqueue(journal.clientKey, action === "STOP_OTHER_DEVICE" ? "END" : action, d.focusSec, d.breakSec);
      return true;
    } catch {
      setEndError("Couldn't save the timer on this device. Free some device storage and retry."); return false;
    }
  }, [user, ensureJournal, isPrimaryRef]);

  const sendBeaconFlush = useCallback(() => {
    if (isPrimaryRef.current && !endingRef.current) void flushSessionProgress(false);
  }, [flushSessionProgress, isPrimaryRef]);

  useEffect(() => {
    if (!user) return;
    const sync = getTimerSync(user.id);
    return sync.onAccepted(accepted => {
      if (accepted.clientKey !== journalRef.current?.clientKey || endingRef.current) return;
      sessionIdRef.current = accepted.sessionId; setSessionId(accepted.sessionId);
      if (accepted.execution) setAttributedDay(accepted.execution.actualCivilDate);
      lastSyncedSecondsRef.current = accepted.focus;
      lastSyncedBreakSecondsRef.current = accepted.breaks;
      if (accepted.authoritative && accepted.execution?.state === "PAUSED") {
        const local = deriveTimer(snapRef.current, Date.now());
        // Keep sub-second carry from our own pause; another device's accepted
        // pause remains authoritative when it differs from the local state.
        if (!snapRef.current.isPaused || local.focusSec !== accepted.focus || local.breakSec !== accepted.breaks)
          snapRef.current = reconcileSessionSnapshot(snapRef.current, accepted.execution);
        setIsPaused(true); isPausedRef.current = true; syncStateFromSnapshot();
      }
      if (accepted.authoritative && accepted.execution?.state === "RUNNING" && !endError) {
        const local = deriveTimer(snapRef.current, Date.now());
        if (snapRef.current.isPaused || accepted.focus > local.focusSec || accepted.breaks > local.breakSec) {
          snapRef.current = reconcileSessionSnapshot(snapRef.current, accepted.execution);
          setIsPaused(false); isPausedRef.current = false; syncStateFromSnapshot();
        }
      }
      // An acknowledged old checkpoint must never undo a newer local boundary.
      // An end accepted on another device remains terminal.
      if (accepted.execution?.state === "ENDED" || accepted.endedAt) {
        snapRef.current = pauseSnapshot(snapRef.current, Date.now());
        snapRef.current.phase = "done"; setPhase("done"); phaseRef.current = "done";
        setIsPaused(true); isPausedRef.current = true;
        endingRef.current = true; setIsEnding(true); releaseLeadership(); router.replace("/timer");
      }
      persistTimerState(); broadcastSnapshot();
    });
  }, [user, persistTimerState, broadcastSnapshot, syncStateFromSnapshot, releaseLeadership, router, endError]);

  // Storage is also the cross-tab fallback when BroadcastChannel is unavailable.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (!user || endingRef.current) return;
      if (journalRef.current && getTimerSync(user.id).journal(journalRef.current.clientKey)?.endedAt) {
        snapRef.current = pauseSnapshot(snapRef.current, Date.now()); snapRef.current.phase = "done";
        endingRef.current = true; setIsPaused(true); setPhase("done"); releaseLeadership(); router.replace("/timer"); return;
      }
      if (event.key !== cacheKey || !event.newValue || isPrimaryRef.current) return;
      try {
        const value = JSON.parse(event.newValue);
        if (value.ownerId !== user.id || value.cacheVersion !== 3) return;
        snapRef.current = { ...value, v: 2 };
        if (value.journalKey) journalRef.current = getTimerSync(user.id).journal(value.journalKey);
        if (value.sessionId) { sessionIdRef.current = value.sessionId; setSessionId(value.sessionId); }
        setPhase(value.phase); phaseRef.current = value.phase;
        setIsPaused(value.isPaused); isPausedRef.current = value.isPaused;
        if (value.phaseLabel) { setPhaseLabel(value.phaseLabel); phaseLabelRef.current = value.phaseLabel; }
        syncStateFromSnapshot();
      } catch { /* Keep the last valid snapshot. */ }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [cacheKey, user, isPrimaryRef, router, releaseLeadership, syncStateFromSnapshot]);

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
    if (questId && !questData || modeInitializedRef.current) return;
    if (!isPrimaryRef.current) return;

    // A persisted running timer was restored — the exact phase/countdown must
    // win over the mode defaults, otherwise a reload mid-break would silently
    // restart/overwrite the session state.
    if (restoredStateRef.current) return;
    modeInitializedRef.current = true;

    if (questData) {
      const remaining = questData.plannedMinutes != null ? Math.max(0, (questData.remainingMinutesEstimate ?? 0) * 60)
        : Math.max(0, (questData.requiredMinutes * 60) - (questData.elapsedSeconds || 0));
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
        setPhaseLabel(`FOCUS 1/${sessionsBeforeLong}`);
        break;
      }
      case "5217": {
        // Data-backed 52/17 rhythm: long work block, real recovery break.
        const workMin = get("workDuration", 52);
        const cycles = get("cycles", 3);
        setCountdown(workMin * 60);
        setTotalSessions(cycles);
        setPhase("focus");
        setPhaseLabel(`52/17 FOCUS 1/${cycles}`);
        break;
      }
      case "animedoro": {
        // Long focus block rewarded with a guilt-free fun break.
        const focusMin = get("focusDuration", 45);
        const cycles = get("cycles", 3);
        setCountdown(focusMin * 60);
        setTotalSessions(cycles);
        setPhase("focus");
        setPhaseLabel(`ANIMEDORO FOCUS 1/${cycles}`);
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
          document.documentElement.setAttribute("data-focus-autofullscreen", "true");
          document.documentElement.requestFullscreen().catch(() => {
            document.documentElement.removeAttribute("data-focus-autofullscreen");
          });
        }
      } catch {
        // ignore if not allowed by browser
      }
    }
  }, [activeMode, questData, questId, setCountdown, isPrimary, isPrimaryRef]);

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
      osc.onended = () => { void ctx.close(); };
    } catch { /* audio not available */ }
  }, []);

  const acknowledgePhaseState = useCallback((paused: boolean) => {
    void flushSessionProgress(false, false, paused ? "PAUSE" : "RESUME");
  }, [flushSessionProgress]);

  // ─── Handle Phase Transition (epoch-anchored) ────────
  const transitionPhase = useCallback((forEnd = false) => {
    if (!isPrimaryRef.current && !forEnd || endingRef.current) return;
    const now = Date.now();
    const snapshot = snapRef.current;
    const boundary = snapshot.runningSinceMs !== null && snapshot.remainingMs !== null
      ? Math.min(now, snapshot.runningSinceMs + snapshot.remainingMs) : now;
    const phase = phaseRef.current;
    const currentSession = currentSessionRef.current;
    const totalSessions = totalSessionsRef.current;
    const phaseLabel = phaseLabelRef.current;
    const chimeAtBoundary = () => { if (now - boundary < 1000) playChime(); };
    let nextPhase: TimerPhase;
    let nextRemaining: number | null;
    let nextPaused = false;
    let nextSession = currentSession;
    let nextLabel = phaseLabel;
    let nextPauseReason: PauseReason = "manual";

    if (questData) {
      if (phase === "focus") {
        // Quest overtime starts at the deadline, even if the tab was suspended.
        snapRef.current = transitionSnapshot(snapshot, boundary, { phase: "focus", remainingSec: null });
        syncStateFromSnapshot(); persistTimerState(); broadcastSnapshot();
        chimeAtBoundary();
        setShowQuestPopup(true);
        questPopupTimeoutRef.current = setTimeout(() => {
          setShowQuestPopup(false);
          // Countdown was cleared at the deadline; the popup never owns time.
          setPhaseLabel("QUEST OVERTIME");
          phaseLabelRef.current = "QUEST OVERTIME";
        }, 15000);
        return;
      }
      // If in break during quest and break finishes:
      nextPhase = "focus";
      nextRemaining = null;
      nextLabel = "BREAK OVER";
      nextPaused = true;
      nextPauseReason = "break-over";
      setFlowNudge(false);
    } else {
      if (!activeMode) return;

      const get = (key: string, fallback: number) =>
        Number(getSetting(activeMode, key, fallback));

      // End-of-session chime is a per-mode setting (silent modes stay silent).
      const chimeEnabled = getSetting(activeMode, "endChime", true) !== false;
      if (chimeEnabled) chimeAtBoundary();

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
          if (currentSession >= totalSessions) {
            nextPhase = "done";
            nextRemaining = null;
            nextLabel = "SESSION COMPLETE";
          } else {
            nextSession = currentSession + 1;
            nextPhase = "focus";
            nextRemaining = get("workDuration", 52) * 60;
            nextLabel = `52/17 FOCUS ${nextSession}/${totalSessions}`;
            pauseIf("autoStartFocus");
          }
        }
      } else if (activeMode.id === "animedoro") {
        // Animedoro: focus block → guilt-free reward break, cycling.
        if (phase === "focus") {
          nextPhase = "long-break";
          nextRemaining = get("rewardBreak", 20) * 60;
          nextLabel = "REWARD BREAK";
          pauseIf("autoStartBreaks");
        } else {
          if (currentSession >= totalSessions) {
            nextPhase = "done";
            nextRemaining = null;
            nextLabel = "SESSION COMPLETE";
          } else {
            nextSession = currentSession + 1;
            nextPhase = "focus";
            nextRemaining = get("focusDuration", 45) * 60;
            nextLabel = `ANIMEDORO FOCUS ${nextSession}/${totalSessions}`;
            pauseIf("autoStartFocus");
          }
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
      } else if (activeMode.id === "flowtime" || activeMode.id === "freeflow") {
        // Flowtime / Free Flow: the break countdown finished. NEVER silently resume the
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
    }

    // Epoch transition: bank the current stretch, switch phase, re-anchor
    // the countdown at the wall clock. No tick arithmetic anywhere.
    snapRef.current = transitionSnapshot(snapRef.current, boundary, {
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
    syncStateFromSnapshot();
    persistTimerState();
    broadcastSnapshot();
    acknowledgePhaseState(nextPaused || nextPhase === "done");
  }, [activeMode, questData, playChime, persistTimerState, broadcastSnapshot, acknowledgePhaseState, isPrimaryRef, syncStateFromSnapshot]);

  useEffect(() => {
    transitionPhaseRef.current = transitionPhase;
  }, [transitionPhase]);

  // Persist creation identity before sending POST. This is retried by the
  // shell worker even if this page is closed before its response arrives.
  const ensureSession = useCallback(async (): Promise<number | null> => {
    try { ensureJournal(); return sessionIdRef.current; }
    catch { setEndError("Couldn't save the timer on this device. Free some device storage and retry."); return null; }
  }, [ensureJournal]);

  useEffect(() => {
    if (questId && isPrimary && user) {
      void ensureSession(); getTimerSync(user.id).wake();
    }
  }, [questId, isPrimary, user, ensureSession]);

  // ─── Fetch daily baselines on mount (no eager session row!) ────
  // A StudySession row is now created LAZILY — after 15 seconds of real
  // focus — so merely visiting /focus no longer leaks abandoned 0-second
  // rows. A carried-over legacy timer is attached immediately instead.
  const baselineOwnerId = user?.id;
  useEffect(() => {
    if (!baselineOwnerId) return;
    let cancelled = false;
    let syncing = false;

    async function startSessionAndFetchData() {
      if (cancelled || syncing) return;
      syncing = true;
      try {
        const [subRes, statsRes] = await Promise.all([
          fetchWithTimeout(fetch, "/api/subjects"),
          fetchWithTimeout(fetch, "/api/user/stats"),
        ]);

        if (cancelled) return;
        let total = 0;
        let currentAccepted: number | null = null;
        if (statsRes.ok) {
          const stats = await statsRes.json();
          if (stats.id !== undefined && stats.id !== baselineOwnerId) return;
          // todayStudySeconds includes this session's already-flushed
          // (stored) seconds; completedTodaySeconds excludes active sessions.
          total = stats.todayStudySeconds ?? stats.completedTodaySeconds ?? 0;
          const matching = stats.activeSessionId === sessionIdRef.current || !sessionIdRef.current
            && stats.activeSessionSubjectId === (subjectId ? Number(subjectId) : null)
            && stats.activeSessionQuestId === (questId ? Number(questId) : null);
          if ("activeSessionId" in stats) currentAccepted = matching ? stats.activeSessionStudySeconds ?? 0 : 0;
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
        const alreadyCredited = currentAccepted ?? lastSyncedSecondsRef.current ?? 0;
        setInitialTotalSeconds(Math.max(0, total - alreadyCredited));
        setInitialSubjectSeconds(Math.max(0, currentSubjectTime - alreadyCredited));

      } catch (err) {
        if (!cancelled) console.error("Failed to fetch baseline stats:", err);
      } finally { syncing = false; }
    }

    const refresh = () => { void startSessionAndFetchData(); };
    const accepted = (event: Event) => {
      if ((event as CustomEvent<{ ownerId: number }>).detail?.ownerId === baselineOwnerId) refresh();
    };
    refresh();
    window.addEventListener("online", refresh);
    window.addEventListener(TIMER_SYNC_EVENT, accepted);
    return () => {
      cancelled = true;
      window.removeEventListener("online", refresh);
      window.removeEventListener(TIMER_SYNC_EVENT, accepted);
    };
  }, [subjectId, questId, baselineOwnerId]);

  // ─── Main Timer Tick (derivation only — no accumulation) ──
  const advanceExpiredPhases = useCallback((forEnd = false) => {
    if (!isPrimaryRef.current && !forEnd || !(questDataRef.current || activeModeRef.current)) return;
    // Every phase is anchored to its original deadline. Catch up before deriving
    // or ending, including several blocks crossed during sleep/navigation.
    while (!snapRef.current.isPaused && snapRef.current.phase !== "done" &&
      deriveTimer(snapRef.current, Date.now()).remainingRawMs !== null &&
      deriveTimer(snapRef.current, Date.now()).remainingRawMs! <= 0) {
      const previous = snapRef.current;
      transitionPhaseRef.current(forEnd);
      const next = snapRef.current;
      if (next === previous) break;
      if (next.remainingMs === 0 && next.runningSinceMs === previous.runningSinceMs) {
        snapRef.current = pauseSnapshot(next, Date.now()); setIsPaused(true); isPausedRef.current = true;
        setEndError("Choose a study mode with a positive focus and break duration."); break;
      }
    }
  }, [isPrimaryRef]);
  const tick = useCallback(() => {
    const now = Date.now();
    if (questId && !questDataRef.current) return;
    if (endingRef.current) return;
    advanceExpiredPhases();
    const snap = snapRef.current;
    if (snap.isPaused || snap.phase === "done") return;
    const d = deriveTimer(snap, now);

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
        ensureSession().finally(() => {
          sessionStartPendingRef.current = false;
        });
      }

      // Throttled Auto-Save Checkpoint: flush every 3 minutes (180s) of
      // active focus. No side effects inside the tick — just flag it.
      if (d.focusSec - lastSyncedSecondsRef.current >= 180 && now - lastCheckpointRef.current >= 180_000) {
        lastCheckpointRef.current = now;
        autoFlushDueRef.current = true;
      }
    }

    // Persist at most once per second (anchors, never counters).
    if (now - lastPersistRef.current >= 1000) {
      lastPersistRef.current = now;
      persistTimerState();
      if (isPrimaryRef.current) broadcastSnapshot();
    }
  }, [questId, syncStateFromSnapshot, ensureSession, persistTimerState, isPrimaryRef, broadcastSnapshot, advanceExpiredPhases]);

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
  }, [elapsedSeconds, flushSessionProgress, isPrimaryRef]);

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
    if (!await acquireLeadership()) { setEndError("Couldn't take over this timer. Retry in a moment."); return; }
    const requestedAction: SessionActionV2 = snapRef.current.isPaused ? "RESUME" : "PAUSE";
    if (endingRef.current || snapRef.current.phase === "done") return;
    // Anchor-based pause/resume — immune to stale render closures and
    // rapid double-clicks (each call reads the live snapshot).
    if (snapRef.current.isPaused) {
      snapRef.current = resumeSnapshot(snapRef.current, Date.now());
      setIsPaused(false);
      isPausedRef.current = false;
      if (phaseLabelRef.current === "BREAK OVER" || pauseReason === "break-over") {
        const nextLbl = questData
          ? "QUEST OVERTIME"
          : activeMode?.id === "freeflow"
          ? "FREE FLOW"
          : activeMode?.id === "flowtime"
          ? "FLOW"
          : phaseLabelRef.current;
        setPhaseLabel(nextLbl);
        phaseLabelRef.current = nextLbl;
      }
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
    if (await flushSessionProgress(false, false, requestedAction)) setEndError(null);
  };

  const finishSession = (completeQuest: boolean) => {
    if (endingRef.current) return;
    advanceExpiredPhases(true);
    endingRef.current = true;
    setIsEnding(true); setEndError(null);
    // Freeze at the click, including fractions since the last render/tick.
    snapRef.current = pauseSnapshot(snapRef.current, Date.now());
    syncStateFromSnapshot(); setIsPaused(true); isPausedRef.current = true;
    try {
      const journal = ensureJournal();
      if (!user) throw new Error("Sign in to save your session.");
      const d = deriveTimer(snapRef.current, Date.now());
      getTimerSync(user.id).finish(journal.clientKey, d.focusSec, d.breakSec, completeQuest);
      snapRef.current.phase = "done"; phaseRef.current = "done"; setPhase("done");
      broadcastSnapshot();
    } catch {
      endingRef.current = false; setIsEnding(false);
      persistTimerState();
      setEndError("Couldn't save the ended session on this device. Free some device storage and retry. Your timer is paused.");
      return;
    }
    // The journal's terminal marker also protects reloads when cache removal fails.
    try { localStorage.removeItem(cacheKey); sessionStorage.removeItem(timerKey); sessionStorage.removeItem("runningTimerSeconds"); } catch { /* End remains durable. */ }
    try {
      const raw = localStorage.getItem(legacyCacheKey);
      const cached = raw ? JSON.parse(raw) : null;
      if (cached?.ownerId === user?.id && cached.sessionId === sessionIdRef.current) localStorage.removeItem(legacyCacheKey);
    } catch { /* Legacy recovery data remains available. */ }
    if (
      document.fullscreenElement &&
      document.documentElement.getAttribute("data-focus-autofullscreen") === "true"
    ) {
      document.documentElement.removeAttribute("data-focus-autofullscreen");
      void document.exitFullscreen().catch(() => {});
    }
    releaseLeadership(); announceSessionEnd(); if (navigator.onLine !== false) router.replace("/timer");
  };
  const handleEndSession = () => finishSession(false);
  const handleCompleteQuest = () => finishSession(true);

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

  // ─── On-demand breaks (Free Flow, Flowtime, Quest Overtime) ───
  const handleTakeFlowBreak = async () => {
    if (endingRef.current || !await acquireLeadership()) return;
    if (phaseRef.current !== "focus" && phase !== "focus") return;

    const focusMinutes = Math.max(1, Math.round(elapsedSecondsRef.current / 60));
    let breakMin = 5;

    if (activeMode?.id === "flowtime") {
      const autoScale = getSetting(activeMode, "autoScaleBreak", true) !== false;
      const defaultBreak = Number(getSetting(activeMode, "defaultBreak", 10));
      const maxBreak = Number(getSetting(activeMode, "maxBreak", 20));
      // Flowtime doctrine: ~10% of the focus block, clamped to 5–max minutes.
      const scaled = Math.max(5, Math.round(focusMinutes * 0.1));
      breakMin = Math.max(1, Math.min(maxBreak, autoScale ? scaled : defaultBreak));
    } else {
      // Free Flow / Quest Overtime: natural break, 5m default, scaled up to 20m if studying long
      breakMin = Math.max(5, Math.min(20, Math.round(focusMinutes * 0.1) || 5));
    }

    const breakSec = breakMin * 60;
    const breakPhase: TimerPhase = "short-break";
    const nextLabel = activeMode?.id === "flowtime" ? "FLOW BREAK" : "BREAK";

    // Re-anchor epoch snapshot: bank focus time, enter break countdown, unpause
    snapRef.current = transitionSnapshot(snapRef.current, Date.now(), {
      phase: breakPhase,
      remainingSec: breakSec,
      paused: false,
    });

    setPhase(breakPhase);
    phaseRef.current = breakPhase;
    setPhaseLabel(nextLabel);
    phaseLabelRef.current = nextLabel;
    setRemainingSeconds(breakSec);
    remainingSecondsRef.current = breakSec;
    setIsPaused(false);
    isPausedRef.current = false;
    setFlowNudge(false);
    persistTimerState();
    broadcastSnapshot();
    acknowledgePhaseState(false);
  };

  const handleSkipFlowBreak = async () => {
    if (endingRef.current || !await acquireLeadership()) return;
    if (activeMode?.id === "flowtime" || activeMode?.id === "freeflow" || questData) {
      snapRef.current = transitionSnapshot(snapRef.current, Date.now(), {
        phase: "focus",
        remainingSec: null,
        paused: false,
      });
      setPhase("focus");
      phaseRef.current = "focus";
      const nextLabel = questData
        ? "QUEST OVERTIME"
        : activeMode?.id === "flowtime"
        ? "FLOW"
        : "FREE FLOW";
      setPhaseLabel(nextLabel);
      phaseLabelRef.current = nextLabel;
      setRemainingSeconds(null);
      remainingSecondsRef.current = null;
      setIsPaused(false);
      isPausedRef.current = false;
      setFlowNudge(false);
      persistTimerState();
      broadcastSnapshot();
      acknowledgePhaseState(false);
    } else {
      // Structured timed modes (pomodoro, 5217, animedoro, sprint, deepwork):
      // advance to next focus session as scheduled
      transitionPhase();
    }
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
  useEffect(() => {
    if (!isEnding) return;
    const connected = () => router.replace("/timer");
    window.addEventListener("online", connected);
    return () => window.removeEventListener("online", connected);
  }, [isEnding, router]);


  // Navigation may need an uncached route while offline. The focus room still
  // closes immediately and gives the student a usable terminal screen.
  if (isEnding) return (
    <div className="h-full min-h-[100dvh] flex flex-col items-center justify-center gap-3 px-6 bg-bg-void text-text-primary text-center" role="status">
      <h1 className="text-2xl font-bold">Session ended</h1>
      <p className="text-text-muted">Saved on this device. Your progress will sync automatically.</p>
      <button type="button" className="mt-3 rounded-xl border border-border-subtle bg-bg-panel px-5 py-3 font-semibold text-accent-text" onClick={() => router.replace("/timer")}>Return to Timer</button>
    </div>
  );

  return (
    <FocusToolsProvider subjectName={subjectName} questTitle={questData?.title}>
      <div
        data-focus-workspace="true"
        className="h-full w-full max-h-[100dvh] flex flex-col justify-between items-center pt-6 pb-[calc(4.5rem+env(safe-area-inset-bottom))] sm:py-8 px-4 select-none relative overflow-hidden bg-bg-void text-text-primary transition-colors duration-500 touch-none overscroll-none"
        style={{
          height: "100dvh",
          maxHeight: "100dvh",
          touchAction: "none",
          overscrollBehavior: "none",
        }}
      >
      {/* Background Atmosphere Engine (z-0) */}
      <FocusBackgroundRenderer
        activeBackground={focusBg.activeBackground}
        isClassic={focusBg.isClassic}
        phase={phase}
        layoutKey={focusBg.layoutKey}
        onImageError={focusBg.onImageDeliveryError}
      />

      {/* Mirror-tab notice: another tab is the single writer for this
          session. Display stays synced; the next explicit action here
          takes over leadership. */}
      {!isPrimary && (
        <div className="relative z-40 shrink-0 mb-3 max-w-full px-4 py-2 rounded-full border border-amber-500/40 bg-amber-500/10 backdrop-blur-xl text-amber-300 text-xs text-center font-bold uppercase tracking-wider">
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
      {/* ─── Category-Specific Presentational Layout Router ─── */}
      <FocusTimerLayoutRouter
        formattedDisplayTime={formatTime(displayTime)}
        elapsedSeconds={elapsedSeconds}
        todayElapsedSeconds={!attributedDay || attributedDay === TimezoneService.getUserLocalDate(user?.timezone ?? "UTC") ? elapsedSeconds : 0}
        breakSeconds={breakSeconds}
        remainingSeconds={remainingSeconds}
        isCountdown={isCountdown}
        isBreak={isBreak}
        phase={phase}
        phaseColor={phaseColor}
        phaseLabel={phaseLabel}
        modeDisplayName={modeDisplayName}
        subjectName={subjectName}
        questData={questData}
        initialSubjectSeconds={initialSubjectSeconds}
        initialTotalSeconds={initialTotalSeconds}
        currentSession={currentSession}
        totalSessions={totalSessions}
        showSessionDots={Boolean(
          activeMode &&
            (activeMode.id === "pomodoro" ||
              activeMode.id === "sprint" ||
              activeMode.id === "5217" ||
              activeMode.id === "animedoro")
        )}
        isPaused={isPaused}
        pauseReason={pauseReason}
        isEnding={isEnding}
        endError={endError}
        flowNudge={flowNudge}
        onOpenBackgroundPicker={focusBg.openPicker}
        onTogglePause={handleTogglePause}
        onEndSession={handleEndSession}
        onCompleteQuest={questData ? handleCompleteQuest : undefined}
        onTakeFlowBreak={handleTakeFlowBreak}
        onSkipFlowBreak={handleSkipFlowBreak}
        background={focusBg.activeBackground}
        category={focusBg.activeCategory}
        layoutKey={focusBg.layoutKey}
        formatTime={formatTime}
      />

      {/* End / Complete failure feedback — never fail silently */}
      <AnimatePresence>
        {endError && (
          <motion.div
            role="alert"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="fixed bottom-36 left-1/2 -translate-x-1/2 z-30 max-w-md w-[calc(100%-2rem)] px-4 py-3 rounded-xl border border-border-subtle bg-bg-panel backdrop-blur-xl text-center pointer-events-none"
          >
            <p className="text-xs font-['Rajdhani'] font-semibold text-text-primary leading-relaxed">
              {endError}
            </p>
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

        {/* Focus Background Picker Modal Dialogue */}
        <FocusBackgroundPicker
          isOpen={focusBg.isPickerOpen}
          onClose={focusBg.closePicker}
          catalog={focusBg.catalog}
          activeCategory={focusBg.activeCategory}
          activeBackground={focusBg.activeBackground}
          isClassic={focusBg.isClassic}
          isPreloadingImage={focusBg.isPreloadingImage}
          loadError={focusBg.loadError || focusBg.syncError}
          onSelectBackground={focusBg.selectBackground}
          userCustomBackgrounds={focusBg.customBackgrounds}
          activeSource={focusBg.activeSource}
          activeCustomBackground={focusBg.activeCustomBackground}
          onSelectCustomBackground={focusBg.selectCustomBackground}
        />
      </div>
    </FocusToolsProvider>
  );
}

function FocusRoute() {
  const params = useSearchParams();
  return <FocusContent key={`${params.get("subjectId") ?? "general"}:${params.get("questId") ?? "none"}`} />;
}

export function FocusScreen() {
  const { user } = useAuth();
  if (!user) return <div className="min-h-screen bg-bg-void" />;
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg-void" />}>
      <AcousticsProvider>
        <FocusRoute key={user.id} />
      </AcousticsProvider>
    </Suspense>
  );
}

export default FocusScreen;
