"use client";

import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../components/AuthProvider";

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

  const subjectId = searchParams.get("subjectId");
  const subjectName = searchParams.get("subjectName") || "Focus Session";

  // Timer state
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null); // null = stopwatch mode
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [isEnding, setIsEnding] = useState(false);
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

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastTickRef = useRef<number>(typeof window !== 'undefined' ? Date.now() : 0);

  // ─── Load Mode Config ──────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem("study_mode_config");
      if (saved) {
        const parsed = JSON.parse(saved);
        const active = parsed.modes?.find((m: ModeConfig) => m.isActive);
        if (active) setActiveMode(active);
      }
    } catch { /* default to freeflow */ }

    // Load persisted elapsed seconds if any
    const savedSeconds = sessionStorage.getItem("runningTimerSeconds");
    if (savedSeconds) {
      setElapsedSeconds(parseInt(savedSeconds, 10));
    }
  }, []);

  // ─── Initialize Timer Based on Mode ────────────────
  useEffect(() => {
    if (activeMode === null) return; // wait for mode to load

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
      case "freeflow":
      default: {
        // Stopwatch mode
        setRemainingSeconds(null);
        setPhase("focus");
        setPhaseLabel("FREE FLOW");
        break;
      }
    }

    // Trigger Fullscreen for Deep Work
    if (activeMode.id === "deepwork") {
      try {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
      } catch {
        // ignore if not allowed by browser
      }
    }
  }, [activeMode]);

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
    if (!activeMode) return;

    const get = (key: string, fallback: number) =>
      Number(getSetting(activeMode, key, fallback));

    playChime();

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
      } else {
        // After a break → next focus session
        const nextSession = phase === "long-break" ? 1 : currentSession + 1;
        setCurrentSession(nextSession);
        const focusMin = get("focusDuration", 25);
        setRemainingSeconds(focusMin * 60);
        setPhase("focus");
        setPhaseLabel(`FOCUS ${nextSession}/${totalSessions}`);
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
        }
      } else {
        // After rest → next sprint
        const nextSprint = currentSession + 1;
        setCurrentSession(nextSprint);
        const sprintMin = get("sprintDuration", 10);
        setRemainingSeconds(sprintMin * 60);
        setPhase("focus");
        setPhaseLabel(`SPRINT ${nextSprint}/${totalSessions}`);
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
    }
  }, [activeMode, phase, currentSession, totalSessions, playChime]);

  // ─── Start API session on mount ────────────────────
  useEffect(() => {
    if (!token) return;
    let mounted = true;

    async function startSessionAndFetchData() {
      try {
        const subRes = await fetch("/api/subjects", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (subRes.ok) {
          const subjects = await subRes.json();
          let total = 0;
          let currentSubjectTime = 0;
          subjects.forEach((sub: { id: number; todaySeconds: number }) => {
            total += sub.todaySeconds;
            if (subjectId && sub.id === parseInt(subjectId)) {
              currentSubjectTime = sub.todaySeconds;
            }
          });
          if (mounted) {
            setInitialTotalSeconds(total);
            setInitialSubjectSeconds(currentSubjectTime);
          }
        }

        const res = await fetch("/api/sessions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            subjectId: subjectId ? parseInt(subjectId) : undefined,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (mounted) setSessionId(data.id);
        }
      } catch (err) {
        console.error("Failed to start session or fetch data:", err);
      }
    }

    startSessionAndFetchData();

    return () => { mounted = false; };
  }, [token, subjectId]);

  // ─── Main Timer Loop ───────────────────────────────
  useEffect(() => {
    if (isPaused || phase === "done") return;

    lastTickRef.current = Date.now();

    intervalRef.current = setInterval(() => {
      const now = Date.now();
      const deltaMs = now - lastTickRef.current;
      const deltaSec = Math.round(deltaMs / 1000);

      if (deltaSec >= 1) {
        setElapsedSeconds((prev) => {
          const newSeconds = prev + deltaSec;
          sessionStorage.setItem("runningTimerSeconds", newSeconds.toString());
          return newSeconds;
        });

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
  }, [isPaused, phase, remainingSeconds, transitionPhase]);

  // Prevent accidental navigation
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleEndSession = async () => {
    if (!token || !sessionId || isEnding) return;
    setIsEnding(true);

    const durationMinutes = Math.max(1, Math.floor(elapsedSeconds / 60));

    try {
      await fetch("/api/sessions", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: sessionId, durationMinutes }),
      });

      sessionStorage.removeItem("runningTimerSeconds");
      
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }

      await refreshStats();
      router.push("/timer");
    } catch (err) {
      console.error("Failed to end session:", err);
      setIsEnding(false);
    }
  };

  // Determine display time — countdown for timed modes, elapsed for stopwatch
  const displayTime = remainingSeconds !== null ? remainingSeconds : elapsedSeconds;
  const isCountdown = remainingSeconds !== null;
  const isBreak = phase === "short-break" || phase === "long-break" || phase === "rest";

  // Phase color
  const phaseColor = isBreak
    ? "var(--accent-green)"
    : phase === "done"
    ? "var(--accent-gold)"
    : "var(--accent-cyan)";

  // Mode display name
  const modeDisplayName = activeMode?.name || "Free Flow";

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center text-white relative"
      style={{
        background: isBreak
          ? "linear-gradient(to bottom, #050f0a, #020503)"
          : "linear-gradient(to bottom, #05050f, #020208)",
        transition: "background 1s ease",
      }}
    >
      {/* Mode Indicator */}
      <div className="absolute top-8 left-0 right-0 text-center">
        <p
          style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: "0.65rem",
            letterSpacing: "0.2em",
            color: phaseColor,
            textTransform: "uppercase",
            fontWeight: 700,
            marginBottom: "4px",
          }}
        >
          {modeDisplayName}
        </p>
        <p
          style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: "1.1rem",
            fontWeight: 700,
            letterSpacing: "0.15em",
            color: phaseColor,
            textShadow: `0 0 20px ${phaseColor}`,
          }}
        >
          {phaseLabel}
        </p>
      </div>

      {/* Subject Name */}
      <div className="absolute top-24 text-center opacity-70">
        <p
          className="text-sm tracking-widest uppercase mb-2 font-bold"
          style={{ color: "var(--text-muted)", fontFamily: "'Rajdhani', sans-serif" }}
        >
          Current Subject
        </p>
        <h1 className="text-2xl font-medium tracking-wide">{subjectName}</h1>
      </div>

      {/* Main Timer Display */}
      <div className="text-center z-10 my-16">
        <div
          className="text-7xl md:text-9xl font-bold font-mono"
          style={{
            color: phaseColor,
            textShadow: `0 0 40px ${phaseColor}40`,
            transition: "color 0.5s ease",
          }}
        >
          {formatTime(displayTime)}
        </div>

        {/* Sub-timers (only in countdown modes, show elapsed) */}
        {isCountdown && (
          <p
            className="mt-4 font-mono text-lg"
            style={{ color: "var(--text-muted)" }}
          >
            Total elapsed: {formatTime(elapsedSeconds)}
          </p>
        )}

        <div className="flex gap-12 mt-8 justify-center text-gray-500 font-mono text-xl">
          <div className="flex flex-col items-center">
            <span
              className="text-xs tracking-widest uppercase mb-1 text-gray-600"
              style={{ fontFamily: "'Rajdhani', sans-serif" }}
            >
              Today&apos;s Subject Total
            </span>
            <span>{formatTime(initialSubjectSeconds + elapsedSeconds)}</span>
          </div>
          <div className="flex flex-col items-center">
            <span
              className="text-xs tracking-widest uppercase mb-1 text-gray-600"
              style={{ fontFamily: "'Rajdhani', sans-serif" }}
            >
              Daily Cumulative Focus
            </span>
            <span>{formatTime(initialTotalSeconds + elapsedSeconds)}</span>
          </div>
        </div>
      </div>

      {/* Pomodoro Session Dots */}
      {activeMode && (activeMode.id === "pomodoro" || activeMode.id === "sprint") && (
        <div className="flex gap-2 mb-8">
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
                    : "rgba(255,255,255,0.1)",
                boxShadow:
                  i + 1 === currentSession ? `0 0 8px ${phaseColor}` : "none",
                transition: "all 0.3s ease",
              }}
            />
          ))}
        </div>
      )}

      {/* Control Buttons */}
      <div className="absolute bottom-16 flex gap-4">
        {/* Pause/Resume (for countdown modes) */}
        {isCountdown && phase !== "done" && (
          <button
            onClick={() => setIsPaused(!isPaused)}
            className="flex items-center gap-3 px-6 py-3 rounded-full bg-white/5 hover:bg-white/10 transition-all border border-white/10"
          >
            {isPaused ? (
              <>
                <svg className="w-5 h-5 text-cyan-400" fill="currentColor" viewBox="0 0 24 24">
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
                <svg className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
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

        {/* End Session */}
        <button
          onClick={handleEndSession}
          disabled={isEnding}
          className="flex items-center gap-3 px-8 py-4 rounded-full bg-white/10 hover:bg-white/20 transition-all border border-white/20 hover:border-red-400/50"
        >
          {isEnding ? (
            <span className="text-lg uppercase tracking-wider font-bold">
              Ending...
            </span>
          ) : (
            <>
              <svg className="w-6 h-6 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
              <span
                className="text-lg uppercase tracking-wider font-bold"
                style={{ fontFamily: "'Rajdhani', sans-serif" }}
              >
                End Session
              </span>
            </>
          )}
        </button>
      </div>

      {/* Paused Overlay */}
      {isPaused && (
        <div
          className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none"
          style={{ background: "rgba(0,0,0,0.4)" }}
        >
          <p
            style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: "2rem",
              fontWeight: 700,
              color: "var(--accent-gold)",
              textTransform: "uppercase",
              letterSpacing: "0.2em",
              animation: "pulse 2s ease-in-out infinite",
            }}
          >
            PAUSED
          </p>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

export default function FocusPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black" />}>
      <FocusContent />
    </Suspense>
  );
}
