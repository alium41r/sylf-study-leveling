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
import { SESSION_ENDED_EVENT, SESSION_SUMMARY_KEY } from "../components/SessionEndToast";
import { CheckCircle2 } from "lucide-react";

/* ─── Types ────────────────────────────────────────────────── */

interface ModeConfig {
  id: string;
  name: string;
  isActive?: boolean;
  settings: { key: string; value: boolean | number | string }[];
}


type TimerPhase = "focus" | "short-break" | "long-break" | "rest" | "done";

function getSetting(mode: ModeConfig, key: string, fallback: number | boolean | string = 0): number | boolean | string {
  const found = mode.settings.find((s) => s.key === key);
  return found ? found.value : fallback;
}

/* ─── FocusContent ─────────────────────────────────────────── */

function FocusContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token, refreshStats } = useAuth();

  // Eye-Comfort Dimming (Light Mode only) — zero-IOPS client state
  const { isDimActive, isLightMode, toggleDim } = useFocusEyeComfort();

  // Keep the screen awake during the study session (Web Screen Wake Lock)
  const keepAwake = useScreenWakeLock();

  const subjectId = searchParams.get("subjectId");
  const subjectName = searchParams.get("subjectName") || "Focus Session";
  const questId = searchParams.get("questId");

  const cacheKey = `runningTimerState_${subjectId || "general"}_${questId || "none"}`;
  const timerKey = `runningTimerSeconds_${subjectId || "general"}_${questId || "none"}`;

  // Timer state
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null); // null = stopwatch mode
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [isEnding, setIsEnding] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);

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
  const lastTickRef = useRef<number>(typeof window !== 'undefined' ? Date.now() : 0);
  const sessionStartedRef = useRef(false);

  // Stale State Closure Protection Refs
  const elapsedSecondsRef = useRef<number>(0);
  const sessionIdRef = useRef<number | null>(null);
  const tokenRef = useRef<string | null>(token || null);
  const lastSyncedSecondsRef = useRef<number>(0);
  const isSyncingRef = useRef<boolean>(false);
  // Holds the in-flight flush promise so overlapping calls serialize.
  const flushInFlightRef = useRef<Promise<boolean> | null>(null);
  // Set inside the timer updater (no side effects allowed there) and consumed
  // by a dedicated effect so the 3-minute auto-save fires exactly once.
  const autoFlushDueRef = useRef<boolean>(false);

  // Keep refs in sync with React state
  useEffect(() => {
    tokenRef.current = token || null;
  }, [token]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    elapsedSecondsRef.current = elapsedSeconds;
  }, [elapsedSeconds]);

  // ─── Load Mode Config & Cached Timer State ────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem("study_mode_config");
      if (saved) {
        const parsed = JSON.parse(saved);
        const active = parsed.modes?.find((m: ModeConfig) => m.isActive);
        if (active) setActiveMode(active);
      }
    } catch { /* default to freeflow */ }

    // Load persisted elapsed seconds & session ID from localStorage / sessionStorage
    try {
      const savedState = localStorage.getItem(cacheKey);
      if (savedState) {
        const parsed = JSON.parse(savedState);
        if (typeof parsed.elapsedSeconds === "number") {
          setElapsedSeconds(parsed.elapsedSeconds);
          elapsedSecondsRef.current = parsed.elapsedSeconds;
          lastSyncedSecondsRef.current = parsed.lastSyncedSeconds ?? 0;
        }
        if (parsed.sessionId) {
          setSessionId(parsed.sessionId);
          sessionIdRef.current = parsed.sessionId;
        }
      } else {
        const savedSeconds = sessionStorage.getItem(timerKey);
        if (savedSeconds) {
          const sec = parseInt(savedSeconds, 10);
          setElapsedSeconds(sec);
          elapsedSecondsRef.current = sec;
        }
      }
    } catch {
      setElapsedSeconds(0);
    }
  }, [cacheKey, timerKey]);

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
      const currentSessionId = sessionIdRef.current;
      const currentToken = tokenRef.current;

      if (!currentToken || !currentSessionId) return false;
      // Skip redundant zero-delta writes if not final
      if (!isFinal && currSeconds <= lastSyncedSecondsRef.current) return true;
      if (isSyncingRef.current && !isFinal) return false;

      isSyncingRef.current = true;
      const durationMinutes = Math.floor(currSeconds / 60);
      const durationSeconds = currSeconds;

      const run = (async () => {
        try {
          const res = await fetch("/api/sessions", {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${currentToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              id: currentSessionId,
              durationMinutes,
              durationSeconds,
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
            if (isFinal) {
              // Local Storage Cleanup ONLY after 200 OK
              localStorage.removeItem(cacheKey);
              sessionStorage.removeItem(timerKey);
              sessionStorage.removeItem("runningTimerSeconds");
            } else {
              localStorage.setItem(
                cacheKey,
                JSON.stringify({
                  sessionId: currentSessionId,
                  elapsedSeconds: currSeconds,
                  lastSyncedSeconds: currSeconds,
                  timestamp: Date.now(),
                })
              );
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
    [cacheKey, timerKey, questId]
  );

  // ─── Fetch Quest Data if questId is present ────────
  useEffect(() => {
    if (!questId || !token) return;
    fetch(`/api/quests/${questId}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async (res) => (res.ok ? res.json().catch(() => ({})) : {}))
      .then(data => {
        if (data.id) setQuestData(data);
      })
      .catch(console.error);
  }, [questId, token]);

  // ─── Initialize Timer Based on Mode ────────────────
  useEffect(() => {
    if (activeMode === null && !questData) return; // wait for mode or quest

    if (questData) {
      const remaining = Math.max(0, (questData.requiredMinutes * 60) - (questData.elapsedSeconds || 0));
      if (remaining === 0) {
        setRemainingSeconds(null); // Already reached time, straight to overtime
        setPhaseLabel("QUEST OVERTIME");
      } else {
        setRemainingSeconds(remaining);
        setPhaseLabel("QUEST FOCUS");
      }
      setPhase("focus");
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
        setRemainingSeconds(focusMin * 60);
        setTotalSessions(sessionsBeforeLong);
        setPhase("focus");
        setPhaseLabel("FOCUS");
        break;
      }
      case "5217": {
        // Data-backed 52/17 rhythm: long work block, real recovery break.
        const workMin = get("workDuration", 52);
        const cycles = get("cycles", 3);
        setRemainingSeconds(workMin * 60);
        setTotalSessions(cycles);
        setPhase("focus");
        setPhaseLabel("52/17 FOCUS");
        break;
      }
      case "animedoro": {
        // Long focus block rewarded with a guilt-free fun break.
        const focusMin = get("focusDuration", 45);
        const cycles = get("cycles", 3);
        setRemainingSeconds(focusMin * 60);
        setTotalSessions(cycles);
        setPhase("focus");
        setPhaseLabel("ANIMEDORO FOCUS");
        break;
      }
      case "deepwork": {
        const sessionMin = get("sessionLength", 90);
        setRemainingSeconds(sessionMin * 60);
        setPhase("focus");
        setPhaseLabel("DEEP WORK");
        setTotalSessions(1);
        break;
      }
      case "sprint": {
        const sprintMin = get("sprintDuration", 10);
        const sprints = get("totalSprints", 6);
        setRemainingSeconds(sprintMin * 60);
        setTotalSessions(sprints);
        setPhase("focus");
        setPhaseLabel("SPRINT 1/" + sprints);
        break;
      }
      case "flowtime": {
        // Flexible: open-ended stopwatch; breaks are taken on demand.
        setRemainingSeconds(null);
        setPhase("focus");
        setPhaseLabel("FLOW");
        setTotalSessions(1);
        break;
      }
      case "freeflow":
      default: {
        // Stopwatch mode
        setRemainingSeconds(null);
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
  }, [activeMode, questData]);

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

  // ─── Handle Phase Transition ───────────────────────
  const transitionPhase = useCallback(() => {
    if (questData) {
      playChime();
      setShowQuestPopup(true);
      questPopupTimeoutRef.current = setTimeout(() => {
        setShowQuestPopup(false);
        setRemainingSeconds(null); // switch to stopwatch (Free Flow)
        setPhaseLabel("QUEST OVERTIME");
      }, 15000);
      return;
    }

    if (!activeMode) return;

    const get = (key: string, fallback: number) =>
      Number(getSetting(activeMode, key, fallback));

    // End-of-session chime is a per-mode setting (silent modes stay silent).
    const chimeEnabled = getSetting(activeMode, "endChime", true) !== false;
    if (chimeEnabled) playChime();

    // Auto-start boundaries: when disabled, the timer pauses at the
    // transition so the next block only begins when the user resumes.
    const pauseIf = (autoSetting: string) => {
      if (getSetting(activeMode, autoSetting, true) === false) {
        setIsPaused(true);
      }
    };

    if (activeMode.id === "pomodoro") {
      if (phase === "focus") {
        const sessionsBeforeLong = get("sessionsBeforeLong", 4);
        if (currentSession >= sessionsBeforeLong) {
          // Long break
          const longBreakMin = get("longBreak", 15);
          setRemainingSeconds(longBreakMin * 60);
          setPhase("long-break");
          setPhaseLabel("LONG BREAK");
        } else {
          // Short break
          const shortBreakMin = get("shortBreak", 5);
          setRemainingSeconds(shortBreakMin * 60);
          setPhase("short-break");
          setPhaseLabel("SHORT BREAK");
        }
        pauseIf("autoStartBreaks");
      } else {
        // After a break → next focus session
        const nextSession = phase === "long-break" ? 1 : currentSession + 1;
        setCurrentSession(nextSession);
        const focusMin = get("focusDuration", 25);
        setRemainingSeconds(focusMin * 60);
        setPhase("focus");
        setPhaseLabel(`FOCUS ${nextSession}/${totalSessions}`);
        pauseIf("autoStartFocus");
      }
    } else if (activeMode.id === "5217") {
      // 52/17 rhythm: work block ↔ real recovery break, cycling.
      if (phase === "focus") {
        const breakMin = get("breakDuration", 17);
        setRemainingSeconds(breakMin * 60);
        setPhase("short-break");
        setPhaseLabel("RECOVERY BREAK");
        pauseIf("autoStartBreaks");
      } else {
        const nextCycle = currentSession + 1;
        setCurrentSession(nextCycle);
        const workMin = get("workDuration", 52);
        setRemainingSeconds(workMin * 60);
        setPhase("focus");
        setPhaseLabel(`52/17 FOCUS ${nextCycle}/${totalSessions}`);
        pauseIf("autoStartFocus");
      }
    } else if (activeMode.id === "animedoro") {
      // Animedoro: focus block → guilt-free reward break, cycling.
      if (phase === "focus") {
        const rewardMin = get("rewardBreak", 20);
        setRemainingSeconds(rewardMin * 60);
        setPhase("long-break");
        setPhaseLabel("REWARD BREAK");
        pauseIf("autoStartBreaks");
      } else {
        const nextCycle = currentSession + 1;
        setCurrentSession(nextCycle);
        const focusMin = get("focusDuration", 45);
        setRemainingSeconds(focusMin * 60);
        setPhase("focus");
        setPhaseLabel(`ANIMEDORO FOCUS ${nextCycle}/${totalSessions}`);
        pauseIf("autoStartFocus");
      }
    } else if (activeMode.id === "sprint") {
      if (phase === "focus") {
        if (currentSession >= totalSessions) {
          // All sprints done
          setPhase("done");
          setPhaseLabel("SPRINTS COMPLETE");
          setRemainingSeconds(null);
        } else {
          const restMin = get("restDuration", 2);
          setRemainingSeconds(restMin * 60);
          setPhase("rest");
          setPhaseLabel("REST");
          pauseIf("autoStartRests");
        }
      } else {
        // After rest → next sprint
        const nextSprint = currentSession + 1;
        setCurrentSession(nextSprint);
        const sprintMin = get("sprintDuration", 10);
        setRemainingSeconds(sprintMin * 60);
        setPhase("focus");
        setPhaseLabel(`SPRINT ${nextSprint}/${totalSessions}`);
        pauseIf("autoStartSprints");
      }
    } else if (activeMode.id === "deepwork") {
      // Deep work done → break
      if (phase === "focus") {
        const breakMin = get("breakLength", 20);
        setRemainingSeconds(breakMin * 60);
        setPhase("long-break");
        setPhaseLabel("BREAK");
      } else {
        setPhase("done");
        setPhaseLabel("SESSION COMPLETE");
        setRemainingSeconds(null);
      }
    } else if (activeMode.id === "flowtime") {
      // Flowtime: the break countdown finished → back to open-ended flow.
      setRemainingSeconds(null);
      setPhase("focus");
      setPhaseLabel("FLOW");
      setFlowNudge(false);
    }
  }, [activeMode, phase, currentSession, totalSessions, playChime, questData]);

  // ─── Session helpers ───────────────────────────────
  // End/Complete used to silently no-op when the session had failed to start
  // (sessionIdRef null) — the buttons looked dead. ensureSession() retries the
  // start so a user can always recover, and returns the live session id.
  const ensureSession = useCallback(async (): Promise<number | null> => {
    if (sessionIdRef.current) return sessionIdRef.current;
    if (!tokenRef.current) return null;
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenRef.current}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subjectId: subjectId ? parseInt(subjectId) : undefined,
          questId: questId ? parseInt(questId) : undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.id) {
          setSessionId(data.id);
          sessionIdRef.current = data.id;
          return data.id;
        }
      }
    } catch (err) {
      console.error("Failed to (re)start session:", err);
    }
    return null;
  }, [subjectId, questId]);

  // ─── Start API session on mount ────────────────────
  useEffect(() => {
    if (!token || sessionStartedRef.current) return;
    sessionStartedRef.current = true;

    async function startSessionAndFetchData() {
      try {
        const [subRes, statsRes] = await Promise.all([
          fetch("/api/subjects", { headers: { Authorization: `Bearer ${token}` } }),
          fetch("/api/user/stats", { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        let total = 0;
        if (statsRes.ok) {
          const stats = await statsRes.json();
          total = stats.completedTodaySeconds ?? stats.todayStudySeconds ?? 0;
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

        setInitialTotalSeconds(total);
        setInitialSubjectSeconds(currentSubjectTime);

        const res = await fetch("/api/sessions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            subjectId: subjectId ? parseInt(subjectId) : undefined,
            questId: questId ? parseInt(questId) : undefined,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          setSessionId(data.id);
          sessionIdRef.current = data.id;
          localStorage.setItem(
            cacheKey,
            JSON.stringify({
              sessionId: data.id,
              elapsedSeconds: elapsedSecondsRef.current,
              lastSyncedSeconds: lastSyncedSecondsRef.current,
              timestamp: Date.now(),
            })
          );
        }
      } catch (err) {
        console.error("Failed to start session or fetch data:", err);
      }
    }

    startSessionAndFetchData();
  }, [token, subjectId, cacheKey]);

  // ─── Main Timer Loop (In-Memory + LocalStorage Buffering) ──
  useEffect(() => {
    if (isPaused || phase === "done") return;

    lastTickRef.current = Date.now();

    intervalRef.current = setInterval(() => {
      const now = Date.now();
      const deltaMs = now - lastTickRef.current;
      const deltaSec = Math.round(deltaMs / 1000);

      if (deltaSec >= 1) {
        // Only increment focus study elapsed time when in "focus" phase (pause during breaks)
        if (phase === "focus") {
          setElapsedSeconds((prev) => {
            const newSeconds = prev + deltaSec;
            elapsedSecondsRef.current = newSeconds;
            sessionStorage.setItem(timerKey, newSeconds.toString());
            try {
              localStorage.setItem(
                cacheKey,
                JSON.stringify({
                  sessionId: sessionIdRef.current,
                  elapsedSeconds: newSeconds,
                  lastSyncedSeconds: lastSyncedSecondsRef.current,
                  timestamp: Date.now(),
                })
              );
            } catch {}

            // Throttled Auto-Save Checkpoint: Flush every 3 minutes (180s) of
            // active focus. No side effects inside the updater — just flag it.
            if (newSeconds - lastSyncedSecondsRef.current >= 180) {
              autoFlushDueRef.current = true;
            }

            return newSeconds;
          });
        }

        if (remainingSeconds !== null) {
          setRemainingSeconds((prev) => {
            if (prev === null) return null;
            if (prev <= deltaSec) {
              transitionPhase();
              return 0;
            }
            return prev - deltaSec;
          });
        }
        lastTickRef.current = now;
      }
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPaused, phase, remainingSeconds, transitionPhase, cacheKey, timerKey, flushSessionProgress]);

  // ─── Auto-save checkpoint (consumes the flag set by the timer loop) ──
  useEffect(() => {
    if (!autoFlushDueRef.current) return;
    autoFlushDueRef.current = false;
    flushSessionProgress(false);
  }, [elapsedSeconds, flushSessionProgress]);

  // ─── Page Lifecycle & Unload Sync ─────────────────
  useEffect(() => {
    const handleBeforeUnload = () => {
      flushSessionProgress(false);
    };

    const handlePageHide = () => {
      flushSessionProgress(false);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushSessionProgress(false);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [flushSessionProgress]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleTogglePause = async () => {
    const nextPaused = !isPaused;
    setIsPaused(nextPaused);
    // Flush on pause/resume boundary
    await flushSessionProgress(false);
  };

  const handleEndSession = async () => {
    if (!tokenRef.current || isEnding) return;
    setIsEnding(true);
    setEndError(null);

    try {
      // If the session never started (flaky start request), retry it first —
      // previously the button silently no-op'd and looked broken.
      const sid = sessionIdRef.current || (await ensureSession());
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
    if (!tokenRef.current || isEnding) return;
    setIsEnding(true);
    setEndError(null);

    try {
      const sid = sessionIdRef.current || (await ensureSession());
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
    setRemainingSeconds(breakMin * 60);
    setPhase("long-break");
    setPhaseLabel("FLOW BREAK");
    setFlowNudge(false);
  };

  const handleSkipFlowBreak = () => {
    setRemainingSeconds(null);
    setPhase("focus");
    setPhaseLabel("FLOW");
    setFlowNudge(false);
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
        {/* Pause/Resume (for countdown modes) */}
        {isCountdown && phase !== "done" && (
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

      {/* Paused Overlay */}
      <AnimatePresence>
        {isPaused && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none bg-bg-overlay backdrop-blur-sm"
          >
            <p
              style={{
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: "2.5rem",
                fontWeight: 700,
                color: "var(--accent-gold)",
                textTransform: "uppercase",
                letterSpacing: "0.25em",
                animation: "pulse 2s ease-in-out infinite",
              }}
            >
              PAUSED
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
                    setRemainingSeconds(null);
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
