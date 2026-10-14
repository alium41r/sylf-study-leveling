"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { rankForLevel } from "@/lib/game-engine";
import { useAuth } from "./AuthProvider";
import LevelUpOverlay from "./LevelUpOverlay";

/* ============================================================================
   LEVEL UP PROVIDER — the single owner of the celebration surface.
   ----------------------------------------------------------------------------
   Watches the authenticated scholar's canonical progression data and plays the
   level-up sequence whenever `level` increases, wherever in the app that
   happened (focus session settlement, quest reward, achievement claim, weekly
   milestone, admin grant). It is deliberately read-only: it observes
   `user.level` / `user.hunterRank` from AuthProvider and never writes XP,
   levels, ranks, or stats.

   `triggerLevelUp()` is exposed for the developer-only replay control; it
   renders the sequence from a supplied payload and likewise mutates nothing.
   ========================================================================== */

export interface LevelUpSignal {
  newLevel: number;
  newRank?: string;
  previousLevel?: number;
  previousRank?: string;
  didRankUp?: boolean;
  xpGained?: number;
}

interface PendingLevelUp extends LevelUpSignal {
  runId: number;
}

/**
 * A level-up that this provider has observed, kept as a record.
 *
 * Distinct from `isLevelUpVisible`: the overlay closing must not erase the fact
 * that a level-up happened, because other surfaces react to the *event* rather
 * than to the overlay's lifetime. `runId` makes each occurrence individually
 * identifiable, so a consumer cannot react twice to the same one — or miss two
 * that arrive close together.
 */
export interface ObservedLevelUp extends LevelUpSignal {
  runId: number;
}

interface LevelUpContextValue {
  /** Play the sequence. Defaults are synthesized from the current scholar. */
  triggerLevelUp: (signal?: Partial<LevelUpSignal>) => void;
  /** Close the sequence early. */
  dismissLevelUp: () => void;
  /** Whether the sequence is currently on screen. */
  isLevelUpVisible: boolean;
  /**
   * The most recent level-up this provider observed, or `null` before any.
   *
   * This is the read-only **application signal** other surfaces consume. It
   * carries only semantic progression facts — never presentation, and never
   * anything about how a reaction should be drawn.
   */
  lastLevelUp: ObservedLevelUp | null;
}

const LevelUpContext = createContext<LevelUpContextValue | undefined>(undefined);

export function LevelUpProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [pending, setPending] = useState<PendingLevelUp | null>(null);
  const runIdRef = useRef(0);
  /**
   * Durable record of the last observed level-up, for signal consumers.
   *
   * State rather than a ref: it is rendered, so React must re-render when it
   * changes, and reading a ref during render is exactly the pattern that
   * silently fails to update.
   */
  const [lastLevelUp, setLastLevelUp] = useState<ObservedLevelUp | null>(null);
  /** Last observed level per scholar identity, so logins never celebrate. */
  const baselineRef = useRef<{ userId: number; level: number } | null>(null);

  const triggerLevelUp = useCallback(
    (signal?: Partial<LevelUpSignal>) => {
      const currentLevel = user?.level ?? 1;
      const newLevel = signal?.newLevel ?? currentLevel + 1;
      const newRank = signal?.newRank ?? rankForLevel(newLevel);
      const previousLevel = signal?.previousLevel ?? Math.max(1, newLevel - 1);
      const previousRank = signal?.previousRank ?? rankForLevel(previousLevel);

      runIdRef.current += 1;
      const observed: ObservedLevelUp = {
        runId: runIdRef.current,
        newLevel,
        newRank,
        previousLevel,
        previousRank,
        didRankUp: signal?.didRankUp ?? newRank !== previousRank,
        xpGained: signal?.xpGained,
      };
      setLastLevelUp(observed);
      setPending(observed);
    },
    [user?.level]
  );

  const dismissLevelUp = useCallback(() => setPending(null), []);

  const closeLevelUp = dismissLevelUp;

  const triggerRealLevelUp = useCallback((signal: LevelUpSignal) => {
    runIdRef.current += 1;
    const observed: ObservedLevelUp = { ...signal, runId: runIdRef.current };
    setLastLevelUp(observed);
    setPending(observed);
  }, []);

  /* ── Real level-up detection ─────────────────────────────────────────── */
  useEffect(() => {
    if (!user) {
      baselineRef.current = null;
      return;
    }

    const baseline = baselineRef.current;

    // First observation for this scholar (initial load, login, account switch):
    // record the level and stay silent. Signing in must never celebrate.
    if (!baseline || baseline.userId !== user.id) {
      baselineRef.current = { userId: user.id, level: user.level };
      return;
    }

    if (user.level === baseline.level) return;

    if (user.level > baseline.level) {
      const previousLevel = baseline.level;
      const previousRank = rankForLevel(previousLevel);
      baselineRef.current = { userId: user.id, level: user.level };

      triggerRealLevelUp({
        newLevel: user.level,
        newRank: user.hunterRank,
        previousLevel,
        previousRank,
        didRankUp: user.hunterRank !== previousRank,
      });
      return;
    }

    // Level moved backwards (admin correction / data repair) — re-baseline
    // quietly rather than celebrating a downgrade.
    baselineRef.current = { userId: user.id, level: user.level };
  }, [user, triggerRealLevelUp]);

  const value = useMemo<LevelUpContextValue>(
    () => ({
      triggerLevelUp,
      dismissLevelUp,
      isLevelUpVisible: pending !== null,
      // Distinct from `pending`: closing the overlay clears `pending` but must
      // not erase the fact that a level-up happened, because other surfaces
      // react to the event rather than to the overlay's lifetime.
      lastLevelUp,
    }),
    [triggerLevelUp, dismissLevelUp, pending, lastLevelUp]
  );

  return (
    <LevelUpContext.Provider value={value}>
      {children}
      <LevelUpOverlay
        show={pending !== null}
        newLevel={pending?.newLevel ?? user?.level ?? 1}
        newRank={pending?.newRank}
        previousLevel={pending?.previousLevel}
        previousRank={pending?.previousRank}
        didRankUp={pending?.didRankUp}
        xpGained={pending?.xpGained}
        runId={pending?.runId ?? 0}
        onClose={closeLevelUp}
      />
    </LevelUpContext.Provider>
  );
}

export function useLevelUp() {
  const context = useContext(LevelUpContext);
  if (context === undefined) {
    throw new Error("useLevelUp must be used within a LevelUpProvider");
  }
  return context;
}
