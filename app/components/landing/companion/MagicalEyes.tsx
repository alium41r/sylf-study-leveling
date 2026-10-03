"use client";

import { useState } from "react";
import type { Expression } from "./model";
import s from "./MagicalEyes.module.css";

/** Eye artwork vocabulary, independent of the existing semantic state machine. */
export const EYE_EXPRESSIONS = [
  "NEUTRAL",
  "HAPPY",
  "CHEERFUL",
  "EXCITED",
  "FOCUSED",
  "CURIOUS",
  "SLEEPY",
  "SAD",
  "SURPRISED",
] as const;
export type EyeExpression = (typeof EYE_EXPRESSIONS)[number];
export const eyeExpressionFor = (expression: Expression): EyeExpression =>
  expression === "THINKING" ? "FOCUSED" : expression;

// Traced proportionally from Variant 3: 27 × 62 spindle, organic rounded ends.
const OPEN =
  "M0-50C-12-50-21-26-22-1C-23 24-15 49-1 50C13 52 22 26 22 1C22-23 13-49 0-50Z";
const FOCUSED =
  "M-24-44C-17-38 9-14 19 3C26 21 25 37 20 44C-1 39-13 24-17 6C-21-11-22-31-24-44Z";
const SAD =
  "M22-37C12-21-10 3-31 10C-23 9-19 8-16 6C-22 25-12 42 1 40C18 38 21 1 22-37Z";
const HAPPY =
  "M-31 18C-25 2-13-12 0-12C13-12 25 2 31 16C32 20 29 21 26 18C16 9 8 2 0 2C-9 2-19 10-27 19C-30 22-33 22-31 18Z";
const CHEERFUL =
  "M-32 16C-25-2-12-17 0-17C14-17 27 1 33 17C35 23 30 25 26 20C16 10 8-2 0-2C-10-2-20 11-27 21C-30 26-36 23-32 16Z";
const EXCITED =
  "M-22-25C-27-28-29-23-25-19L-1 0L-25 18C-31 23-27 29-21 26L20 8C26 5 27 0 21-4Z";
const SLEEPY =
  "M-32 12C-17 21 10 25 32 14C22 29 5 34-10 29C-20 26-28 21-32 12Z";
const STAR = "M0-23C3-8 6-5 13 0C6 4 3 8 0 22C-3 8-6 4-13 0C-6-5-3-8 0-23Z";
const SPARK = "M0-6Q1-1 5 0Q1 1 0 6Q-1 1-5 0Q-1-1 0-6Z";

function EyeDefinitions({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient
        id={`${id}-field`}
        x1="-7"
        y1="-50"
        x2="8"
        y2="51"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#b0acff" />
        <stop offset=".22" stopColor="#7275ee" />
        <stop offset=".47" stopColor="#626bed" />
        <stop offset=".73" stopColor="#98adff" />
        <stop offset=".91" stopColor="#c8e9ff" />
        <stop offset="1" stopColor="#f1fcff" />
      </linearGradient>
      <radialGradient id={`${id}-depth`} cx=".62" cy=".36" r=".6">
        <stop stopColor="#333dcc" stopOpacity=".86" />
        <stop offset=".6" stopColor="#5557df" stopOpacity=".3" />
        <stop offset="1" stopColor="#a9beff" stopOpacity="0" />
      </radialGradient>
      <linearGradient
        id={`${id}-flow`}
        x1="-18"
        y1="0"
        x2="19"
        y2="7"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#eefbff" stopOpacity=".8" />
        <stop offset=".3" stopColor="#b9deff" stopOpacity=".42" />
        <stop offset=".58" stopColor="#b8b4ff" stopOpacity=".15" />
        <stop offset="1" stopColor="#e9faff" stopOpacity=".78" />
      </linearGradient>
      <radialGradient id={`${id}-floor`} cx=".5" cy="1" r=".42">
        <stop stopColor="#f5fdff" stopOpacity=".94" />
        <stop offset=".35" stopColor="#c8eaff" stopOpacity=".22" />
        <stop offset="1" stopColor="#b7b0ff" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`${id}-bloom`}>
        <stop stopColor="#a7b8ff" stopOpacity=".64" />
        <stop offset=".42" stopColor="#7e86ff" stopOpacity=".28" />
        <stop offset=".68" stopColor="#7771f3" stopOpacity=".1" />
        <stop offset="1" stopColor="#7771f3" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`${id}-core`}>
        <stop stopColor="#fff" stopOpacity=".45" />
        <stop offset=".35" stopColor="#dfefff" stopOpacity=".18" />
        <stop offset="1" stopColor="#a3b0ff" stopOpacity="0" />
      </radialGradient>
      <linearGradient
        id={`${id}-rim`}
        x1="0"
        y1="-50"
        x2="0"
        y2="50"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#c3bbff" />
        <stop offset=".4" stopColor="#aebdff" />
        <stop offset="1" stopColor="#f4fdff" />
      </linearGradient>
      <path id={`${id}-open`} d={OPEN} />
      <path id={`${id}-focused`} d={FOCUSED} />
      <path id={`${id}-sad`} d={SAD} />
      {(["open", "focused", "sad"] as const).map((shape) => (
        <clipPath id={`${id}-${shape}-clip`} key={shape}>
          <use href={`#${id}-${shape}`} />
        </clipPath>
      ))}
    </defs>
  );
}

/** Shared glass-like interior. No image or animated blur: bounded SVG gradients. */
function OpenEye({
  id,
  shape,
}: {
  id: string;
  shape: "open" | "focused" | "sad";
}) {
  const url = (name: string) => `url(#${id}-${name})`;
  return (
    <g data-eye-layer="detailed-eye">
      <ellipse
        data-eye-layer="bloom"
        cx="0"
        cy="1"
        rx="43"
        ry="69"
        fill={url("bloom")}
      />
      <use
        data-eye-layer="silhouette"
        href={`#${id}-${shape}`}
        fill={url("field")}
      />
      <g clipPath={url(`${shape}-clip`)}>
        <path
          data-eye-layer="depth"
          d="M-24-52H25V52H-24Z"
          fill={url("depth")}
        />
        <path
          data-eye-layer="inner-flow"
          d={
            shape === "open"
              ? "M-19-46C-14-25-15-16-18-1C-23 21-15 40-6 49L-22 53L-28-34ZM18-45C17-18 12-13 17 5C24 24 12 40 4 51L24 53L28-42Z"
              : shape === "focused"
                ? "M-20-37C-6-22 10-5 18 6C23 20 22 32 18 44L27 48L30-10ZM-18-4C-13 23 2 39 20 44L21 37C0 31-10 10-12-10Z"
                : "M21-36C13-15 13 22 1 39L11 45L26 10ZM-18 5C-24 25-12 41 2 40L2 34C-9 35-16 22-12 7Z"
          }
          fill={url("flow")}
        />
        <path d="M-24-50H24V53H-24Z" fill={url("floor")} />
        <ellipse
          data-eye-layer="core"
          cx="0"
          cy="2"
          rx="20"
          ry="34"
          fill={url("core")}
        />
        <path
          data-eye-layer="star-reflection"
          d={STAR}
          fill="#fff"
          transform={
            shape === "open" ? "translate(0 2)" : "translate(4 10) scale(.88)"
          }
        />
        {shape === "open" ? (
          <>
            <ellipse
              data-eye-layer="gloss"
              cx="-9"
              cy="-29"
              rx="6.3"
              ry="14"
              transform="rotate(18 -9 -29)"
              fill="#fff"
            />
            <ellipse
              cx="8"
              cy="-31"
              rx="1.4"
              ry="2.8"
              transform="rotate(-20 8 -31)"
              fill="#eef4ff"
              opacity=".86"
            />
          </>
        ) : (
          <>
            <path
              data-eye-layer="gloss"
              d={
                shape === "focused"
                  ? "M-24-44L-13-33L-20-34Z"
                  : "M22-37L14-25L20-28Z"
              }
              fill="#fff"
            />
            <ellipse
              cx={shape === "focused" ? -13 : 13}
              cy="-20"
              rx="1.7"
              ry="2.5"
              fill="#f7fcff"
            />
          </>
        )}
        <g className={s.micro} fill="#e7f6ff">
          <ellipse cx="-9" cy="30" rx="1.6" ry="3" opacity=".65" />
          <ellipse cx="1" cy="38" rx="1.5" ry="2.8" opacity=".75" />
          <circle cx="10" cy="27" r="1.3" opacity=".6" />
        </g>
      </g>
      <use
        href={`#${id}-${shape}`}
        fill="none"
        stroke={url("rim")}
        strokeWidth="1.05"
      />
    </g>
  );
}

function Sparkle({ x, y, size = 1 }: { x: number; y: number; size?: number }) {
  return (
    <path
      d={SPARK}
      transform={`translate(${x} ${y}) scale(${size})`}
      fill="#f8fcff"
    />
  );
}

function EyePair({
  id,
  expression,
}: {
  id: string;
  expression: EyeExpression;
}) {
  const open = !["HAPPY", "CHEERFUL", "EXCITED", "SLEEPY"].includes(expression);
  const shape =
    expression === "FOCUSED"
      ? "focused"
      : expression === "SAD"
        ? "sad"
        : "open";
  const closed =
    expression === "HAPPY"
      ? HAPPY
      : expression === "CHEERFUL"
        ? CHEERFUL
        : expression === "EXCITED"
          ? EXCITED
          : SLEEPY;
  return (
    <g data-eye-variant={expression}>
      {[-76, 76].map((x, i) => {
        const curious = expression === "CURIOUS";
        const size = curious
          ? i === 0
            ? 1.06
            : 0.56
          : expression === "SURPRISED"
            ? 1.04
            : 1;
        // Reference Curious shares a bottom baseline: the smaller eye sits lower.
        const y = curious ? (1 - size) * 72 : 0;
        return (
          <g
            key={i}
            transform={`translate(${x} ${y})`}
            data-eye-side={i === 0 ? "left" : "right"}
          >
            <g
              className={
                i === 1 && expression === "NEUTRAL"
                  ? s.curiousGlance
                  : undefined
              }
            >
              <g
                transform={`scale(${1.45 * size * (i === 0 ? 1 : -1)} ${1.45 * size})`}
              >
                {open ? (
                  <OpenEye id={id} shape={shape} />
                ) : (
                  <g data-eye-layer="closed-shape">
                    <ellipse
                      cx="0"
                      cy={expression === "SLEEPY" ? 20 : 3}
                      rx="47"
                      ry="29"
                      fill={`url(#${id}-bloom)`}
                      opacity={expression === "SLEEPY" ? 0.65 : 1}
                    />
                    <path
                      d={closed}
                      fill="#bfc5ff"
                      stroke="#a4adff"
                      strokeWidth="3"
                      strokeOpacity=".22"
                    />
                    <path d={closed} fill="#fcfdff" />
                  </g>
                )}
                <g className={s.accents} data-eye-layer="accents">
                  {expression === "NEUTRAL" && (
                    <g className={s.micro} fill="#cfddff">
                      <circle cx="-37" cy="-4" r=".9" opacity=".6" />
                      <circle cx="-36" cy="16" r="1.1" opacity=".75" />
                      <circle cx="-32" cy="28" r=".6" opacity=".4" />
                    </g>
                  )}
                  {expression === "HAPPY" && (
                    <>
                      <Sparkle x={-28} y={40} size={1.1} />
                      <Sparkle x={-20} y={-25} size={0.45} />
                    </>
                  )}
                  {expression === "CHEERFUL" && (
                    <>
                      <Sparkle x={-22} y={-39} size={1.2} />
                      <path
                        d="M-31 35l-6 6M-22 39l-5 7"
                        stroke="#f8fcff"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                      />
                    </>
                  )}
                  {expression === "EXCITED" && (
                    <>
                      <Sparkle x={-43} y={0} size={1.1} />
                      <Sparkle x={-21} y={-40} size={0.5} />
                      <Sparkle x={-26} y={40} size={0.6} />
                    </>
                  )}
                  {expression === "SLEEPY" && (
                    <Sparkle x={-11} y={46} size={i === 0 ? 0.55 : 0.8} />
                  )}
                  {(expression === "FOCUSED" || expression === "SAD") && (
                    <g className={s.micro} fill="#dae8ff">
                      <circle cx="-30" cy="8" r="1" />
                      <circle cx="-26" cy="22" r=".7" />
                    </g>
                  )}
                  {expression === "SURPRISED" && (
                    <path
                      d="M-37-17l-10-6M-39 0h-10M-37 17l-10 6"
                      stroke="#f8fcff"
                      strokeWidth="2.1"
                      strokeLinecap="round"
                    />
                  )}
                </g>
              </g>
            </g>
          </g>
        );
      })}
    </g>
  );
}

export default function MagicalEyes({
  id,
  expression,
  blink,
}: {
  id: string;
  expression: EyeExpression;
  /** A one-shot review can cue the existing drawn lid; undefined uses CSS cadence. */
  blink?: boolean;
}) {
  // At most two eye drawings during a short dissolve. No timer/RAF or new semantic state.
  const [shown, setShown] = useState({
    current: expression,
    previous: expression,
  });
  if (shown.current !== expression)
    setShown({ current: expression, previous: shown.current });
  const changing = shown.current !== shown.previous;
  const canBlink = !["HAPPY", "CHEERFUL", "EXCITED", "SLEEPY"].includes(
    expression
  );
  return (
    <g
      data-part="eyes"
      data-eye-expression={expression}
      data-blink={blink === undefined ? undefined : blink ? "closed" : "open"}
      className={s.eyes}
      transform="translate(491 431)"
    >
      <EyeDefinitions id={id} />
      <g className={canBlink ? s.openPhase : undefined}>
        {changing && (
          <g className={s.leaving} data-eye-transition="outgoing">
            <EyePair id={id} expression={shown.previous} />
          </g>
        )}
        <g
          key={shown.current}
          className={changing ? s.entering : undefined}
          data-eye-transition="current"
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget && changing)
              setShown((v) => ({ ...v, previous: v.current }));
          }}
        >
          {expression === "NEUTRAL" ? (
            <>
              <g className={s.idleNeutral}>
                <EyePair id={id} expression="NEUTRAL" />
              </g>
              <g className={s.idleHappy} data-idle-expression="happy">
                <EyePair id={id} expression="HAPPY" />
              </g>
            </>
          ) : (
            <EyePair id={id} expression={shown.current} />
          )}
        </g>
      </g>
      {canBlink && (
        <g className={s.closedPhase} data-eye-layer="blink-lid">
          {[-76, 76].map((x) => (
            <g key={x} transform={`translate(${x} 0) scale(1.45)`}>
              <ellipse
                cx="0"
                cy="20"
                rx="39"
                ry="16"
                fill={`url(#${id}-bloom)`}
              />
              <path d="M-23 15Q0 29 23 15Q1 35-23 15Z" fill="#f5faff" />
            </g>
          ))}
        </g>
      )}
    </g>
  );
}
