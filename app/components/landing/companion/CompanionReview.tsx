"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Companion, { type SvgSequenceBeat } from "./Companion";
import { EYE_EXPRESSIONS, type EyeExpression } from "./MagicalEyes";
import {
  ACTIONS,
  presentationFor,
  type CompanionReaction,
  type CompanionState,
} from "./model";
import s from "./CompanionReview.module.css";
import {
  setPixelCompanionPreview,
  setPixelCompanionVariant,
  setPixelEyePreview,
  usePixelCompanionVariant,
  usePixelEyePreview,
  PIXEL_EYE_STATES,
  type PixelEyeState,
} from "./pixel-preview";

const label = (value: string) => value.toLowerCase().replaceAll("_", " ");
export default function CompanionReview() {
  const pixelVariant = usePixelCompanionVariant();
  const pixelPreview = pixelVariant !== "svg";
  const pixelEye = usePixelEyePreview();
  const comparisonQuery =
    pixelVariant === "svg"
      ? ""
      : `?companion=${pixelVariant}${pixelVariant === "pixel-layered" ? `&eyes=${pixelEye}` : ""}`;
  const blinkTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearBlink = () => {
    blinkTimers.current.forEach(clearTimeout);
    blinkTimers.current = [];
  };
  useEffect(
    () => () => {
      blinkTimers.current.forEach(clearTimeout);
    },
    []
  );
  const testBlink = () => {
    clearBlink();
    setPixelEyePreview("neutral");
    blinkTimers.current.push(
      setTimeout(() => setPixelEyePreview("blink"), 100)
    );
    blinkTimers.current.push(
      setTimeout(() => setPixelEyePreview("neutral"), 240)
    );
  };
  const [state, setState] = useState<CompanionState>("IDLE");
  const [reaction, setReaction] = useState<CompanionReaction>();
  const [count, setCount] = useState(0);
  const [paused, setPaused] = useState(false);
  const [eyePreview, setEyePreview] = useState<EyeExpression | "">("");
  const [sequenceBeat, setSequenceBeat] = useState<SvgSequenceBeat>();
  const sequenceTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const sequencePlaying = useRef(false);
  const clearSequence = useCallback(() => {
    sequenceTimers.current.forEach(clearTimeout);
    sequenceTimers.current = [];
  }, []);
  const cancelSequence = useCallback(() => {
    clearSequence();
    if (!sequencePlaying.current) return;
    sequencePlaying.current = false;
    setSequenceBeat(undefined);
    setEyePreview("");
    setReaction(undefined);
    setState("IDLE");
  }, [clearSequence]);
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const cancelWhenUnavailable = () => {
      const variant = new URLSearchParams(location.search).get("companion");
      if (document.hidden || variant === "pixel" || variant === "pixel-layered")
        cancelSequence();
    };
    document.addEventListener("visibilitychange", cancelWhenUnavailable);
    window.addEventListener("popstate", cancelWhenUnavailable);
    window.addEventListener("sylf-pixel-preview-change", cancelWhenUnavailable);
    return () => {
      clearSequence();
      document.removeEventListener("visibilitychange", cancelWhenUnavailable);
      window.removeEventListener("popstate", cancelWhenUnavailable);
      window.removeEventListener(
        "sylf-pixel-preview-change",
        cancelWhenUnavailable
      );
    };
  }, [cancelSequence, clearSequence]);
  const playSequence = () => {
    if (process.env.NODE_ENV !== "development" || pixelPreview || paused)
      return;
    cancelSequence();
    clearSequence();
    sequencePlaying.current = true;
    setEyePreview("");
    setReaction(undefined);
    setState("IDLE");
    setSequenceBeat("idle");
    const id = count + 1;
    setCount(id);
    // One bounded review sequence. Poses/dissolves stay in the existing CSS rig;
    // the happy beat uses the existing per-instance reaction controller.
    sequenceTimers.current = [
      setTimeout(() => setSequenceBeat("blink"), 1000),
      setTimeout(() => setSequenceBeat("idle"), 1150),
      setTimeout(() => {
        setState("DISCOVERING");
        setSequenceBeat("notice");
      }, 1400),
      setTimeout(() => {
        setState("IDLE");
        setReaction({ id, type: "QUEST_COMPLETE" });
        setSequenceBeat("happy");
      }, 2200),
      setTimeout(() => {
        setReaction(undefined);
        setState("IDLE");
        setSequenceBeat("return");
      }, 3300),
      setTimeout(() => {
        clearSequence();
        sequencePlaying.current = false;
        setSequenceBeat(undefined);
      }, 4050),
    ];
  };
  const react = (type: CompanionReaction["type"]) => {
    cancelSequence();
    setEyePreview("");
    setCount(count + 1);
    setReaction({ id: count + 1, type });
  };
  const expressionStudies = useMemo(
    () =>
      EYE_EXPRESSIONS.map((expression) => (
        <figure key={expression} className={s.card}>
          <Companion
            allowPixelPreview={false}
            size="LARGE"
            motion="none"
            preview={{
              expression: "NEUTRAL",
              action: "FLOATING",
              eyeExpression: expression,
            }}
          />
          <figcaption>{label(expression)}</figcaption>
        </figure>
      )),
    []
  );
  const actionStudies = useMemo(
    () =>
      ACTIONS.map((action) => (
        <figure key={action} className={`${s.card} ${s.dark}`}>
          <Companion
            allowPixelPreview={false}
            size="LARGE"
            motion="none"
            preview={{
              action,
              expression:
                action === "CELEBRATING"
                  ? "EXCITED"
                  : action === "READING" || action === "TIMER_MODE"
                    ? "THINKING"
                    : "NEUTRAL",
            }}
          />
          <figcaption>{label(action)}</figcaption>
        </figure>
      )),
    []
  );
  return (
    <div className={s.review}>
      <header className={s.header}>
        <div>
          <p>SYLF · LANDING COMPANION</p>
          <h1>A quiet little presence.</h1>
          <p>
            One character. Original palette. A little life between the chapters.
          </p>
        </div>
        <Link href={`/${comparisonQuery}`}>View the landing page →</Link>
      </header>
      {process.env.NODE_ENV === "development" && (
        <div
          className={s.comparison}
          aria-label="Development companion comparison"
        >
          <p className={s.eyebrow}>DEVELOPMENT ONLY · PIXEL PHASES 1 & 2</p>
          <div className={s.buttons}>
            <button
              aria-pressed={pixelVariant === "svg"}
              onClick={() => {
                clearBlink();
                setPixelCompanionPreview(false);
              }}
            >
              Current SVG companion
            </button>
            <button
              aria-pressed={pixelVariant === "pixel"}
              onClick={() => {
                clearBlink();
                setPixelCompanionPreview(true);
              }}
            >
              New pixel companion
            </button>
            <button
              aria-pressed={pixelVariant === "pixel-layered"}
              onClick={() => {
                clearBlink();
                setPixelCompanionVariant("pixel-layered");
              }}
            >
              Layered pixel companion
            </button>
            <Link href={`/onboarding${comparisonQuery}`}>
              View onboarding →
            </Link>
          </div>
          <p>
            Compare the complete Phase 1 artwork with the Phase 2 body and
            isolated eyes, then use the links for the small landing traveler and
            medium onboarding character. The SVG studies below stay available.
          </p>
          {pixelVariant === "pixel-layered" && (
            <div className={`${s.eyeControls} ${s.buttons}`}>
              <label htmlFor="pixel-eye-state">Pixel eye expression</label>
              <select
                id="pixel-eye-state"
                value={pixelEye}
                onChange={(event) => {
                  clearBlink();
                  setPixelEyePreview(event.target.value as PixelEyeState);
                }}
              >
                {PIXEL_EYE_STATES.map((eye) => (
                  <option key={eye} value={eye}>
                    {label(eye)}
                  </option>
                ))}
              </select>
              <button onClick={testBlink}>Test blink</button>
            </div>
          )}
        </div>
      )}
      <section className={s.stage} aria-label="Interactive motion review">
        <div className={s.canvas}>
          <Companion
            size="HERO"
            state={state}
            reaction={reaction}
            svgSequenceBeat={sequenceBeat}
            motion={paused ? "none" : "full"}
            preview={
              eyePreview
                ? { ...presentationFor(state), eyeExpression: eyePreview }
                : undefined
            }
          />
        </div>
        <div className={s.controls}>
          <p className={s.eyebrow}>MOTION & TRANSITIONS</p>
          <h2>Always the same Sylf.</h2>
          <p>
            Try a calm state, then a brief reaction. The reaction returns to the
            selected state. These controls only preview presentation.
          </p>
          <label htmlFor="companion-state">Base state</label>
          <select
            id="companion-state"
            disabled={pixelPreview}
            value={state}
            onChange={(e) => {
              cancelSequence();
              setEyePreview("");
              setState(e.target.value as CompanionState);
              setReaction(undefined);
            }}
          >
            <option value="IDLE">Idle / floating</option>
            <option value="FOCUSING">Focus / timer</option>
            <option value="READING">Reading</option>
            <option value="PLANNING">Planning / tablet</option>
            <option value="AI_THINKING">Thinking</option>
            <option value="DISCOVERING">Curious</option>
            <option value="REST">Rest / sleepy</option>
            <option value="ERROR">Uncertain / curious</option>
          </select>
          <label htmlFor="companion-eye">Magical eye study</label>
          <select
            id="companion-eye"
            disabled={pixelPreview}
            value={eyePreview}
            onChange={(e) => {
              cancelSequence();
              setEyePreview(e.target.value as EyeExpression | "");
            }}
          >
            <option value="">Follow the current state</option>
            {EYE_EXPRESSIONS.map((eye) => (
              <option key={eye} value={eye}>
                {label(eye)}
              </option>
            ))}
          </select>
          <div className={s.buttons}>
            <button disabled={pixelPreview} onClick={() => react("GREETING")}>
              Hello
            </button>
            <button
              disabled={pixelPreview}
              onClick={() => react("QUEST_COMPLETE")}
            >
              Happy reaction
            </button>
            <button disabled={pixelPreview} onClick={() => react("LEVEL_UP")}>
              Celebrate
            </button>
          </div>
          {process.env.NODE_ENV === "development" && !pixelPreview && (
            <div className={s.buttons}>
              <button disabled={paused} onClick={playSequence}>
                Play SVG reaction sequence
              </button>
              <button disabled={!sequenceBeat} onClick={cancelSequence}>
                Stop sequence
              </button>
            </div>
          )}
          {process.env.NODE_ENV === "development" && !pixelPreview && (
            <p
              aria-live="polite"
              aria-atomic="true"
              style={{ minHeight: "3.6em" }}
            >
              {sequenceBeat === "notice"
                ? "Noticed something · curious"
                : sequenceBeat === "happy"
                  ? "Warm happy reaction"
                  : sequenceBeat === "return"
                    ? "Returning to idle"
                    : sequenceBeat
                      ? "Idle · a natural blink"
                      : "Idle → blink → curious → happy → idle"}
            </p>
          )}
          <button
            className={s.pause}
            disabled={pixelPreview}
            aria-pressed={paused}
            onClick={() => {
              cancelSequence();
              setPaused(!paused);
            }}
          >
            {paused ? "Resume motion" : "Pause motion"}
          </button>
        </div>
      </section>
      <section aria-labelledby="expression-title">
        <p className={s.eyebrow}>THE EYES DO THE TALKING</p>
        <h2 id="expression-title">Nine magical expressions.</h2>
        <div className={s.grid}>{expressionStudies}</div>
      </section>
      <section aria-labelledby="action-title">
        <p className={s.eyebrow}>ONE REUSABLE CHARACTER</p>
        <h2 id="action-title">Six familiar moments.</h2>
        <div className={s.grid}>{actionStudies}</div>
      </section>
      <footer>
        Landing-page design review. The in-app chibi avatars are unchanged.
      </footer>
    </div>
  );
}
