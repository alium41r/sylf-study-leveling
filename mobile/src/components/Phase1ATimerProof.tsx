import React, { useState, useEffect } from "react";
import {
  createInitialSnapshot,
  deriveTimer,
  pauseSnapshot,
  resumeSnapshot,
  type TimerSnapshot,
} from "@/lib/timer-engine";
import { Play, Pause, RotateCcw } from "lucide-react";

/**
 * Real Timer Engine Live Proof Widget
 * Preserved from Phase 1A to prove wall-clock epoch derivation and calculation parity.
 */
export function Phase1ATimerProof() {
  const [snapshot, setSnapshot] = useState<TimerSnapshot>(() => createInitialSnapshot(Date.now()));
  const [derived, setDerived] = useState(() => deriveTimer(snapshot, Date.now()));
  const [isMinimized, setIsMinimized] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setDerived(deriveTimer(snapshot, Date.now()));
    }, 250);
    return () => clearInterval(interval);
  }, [snapshot]);

  const handleTogglePause = () => {
    const now = Date.now();
    if (snapshot.isPaused) {
      setSnapshot(resumeSnapshot(snapshot, now));
    } else {
      setSnapshot(pauseSnapshot(snapshot, now));
    }
  };

  const handleReset = () => {
    setSnapshot(createInitialSnapshot(Date.now()));
  };

  const formatSec = (totalSec: number) => {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="bg-bg-panel/90 backdrop-blur-md border border-border-subtle rounded-2xl p-4 text-xs font-mono select-none shadow-lg">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-text-secondary font-bold font-['Rajdhani'] uppercase tracking-wider text-[12px]">
            Timer Engine Proof (Phase 1A)
          </span>
          <span className="text-emerald-400 font-mono font-bold text-sm">
            {formatSec(derived.focusSec)}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={handleTogglePause}
            className="px-2.5 py-1 rounded-lg bg-bg-abyss border border-border-subtle hover:border-accent-primary text-text-primary flex items-center gap-1 cursor-pointer transition-colors text-xs"
          >
            {derived.running ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            <span>{derived.running ? "Pause" : "Resume"}</span>
          </button>
          <button
            onClick={handleReset}
            className="p-1.5 rounded-lg bg-bg-abyss border border-border-subtle hover:border-accent-primary text-text-muted hover:text-text-primary cursor-pointer transition-colors"
            title="Reset Snapshot"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="text-[11px] text-accent-primary-light hover:underline ml-1 cursor-pointer"
          >
            {isMinimized ? "Details" : "Hide"}
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div className="mt-3 pt-3 border-t border-border-subtle/50 text-[11px] text-text-muted flex flex-wrap gap-4">
          <span>Source: <code className="text-text-secondary">@/lib/timer-engine</code></span>
          <span>Status: <code className="text-emerald-400">{derived.running ? "running" : "paused"} (wall-clock)</code></span>
          <span>focusMs: <code className="text-text-secondary">{snapshot.focusMs}</code></span>
          <span>liveMs: <code className="text-text-secondary">{derived.liveMs}</code></span>
          <span>anchor: <code className="text-text-secondary">{snapshot.runningSinceMs ?? "null"}</code></span>
        </div>
      )}
    </div>
  );
}

export default Phase1ATimerProof;
