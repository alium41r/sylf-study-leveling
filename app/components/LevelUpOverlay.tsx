"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { MOTION_EASE } from "@/lib/motion";
import styles from "./LevelUpOverlay.module.css";

/* ============================================================================
   LEVEL UP OVERLAY — "Ascension"
   ----------------------------------------------------------------------------
   The single celebration surface for every real level-up in Sylf. It is driven
   by the app's own progression data (`user.level` / `user.hunterRank` via
   `LevelUpProvider`) and renders only presentation — it never mutates XP,
   levels, or ranks.

   Composition — deliberately container-free, floating on the scrim (top → bottom,
   nothing overlaps the artwork):
     eyebrow → EMBLEM (sigil + numeral / rank glyph, with a full-width horizon
     hairline through it) → headline → level chips → reward strip → dismiss rail.

   LEVEL UP (≈ 4.2s, auto-dismisses)
      0.00s  scrim + ambient bloom fade in
      0.10s  scanner line sweeps down the viewport
      0.15s  emblem: hexagon draws itself, rings begin slow counter-rotation
      0.25s  "LEVEL UP" letters rise into place
      0.45s  numeral slot-rolls old → new; particles converge and burst
      0.70s  level chips (and the XP awarded, when known)
      0.80s  dismiss rail begins draining

   RANK UP (≈ 5.8s) — a longer, heavier beat built around the glyph swap
      0.15s  emblem draws with the *previous* rank dormant inside it
      0.50s  the six vertex nodes ignite one after another (the charge-up)
      1.15s  FLASH: glyph swaps to the new rank, light pillar, double shockwave,
             particle burst, the whole panel re-tints to the new rank colour
      1.50s  "Rank Promoted" strip
      1.20s  dismiss rail begins draining

   `prefers-reduced-motion` drops the whole choreography: no particles, no
   scanner, no rotation, no roll, no flash — a quiet fade to the final state.
   ========================================================================== */

const LEVEL_HOLD_MS = 4200;
const RANK_HOLD_MS = 5800;
const COUNT_MS = 720;
/** Moment (s) the rank glyph swaps and the burst fires in the promotion beat. */
const RANK_SWAP_S = 1.15;

export interface LevelUpOverlayProps {
  show: boolean;
  newLevel: number;
  newRank?: string;
  /** Level before the promotion — enables the odometer roll. */
  previousLevel?: number;
  /** Rank before the promotion — enables the promotion beat. */
  previousRank?: string;
  /** Explicit promotion flag from the reward payload; derived when omitted. */
  didRankUp?: boolean;
  /** XP awarded by the action that caused the level-up. */
  xpGained?: number;
  /** Replays the sequence from the top while the overlay is already open. */
  runId?: number;
  onClose: () => void;
}

/** Ranks that have a colour rule (`.rank-<X>` in globals.css and `hue<X>` here). */
const RANK_BADGE_STYLES = new Set(["E", "D", "C", "B", "A", "S"]);

const LEVEL_TITLE = "LEVEL UP";
const RANK_TITLE = "RANK UP";

/** Deterministic mote field — index-derived so SSR and client never disagree. */
function buildParticles(count: number, delayOffset: number) {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + ((i * 37) % 11) * 0.055;
    const inner = 20 + ((i * 53) % 11); // vmin, gather-in distance
    const hold = 8 + ((i * 13) % 5); //    vmin, ring held around the emblem
    const outer = 15 + ((i * 29) % 11); // vmin, scatter distance
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      id: i,
      size: 2 + (i % 3),
      x: `${(cos * inner).toFixed(2)}vmin`,
      y: `${(sin * inner * 0.86).toFixed(2)}vmin`,
      xh: `${(cos * hold).toFixed(2)}vmin`,
      yh: `${(sin * hold * 0.86).toFixed(2)}vmin`,
      xo: `${(cos * outer).toFixed(2)}vmin`,
      yo: `${(sin * outer * 0.86).toFixed(2)}vmin`,
      delay: `${(delayOffset + 0.16 + (i % 10) * 0.014).toFixed(3)}s`,
      duration: `${(1 + ((i * 17) % 5) * 0.06).toFixed(2)}s`,
    };
  });
}

/** Regular hexagon vertices in the 200×200 sigil artwork box. */
function hexagon(radius: number, offsetDeg: number) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = ((-90 + offsetDeg + i * 60) * Math.PI) / 180;
    return [
      Number((100 + Math.cos(a) * radius).toFixed(2)),
      Number((100 + Math.sin(a) * radius).toFixed(2)),
    ] as const;
  });
}

const HEX_RADIUS = 72;
const HEX_VERTICES = hexagon(HEX_RADIUS, 0);
const HEX_POINTS = HEX_VERTICES.map(([x, y]) => `${x},${y}`).join(" ");
const HEX_STAR_POINTS = hexagon(HEX_RADIUS, 30)
  .map(([x, y]) => `${x},${y}`)
  .join(" ");

const TICKS = Array.from({ length: 12 }, (_, i) => {
  const angle = (i / 12) * Math.PI * 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const long = i % 3 === 0;
  return {
    id: i,
    x1: Number((100 + cos * 99).toFixed(2)),
    y1: Number((100 + sin * 99).toFixed(2)),
    x2: Number((100 + cos * (long ? 107 : 103)).toFixed(2)),
    y2: Number((100 + sin * (long ? 107 : 103)).toFixed(2)),
    long,
  };
});

/** Eased roll from the previous level to the new one. */
function useLevelRoll(from: number, to: number, reduceMotion: boolean) {
  const [value, setValue] = useState(to);

  useEffect(() => {
    if (reduceMotion || from === to) {
      setValue(to);
      return;
    }

    let frame = 0;
    let startTimer = 0;
    let start = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / COUNT_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (to - from) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };

    setValue(from);
    startTimer = window.setTimeout(() => {
      start = performance.now();
      frame = requestAnimationFrame(tick);
    }, 450);

    return () => {
      window.clearTimeout(startTimer);
      cancelAnimationFrame(frame);
    };
  }, [from, to, reduceMotion]);

  return value;
}

/** Flips to `true` once the promotion glyph swap moment (RANK_SWAP_S) passes. */
function useRankSwap(
  active: boolean,
  runId: number,
  reduceMotion: boolean
) {
  const [swappedRun, setSwappedRun] = useState<number | null>(null);

  useEffect(() => {
    if (!active || reduceMotion) return;
    const timer = window.setTimeout(() => setSwappedRun(runId), RANK_SWAP_S * 1000);
    return () => window.clearTimeout(timer);
  }, [active, runId, reduceMotion]);

  // Keyed by run so a replay never flashes the previous run's final state.
  return reduceMotion || swappedRun === runId;
}

export default function LevelUpOverlay({
  show,
  newLevel,
  newRank,
  previousLevel,
  previousRank,
  didRankUp,
  xpGained,
  runId = 0,
  onClose,
}: LevelUpOverlayProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const cardRef = useRef<HTMLDivElement>(null);

  const rankPromoted =
    didRankUp ?? Boolean(newRank && previousRank && newRank !== previousRank);
  const isRank = Boolean(rankPromoted && newRank);
  const holdMs = isRank ? RANK_HOLD_MS : LEVEL_HOLD_MS;

  const hasOdometer =
    typeof previousLevel === "number" && previousLevel !== newLevel;
  const rolledLevel = useLevelRoll(
    hasOdometer ? (previousLevel as number) : newLevel,
    newLevel,
    reduceMotion || !show
  );

  const swapped = useRankSwap(show && isRank, runId, reduceMotion);
  const displayRank = isRank && !swapped && previousRank ? previousRank : (newRank ?? "");

  const particles = useMemo(
    () =>
      reduceMotion
        ? []
        : buildParticles(isRank ? 34 : 20, isRank ? RANK_SWAP_S - 0.55 : 0),
    [reduceMotion, isRank]
  );

  /* Auto-dismiss. `runId` restarts the countdown when the sequence is replayed
     while the overlay is already open (developer replay button). */
  useEffect(() => {
    if (!show) return;
    const timer = window.setTimeout(onClose, holdMs);
    return () => window.clearTimeout(timer);
  }, [show, runId, onClose, holdMs]);

  /* Escape dismisses, and focus moves into the dialog for keyboard users. */
  useEffect(() => {
    if (!show) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    cardRef.current?.focus({ preventScroll: true });
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [show, runId, onClose]);

  const handleClose = useCallback(() => onClose(), [onClose]);

  const title = isRank ? RANK_TITLE : LEVEL_TITLE;
  const titleBase = isRank ? 0.3 : 0.24;
  const hueClass =
    isRank && RANK_BADGE_STYLES.has(displayRank) ? styles[`hue${displayRank}`] : "";
  const railDelay = reduceMotion ? 0.15 : isRank ? 1.2 : 0.8;
  const railDuration = reduceMotion ? 0.2 : Math.max(0.5, holdMs / 1000 - railDelay);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="level-up-root"
          className={styles.root}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          onClick={handleClose}
          role="dialog"
          aria-modal="true"
          aria-label={
            rankPromoted && newRank
              ? `Level up. Level ${newLevel}, rank ${newRank}.`
              : `Level up. Level ${newLevel}.`
          }
        >
          <motion.div
            className={styles.scrim}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            aria-hidden="true"
          />

          <motion.div
            className={styles.bloom}
            aria-hidden="true"
            initial={{ opacity: 0, scale: 0.75 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, ease: MOTION_EASE.sylf }}
          />

          <div className={styles.lattice} aria-hidden="true" />

          {!reduceMotion && (
            <motion.div
              className={styles.scanline}
              aria-hidden="true"
              initial={{ y: "-6vh", opacity: 0 }}
              animate={{
                y: ["-6vh", "22vh", "78vh", "104vh"],
                opacity: [0, 1, 1, 0],
              }}
              transition={{ duration: 0.95, ease: "easeInOut", times: [0, 0.18, 0.82, 1] }}
            />
          )}

          {/* Content is re-keyed by `runId` so a replay restarts every child
              animation instead of resuming mid-sequence. */}
          <div key={runId} className={styles.rootLayer}>
            <motion.div
              ref={cardRef}
              tabIndex={-1}
              className={`${styles.card} ${isRank ? styles.cardRank : ""} ${hueClass}`}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 16 }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 8 }}
              transition={
                reduceMotion
                  ? { duration: 0.25 }
                  : { type: "spring", stiffness: 320, damping: 30, mass: 0.9 }
              }
            >
              <div className={styles.content}>
                <motion.p
                  className={styles.eyebrow}
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.34, ease: MOTION_EASE.sylf, delay: 0.12 }}
                >
                  <span className={styles.eyebrowRule} aria-hidden="true" />
                  Sylvie
                  <span className={styles.eyebrowRuleEnd} aria-hidden="true" />
                </motion.p>

                <Emblem
                  variant={isRank ? "rank" : "level"}
                  reduceMotion={reduceMotion}
                  level={rolledLevel}
                  rank={displayRank}
                  swapped={swapped}
                  particles={particles}
                />

                <h2 className={styles.title}>
                  {title.split("").map((char, index) =>
                    char === " " ? (
                      <span
                        key={`space-${index}`}
                        className={styles.titleLetterSpace}
                        aria-hidden="true"
                      />
                    ) : (
                      <motion.span
                        key={`${char}-${index}`}
                        className={styles.titleLetter}
                        initial={
                          reduceMotion
                            ? { opacity: 0 }
                            : { opacity: 0, y: 26, filter: "blur(10px)" }
                        }
                        animate={
                          reduceMotion
                            ? { opacity: 1 }
                            : { opacity: 1, y: 0, filter: "blur(0px)" }
                        }
                        transition={
                          reduceMotion
                            ? { duration: 0.25, delay: 0.05 }
                            : {
                                type: "spring",
                                stiffness: 420,
                                damping: 30,
                                mass: 0.7,
                                delay: titleBase + index * 0.038,
                              }
                        }
                      >
                        {char}
                      </motion.span>
                    )
                  )}
                </h2>

                <motion.span
                  className={styles.titleRule}
                  aria-hidden="true"
                  initial={{ scaleX: 0, opacity: 0 }}
                  animate={{ scaleX: 1, opacity: 1 }}
                  transition={{
                    duration: reduceMotion ? 0.2 : 0.55,
                    ease: MOTION_EASE.sylf,
                    delay: reduceMotion ? 0.1 : titleBase + 0.28,
                  }}
                />

                <motion.div
                  className={styles.levelRow}
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: reduceMotion ? 0.25 : 0.38,
                    ease: MOTION_EASE.sylf,
                    delay: reduceMotion ? 0.12 : isRank ? 0.5 : 0.62,
                  }}
                >
                  {hasOdometer && (
                    <>
                      <span className={styles.chip}>LV. {previousLevel}</span>
                      <span className={styles.link} aria-hidden="true">
                        <ArrowRight size={14} />
                      </span>
                    </>
                  )}
                  <span className={`${styles.chip} ${styles.chipNew}`}>LV. {newLevel}</span>
                </motion.div>

                {isRank && newRank ? (
                  <motion.div
                    className={styles.reward}
                    initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: reduceMotion ? 0.25 : 0.45,
                      ease: MOTION_EASE.sylf,
                      delay: reduceMotion ? 0.15 : RANK_SWAP_S + 0.35,
                    }}
                  >
                    <span className={styles.rewardBadgeScale}>
                      <span
                        className={`rank-badge rank-${newRank} ${
                          RANK_BADGE_STYLES.has(newRank) ? "" : styles.rankFallback
                        }`}
                      >
                        {newRank}
                      </span>
                    </span>
                    <span className={styles.rewardText}>
                      <span className={styles.rewardLabel}>Rank Promoted</span>
                      <span className={styles.rewardValue}>
                        {previousRank ? `${previousRank}-Rank → ` : ""}
                        {newRank}-Rank
                      </span>
                    </span>
                  </motion.div>
                ) : xpGained ? (
                  <motion.div
                    className={styles.reward}
                    initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: reduceMotion ? 0.25 : 0.4,
                      ease: MOTION_EASE.sylf,
                      delay: reduceMotion ? 0.15 : 0.78,
                    }}
                  >
                    <Sparkles
                      size={18}
                      aria-hidden="true"
                      style={{ color: "var(--accent-text, var(--accent-primary-light))" }}
                    />
                    <span className={styles.xpValue}>+{xpGained} XP</span>
                  </motion.div>
                ) : null}

                <div className={styles.foot}>
                  <span className={styles.rail} aria-hidden="true">
                    <motion.span
                      className={styles.railFill}
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{
                        duration: railDuration,
                        ease: "linear",
                        delay: railDelay,
                      }}
                    />
                  </span>
                  <p className={styles.hint}>
                    <span className={styles.hintDot} aria-hidden="true" />
                    Tap anywhere to continue
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ─── Emblem ─────────────────────────────────────────────────────────────────
   Self-contained hero artwork. Everything decorative (rings, burst, beam) lives
   inside it and is centred on it, so no line ever crosses the headline or the
   chips below. The level variant holds a slot-rolling numeral; the rank variant
   holds the rank glyph and plays the charge → flash → swap beat. */

type EmblemParticle = ReturnType<typeof buildParticles>[number];

interface EmblemProps {
  variant: "level" | "rank";
  reduceMotion: boolean;
  level: number;
  rank: string;
  swapped: boolean;
  particles: EmblemParticle[];
}

function Emblem({ variant, reduceMotion, level, rank, swapped, particles }: EmblemProps) {
  const isRank = variant === "rank";
  const burstDelay = isRank ? RANK_SWAP_S : 0.5;
  const isLongRank = rank.length > 1;
  const levelText = String(level);

  return (
    <div className={`${styles.emblem} ${isRank ? styles.emblemRank : ""}`}>
      {!reduceMotion && isRank && (
        <motion.span
          className={styles.beam}
          aria-hidden="true"
          initial={{ opacity: 0, scaleX: 0.1 }}
          animate={{ opacity: [0, 0.95, 0], scaleX: [0.1, 1, 0.65] }}
          transition={{
            duration: 1.3,
            ease: MOTION_EASE.sylf,
            delay: burstDelay - 0.04,
            times: [0, 0.18, 1],
          }}
        />
      )}

      <motion.span
        className={styles.horizon}
        aria-hidden="true"
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: 1, opacity: 1 }}
        transition={{
          duration: reduceMotion ? 0.2 : 0.9,
          ease: MOTION_EASE.sylf,
          delay: reduceMotion ? 0.1 : 0.2,
        }}
      />

      <span className={`${styles.halo} ${swapped ? styles.haloLit : ""}`} aria-hidden="true" />

      <svg
        className={styles.sigil}
        viewBox="-8 -8 216 216"
        aria-hidden="true"
        focusable="false"
      >
        <g className={styles.sigilSpin}>
          <circle
            cx="100"
            cy="100"
            r="96"
            fill="none"
            stroke="var(--accent-primary)"
            strokeOpacity="0.34"
            strokeWidth="1"
            strokeDasharray="3 9"
          />
        </g>

        <g className={styles.sigilSpinReverse}>
          <circle
            className={styles.arc}
            cx="100"
            cy="100"
            r="87"
            fill="none"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeDasharray="62 485"
          />
          <circle
            className={styles.arc}
            cx="100"
            cy="100"
            r="87"
            fill="none"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeDasharray="62 485"
            strokeDashoffset="-273"
          />
        </g>

        {TICKS.map((tick) => (
          <line
            key={tick.id}
            x1={tick.x1}
            y1={tick.y1}
            x2={tick.x2}
            y2={tick.y2}
            stroke="var(--accent-primary)"
            strokeOpacity={tick.long ? 0.62 : 0.28}
            strokeWidth="1"
          />
        ))}

        {isRank && (
          <motion.polygon
            className={styles.hexStar}
            points={HEX_STAR_POINTS}
            fill="none"
            strokeWidth="1"
            initial={reduceMotion ? { opacity: 0 } : { pathLength: 0, opacity: 0 }}
            animate={reduceMotion ? { opacity: 0.5 } : { pathLength: 1, opacity: 0.5 }}
            transition={{
              duration: reduceMotion ? 0.3 : 1.1,
              ease: MOTION_EASE.sylf,
              delay: reduceMotion ? 0.05 : 0.3,
            }}
          />
        )}

        <motion.polygon
          className={styles.hexLine}
          points={HEX_POINTS}
          strokeWidth="1.6"
          strokeLinejoin="round"
          initial={reduceMotion ? { opacity: 0 } : { pathLength: 0, opacity: 0 }}
          animate={reduceMotion ? { opacity: 1 } : { pathLength: 1, opacity: 1 }}
          transition={{
            duration: reduceMotion ? 0.3 : 1.05,
            ease: MOTION_EASE.sylf,
            delay: reduceMotion ? 0.05 : 0.15,
          }}
        />

        {HEX_VERTICES.map(([x, y], i) => (
          <motion.circle
            key={i}
            className={styles.node}
            cx={x}
            cy={y}
            r={isRank ? 3.4 : 2.6}
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.2 }}
            animate={
              reduceMotion
                ? { opacity: 1 }
                : isRank
                  ? {
                      opacity: [0, 0.35, 1, 1],
                      scale: [0.2, 1, 1.6, 1],
                    }
                  : { opacity: 1, scale: 1 }
            }
            transition={
              isRank && !reduceMotion
                ? {
                    duration: 0.55,
                    ease: MOTION_EASE.sylf,
                    delay: 0.5 + i * 0.1,
                    times: [0, 0.2, 0.6, 1],
                  }
                : { duration: 0.4, ease: MOTION_EASE.sylf, delay: reduceMotion ? 0.1 : 0.5 + i * 0.05 }
            }
          />
        ))}
      </svg>

      {!reduceMotion && (
        <>
          {isRank && (
            <motion.span
              className={styles.flash}
              aria-hidden="true"
              initial={{ opacity: 0, scale: 0.4 }}
              animate={{ opacity: [0, 1, 0], scale: [0.4, 1.1, 1.5] }}
              transition={{
                duration: 0.85,
                ease: MOTION_EASE.sylf,
                delay: burstDelay - 0.02,
                times: [0, 0.2, 1],
              }}
            />
          )}
          <motion.span
            className={styles.shockwave}
            aria-hidden="true"
            initial={{ opacity: 0, scale: 0.24 }}
            animate={{ opacity: [0, 0.75, 0], scale: [0.24, 1.05, 1.35] }}
            transition={{ duration: 1.15, ease: MOTION_EASE.sylf, delay: burstDelay }}
          />
          {isRank && (
            <motion.span
              className={styles.shockwave}
              aria-hidden="true"
              initial={{ opacity: 0, scale: 0.2 }}
              animate={{ opacity: [0, 0.55, 0], scale: [0.2, 0.8, 1.15] }}
              transition={{ duration: 1.1, ease: MOTION_EASE.sylf, delay: burstDelay + 0.16 }}
            />
          )}
          <div className={styles.particles} aria-hidden="true">
            {particles.map((p) => (
              <span
                key={p.id}
                className={styles.particle}
                style={
                  {
                    width: `${p.size}px`,
                    height: `${p.size}px`,
                    "--lu-x": p.x,
                    "--lu-y": p.y,
                    "--lu-xh": p.xh,
                    "--lu-yh": p.yh,
                    "--lu-xo": p.xo,
                    "--lu-yo": p.yo,
                    "--lu-delay": p.delay,
                    "--lu-duration": p.duration,
                  } as React.CSSProperties
                }
              />
            ))}
          </div>
        </>
      )}

      <motion.div
        className={styles.core}
        aria-hidden="true"
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.82 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={
          reduceMotion
            ? { duration: 0.25, delay: 0.1 }
            : { type: "spring", stiffness: 340, damping: 26, delay: 0.32 }
        }
      >
        <span className={styles.coreLabel}>{isRank ? "Rank" : "Level"}</span>
        <span className={styles.coreStage}>
          <AnimatePresence mode="popLayout" initial={false}>
            {isRank ? (
              <motion.span
                key={rank}
                className={[
                  styles.glyph,
                  isLongRank ? styles.glyphLong : "",
                  swapped ? "" : styles.glyphDormant,
                ].join(" ")}
                initial={
                  reduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, scale: 0.55, filter: "blur(10px)" }
                }
                animate={
                  reduceMotion
                    ? { opacity: 1 }
                    : { opacity: 1, scale: 1, filter: "blur(0px)" }
                }
                exit={
                  reduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, scale: 1.35, filter: "blur(8px)" }
                }
                transition={
                  reduceMotion
                    ? { duration: 0.2 }
                    : { type: "spring", stiffness: 380, damping: 22, mass: 0.8 }
                }
              >
                {rank}
              </motion.span>
            ) : (
              <motion.span
                key={level}
                className={`${styles.numeral} ${levelText.length >= 3 ? styles.numeralDense : ""}`}
                initial={
                  reduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, y: 30, filter: "blur(6px)" }
                }
                animate={
                  reduceMotion
                    ? { opacity: 1 }
                    : { opacity: 1, y: 0, filter: "blur(0px)" }
                }
                exit={
                  reduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, y: -30, filter: "blur(6px)" }
                }
                transition={{ duration: reduceMotion ? 0.2 : 0.26, ease: MOTION_EASE.sylf }}
              >
                {levelText}
              </motion.span>
            )}
          </AnimatePresence>
        </span>
      </motion.div>
    </div>
  );
}
