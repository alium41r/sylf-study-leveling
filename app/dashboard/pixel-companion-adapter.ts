"use client";

/*
 * `react-hooks/set-state-in-effect` is disabled deliberately.
 *
 * This adapter's job is to turn an *external* signal into timed local state: the
 * application says something happened, and the companion expresses it for a
 * while. That is precisely a synchronisation with an external system, which is
 * what an effect is for, and the alternative — deriving the reaction during
 * render — cannot express "stop showing this after 2.6 seconds" without a timer
 * anyway. The rest of this codebase suppresses the same rule in the same
 * situation (TimerScreen, ShopScreen, LevelUpOverlay).
 */
/* eslint-disable react-hooks/set-state-in-effect */

/**
 * ============================================================================
 * DASHBOARD PIXEL-COMPANION ADAPTER
 * ============================================================================
 * The **only** module that understands both vocabularies: the application's
 * semantic progression signals and the Pixel Display's Sylf character states.
 *
 * THE BOUNDARY, AND WHICH SIDE OF IT THIS SITS ON
 *
 *   application signal → dashboard adapter → Sylf state → runtime → framebuffer → renderer
 *                        ^^^^^^^^^^^^^^^^^
 *
 * `engine/**` and `content/**` know nothing about applications, and this phase
 * gives them no reason to learn. The application knows nothing about pixels: it
 * publishes progression facts, and everything about *how* the companion responds
 * is decided here. Neither side imports the other's internals — this file is
 * where they meet, and it is deliberately the only place they do.
 *
 * WHY A REACTION AND NOT A NEW ANIMATION SYSTEM
 *   The roadmap is explicit that Phase 3 must not invent animation
 *   architecture. A reaction here is therefore the minimum that works: one
 *   active reaction, a timer, and a return to a base state. There is no queue, no
 *   priority scale and no interruption algebra, because exactly one reaction
 *   exists. Those would be architecture invented for behaviour that is not here
 *   — and Phase 4 is where that design belongs, informed by evidence.
 *
 * WHAT THIS ADAPTER DOES NOT DO
 *   It does not touch the framebuffer, the renderer, or a character plane. It
 *   returns a state name; the content layer decides what that state looks like.
 * ============================================================================
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLevelUp } from "@/app/components/LevelUpProvider";
import { useAuth } from "@/app/components/AuthProvider";
import {
  REFERENCE_ASSETS,
  createAssetLookup,
} from "@/lib/pixel-display/content/asset";
import { usePrefersReducedMotion } from "@/lib/pixel-display/react/usePixRuntime";
import type { SylfEffect, SylfState } from "@/lib/pixel-display/content";
import {
  type ModularComposition,
  type PixelAsset,
} from "@/lib/pixel-display/content/asset";
import { resolveEquippedCharacter } from "./pixel-modular-character";
import { usePixelCreations, invalidatePixelCreations } from "@/lib/pixel-creations-client";
import { resolutionForDensity } from "@/app/locker/components/identity/pixel-customizer-options";

/**
 * How long an observed level-up is reflected in the companion.
 *
 * Authored here rather than in the content layer because it is a *presentation
 * decision about an application event*, not a property of the character: the
 * character has no opinion about how long a scholar's level-up should be
 * acknowledged.
 */
export const LEVEL_UP_REACTION_MS = 4_000;

/**
 * A task was completed.
 *
 * Shorter and quieter than a level-up, deliberately: a task is a small, frequent
 * event, and a companion that celebrates every task as hard as a level cannot
 * distinguish between them. The state is unchanged — this is an acknowledgment,
 * not a celebration — and the body pulse carries it.
 */
export const TASK_COMPLETE_REACTION_MS = 1_600;

/** A streak was extended: a run continuing, not a new achievement. */
export const STREAK_EXTENDED_REACTION_MS = 2_600;

/** How long a level-up holds under reduced motion. */
export const LEVEL_UP_REACTION_REDUCED_MS = 1_800;

/** The shorter holds every other reaction uses under reduced motion. */
export const TASK_COMPLETE_REACTION_REDUCED_MS = 700;
export const STREAK_EXTENDED_REACTION_REDUCED_MS = 1_100;

/**
 * The reduced-motion equivalent.
 *
 * Not zero. The doc requires that essential state changes stay understandable
 * with animation disabled (§25), and a reaction that never appears would hide
 * the event rather than simplify it. A short, calm hold keeps the acknowledgement
 * while removing the sustained motion.
 */

/** The base state the companion rests in on the dashboard. */
export const DASHBOARD_BASE_STATE: SylfState = "IDLE";

/**
 * The application signals this adapter understands.
 *
 * Named for what the application *means*, never for what is drawn. The adapter
 * decides the drawing; nothing upstream of it can name a state or an effect.
 */
export type CompanionSignalKind =
  | "LEVEL_UP"
  | "TASK_COMPLETE"
  | "STREAK_EXTENDED"
  | "AI_THINKING";

/**
 * How each signal is expressed.
 *
 * `state` is what the companion **is**; `effect` is what is briefly **happening**
 * to it. Both come from the content layer's own vocabulary — this table chooses
 * among existing options and invents none.
 *
 * `sustained` marks a signal that is held rather than timed: it stays until the
 * application withdraws it, which is the honest shape for "a task is running and
 * nobody knows how long it will take".
 */
export interface CompanionReaction {
  readonly state: SylfState;
  readonly effect: SylfEffect | null;
  readonly durationMs: number;
  readonly reducedDurationMs: number;
  readonly sustained?: boolean;
}

export const COMPANION_REACTIONS: Record<
  CompanionSignalKind,
  CompanionReaction
> = {
  LEVEL_UP: {
    state: "CELEBRATING",
    effect: { kind: "sparkleWave", seed: 0 },
    durationMs: LEVEL_UP_REACTION_MS,
    reducedDurationMs: LEVEL_UP_REACTION_REDUCED_MS,
  },
  TASK_COMPLETE: {
    // No celebration state: a completed task acknowledges rather than applauds.
    state: DASHBOARD_BASE_STATE,
    effect: { kind: "bodyPulse", seed: 0 },
    durationMs: TASK_COMPLETE_REACTION_MS,
    reducedDurationMs: TASK_COMPLETE_REACTION_REDUCED_MS,
  },
  STREAK_EXTENDED: {
    state: "CELEBRATING",
    // A different seed, so two runs of celebrations are not visually identical.
    effect: { kind: "sparkleWave", seed: 3 },
    durationMs: STREAK_EXTENDED_REACTION_MS,
    reducedDurationMs: STREAK_EXTENDED_REACTION_REDUCED_MS,
  },
  AI_THINKING: {
    state: "THINKING",
    // No effect on purpose. A pulse would imply progress, and this signal exists
    // precisely when progress cannot be known.
    effect: null,
    durationMs: 0,
    reducedDurationMs: 0,
    sustained: true,
  },
};

/**
 * The application signal this adapter consumes.
 *
 * Structural on purpose: it names only the facts the reaction needs, so the
 * adapter does not depend on the provider's full payload shape and cannot
 * accidentally start relying on fields that are none of its business.
 */
export interface LevelUpApplicationSignal {
  /** Unique per occurrence, so a reaction fires once and never replays. */
  readonly runId: number;
  readonly newLevel: number;
  readonly didRankUp?: boolean;
}

export interface DashboardCompanionSignal {
  /** The Sylf state the companion should present right now. */
  readonly state: SylfState;
  /** The transient effect to play over that state, if any. */
  readonly effect: SylfEffect | null;
  /** Which application signal is currently being expressed. */
  readonly signalKind: CompanionSignalKind | null;
  /** Whether a reaction is currently being reflected. */
  readonly isReacting: boolean;
  /** How long the reaction was scheduled to last; `0` when sustained. */
  readonly reactionDurationMs: number;
  /** Whether motion is being reduced. */
  readonly reducedMotion: boolean;
  /**
   * Whether the companion may animate on its own. False under reduced motion,
   * which is also what lets the display reach a genuine zero-work idle.
   */
  readonly animate: boolean;
}

/**
 * A signal handed to the adapter by a caller.
 *
 * `token` makes each occurrence individually identifiable, exactly as a level-up
 * carries a `runId`, so a reaction fires once and never replays on re-render.
 * `active: false` withdraws a sustained signal.
 */
export interface CompanionSignalInput {
  readonly kind: CompanionSignalKind;
  readonly token: number;
  readonly active?: boolean;
}

/**
 * The equipped composition for the signed-in scholar.
 *
 * Kept as its own hook so the signal path and the *content* path stay separable:
 * a test can exercise either without standing up the other, and the card reads
 * both without knowing how either is resolved.
 */
export function useDashboardCompanionComposition(): ModularComposition {
  const { user } = useAuth();
  const creations = useScholarCreationAssets();
  return useMemo(() => {
    const config = user?.characterConfig ?? null;
    return resolveEquippedCharacter(
      {
        // `characterConfig` is untyped on the user record, so every field is read
        // defensively. A malformed configuration degrades to the base figure
        // rather than throwing on a dashboard render.
        outfit: typeof config?.outfit === "string" ? config.outfit : undefined,
        pedestal:
          typeof config?.pedestal === "string"
            ? config.pedestal
            : typeof config?.pedestalKey === "string"
              ? config.pedestalKey
              : undefined,
        pedestalKey:
          typeof config?.pedestalKey === "string"
            ? config.pedestalKey
            : undefined,
        // The aura has two owners in the existing app: the character config and
        // `User.activeAura`. The config wins when it names one, matching how
        // `ShopScreen` already builds its base configuration.
        aura:
          typeof config?.aura === "string"
            ? config.aura
            : typeof user?.activeAura === "string"
              ? user.activeAura
              : undefined,
        relic:
          typeof config?.relic === "string" ? config.relic : undefined,
        weapon:
          typeof config?.weapon === "string" ? config.weapon : undefined,
        accessory:
          typeof config?.accessory === "string" ? config.accessory : undefined,
      },
      { lookup: CATALOGUE_LOOKUP, creations },
    ).composition;
    // `user` is the dependency the compiler infers; narrowing it by hand made the
    // memoisation unpreservable and the value could change more often than the
    // dependency list promised.
  }, [user, creations]);
}

/** The built-in catalogue, resolved once. */
const CATALOGUE_LOOKUP = createAssetLookup(REFERENCE_ASSETS);

/**
 * The signed-in scholar's Pixel Studio creations, as drawable assets.
 *
 * Fetched once and cached in module scope for the session, because a creation
 * changes only when the scholar saves one, and the dashboard reads this on every
 * render of a card that is always present. A surface that *writes* a creation
 * (Pixel Studio) calls `invalidateScholarCreations` so the next reader — the
 * dashboard card, the customizer's preview, the studio hub — cannot be served a
 * list from before the write.
 *
 * Exported rather than private because more than one surface resolves an
 * equipped configuration, and every one of them must resolve it against the same
 * catalogue: a preview that omitted the scholar's own drawing would show the
 * built-in companion while the dashboard showed the drawing.
 *
 * **A creation that fails to convert is dropped, not repaired.** The resolver
 * then cannot find the equipped id, falls back to the built-in figure and reports
 * it — which is exactly the required behaviour for a corrupted, deleted or
 * unsupported creation: a valid companion, never a blank card.
 */
export const invalidateScholarCreations = invalidatePixelCreations;
export function useScholarCreationAssets(): readonly PixelAsset[] {
  const { user } = useAuth();
  return usePixelCreations(user?.id).assets;
}

/**
 * The scholar's chosen pixel density, as a logical resolution.
 *
 * Read from the same `characterConfig` the composition is resolved from, so the
 * preference has exactly one owner. Every configuration written before Phase 7
 * has no density at all and gets the default — which is why no migration was
 * needed and no scholar had to re-equip anything.
 */
export function useDashboardCompanionDensity(): number {
  const { user } = useAuth();
  const assets = useScholarCreationAssets();
  const selected = assets.find(asset => asset.id === user?.characterConfig?.outfit);
  return resolutionForDensity(user?.characterConfig?.density, selected?.reference.width);
}

export interface DashboardCompanionOptions {
  /** Overrides the ambient reduced-motion preference. Used by tests. */
  reducedMotion?: boolean;
  /** A signal from a surface that has one. */
  signal?: CompanionSignalInput | null;
}

/**
 * Reduces an application signal to the companion reaction it implies.
 *
 * Pure, and exported, so the mapping is testable without React — the whole point
 * of an adapter is that the translation is a decision someone can read.
 */
export function reactionFor(kind: CompanionSignalKind): CompanionReaction {
  return COMPANION_REACTIONS[kind];
}

/** The hold a reaction uses, under the given motion preference. */
export function reactionDurationMs(
  reaction: CompanionReaction,
  reducedMotion: boolean,
): number {
  return reducedMotion ? reaction.reducedDurationMs : reaction.durationMs;
}

/**
 * The application signal to send when an AI task starts or stops.
 *
 * Exported as a pair of helpers because "the model is thinking" is a *sustained*
 * condition, not an event: a surface with one boolean should not have to
 * manufacture token numbers to say so.
 */
export function aiThinkingSignal(
  active: boolean,
  token: number,
): CompanionSignalInput {
  return { kind: "AI_THINKING", token, active };
}

/**
 * The level-up mapping, kept as a named function because Phase 3 shipped it and
 * its behaviour must not change.
 */
export function reactionForLevelUp(
  reducedMotion: boolean,
): { state: SylfState; durationMs: number } {
  const reaction = COMPANION_REACTIONS.LEVEL_UP;
  return {
    state: reaction.state,
    durationMs: reactionDurationMs(reaction, reducedMotion),
  };
}

/**
 * Subscribes to the application's level-up signal and presents it as a Sylf
 * state.
 *
 * The companion rests in `IDLE` and celebrates briefly when a level-up is
 * observed. Reactions are keyed by `runId`, so the same event cannot fire twice —
 * including across a remount, since the signal is a durable record rather than a
 * transient "is visible" flag.
 */
export function useDashboardCompanionSignal(
  options: DashboardCompanionOptions = {},
): DashboardCompanionSignal {
  const { lastLevelUp } = useLevelUp();
  const prefersReducedMotion = usePrefersReducedMotion();
  const reducedMotion = options.reducedMotion ?? prefersReducedMotion;

  /**
   * Signals supplied by the caller, newest last.
   *
   * The dashboard's own signal is the level-up, which is read from its owner
   * below. A caller with other signals passes them in, so a surface that knows
   * about a task finishing or a model thinking does not have to teach this
   * adapter about that application.
   */
  const external = options.signal ?? null;

  const [reactive, setReactive] = useState<{
    kind: CompanionSignalKind;
    token: number;
  } | null>(null);
  /**
   * The sustained signal currently being expressed, if any.
   *
   * Held separately from the timed reaction because the two have different
   * lifetimes, and a single slot would force one to cancel the other. This is
   * still not a priority system: there is one slot per *lifetime*, not a scale.
   */
  const [sustained, setSustained] = useState<CompanionSignalKind | null>(null);

  const reflectedRunId = useRef<number | null>(null);
  const reflectedExternal = useRef<number | null>(null);
  const token = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current === null) return;
    clearTimeout(timer.current);
    timer.current = null;
  }, []);

  /** Starts a reaction, replacing any reaction already running. */
  const startReaction = useCallback(
    (kind: CompanionSignalKind) => {
      const reaction = COMPANION_REACTIONS[kind];
      if (reaction.sustained) {
        setSustained(kind);
        return;
      }
      token.current += 1;
      setReactive({ kind, token: token.current });
      clearTimer();
      timer.current = setTimeout(
        () => {
          timer.current = null;
          setReactive(null);
        },
        reactionDurationMs(reaction, reducedMotion),
      );
    },
    [clearTimer, reducedMotion],
  );

  /** Ends a sustained signal, if it is the one being expressed. */
  const stopSustained = useCallback((kind: CompanionSignalKind) => {
    setSustained((current) => (current === kind ? null : current));
  }, []);

  // The dashboard's own signal: the level-up owner.
  useEffect(() => {
    if (!lastLevelUp) return;
    if (reflectedRunId.current === lastLevelUp.runId) return;
    reflectedRunId.current = lastLevelUp.runId;
    startReaction("LEVEL_UP");
  }, [lastLevelUp, startReaction]);

  // Signals supplied by the caller.
  useEffect(() => {
    if (!external) return;
    if (reflectedExternal.current === external.token) return;
    reflectedExternal.current = external.token;
    if (external.active === false) {
      stopSustained(external.kind);
      return;
    }
    startReaction(external.kind);
  }, [external, startReaction, stopSustained]);

  useEffect(() => clearTimer, [clearTimer]);

  // A sustained signal outranks a passing one: something that is still happening
  // is more true than something that just finished.
  const activeKind = sustained ?? reactive?.kind ?? null;
  const reaction = activeKind ? COMPANION_REACTIONS[activeKind] : null;

  return {
    state: reaction ? reaction.state : DASHBOARD_BASE_STATE,
    effect: reaction?.effect ?? null,
    signalKind: activeKind,
    isReacting: activeKind !== null,
    reactionDurationMs: reaction
      ? reactionDurationMs(reaction, reducedMotion)
      : 0,
    reducedMotion,
    // A reaction still animates under reduced motion; only the companion's
    // *self-triggered* idle behaviour is suppressed.
    animate: !reducedMotion,
  };
}

/**
 * The accessibility counterpart of the visual reaction.
 *
 * The companion's celebration is decorative in the sense that no task depends on
 * seeing it — but it does report something that happened to the scholar, and the
 * doc's accessibility rule (§24) is that the display must be "visually expressive
 * without making critical application information dependent on animation". The
 * level-up overlay already announces itself; this sentence exists so the card
 * does not become the *only* place the event is visible, and it is deliberately
 * a non-live-region string that a caller places in its own live region, so the
 * card does not assert a role the surrounding UI should own.
 */
export function levelUpAnnouncement(signal: LevelUpApplicationSignal): string {
  const rank = signal.didRankUp ? " Rank increased." : "";
  return `Level up. You reached level ${signal.newLevel}.${rank}`;
}
