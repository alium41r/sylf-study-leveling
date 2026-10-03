import { useId } from "react";

type MotifProps = { className?: string };

/** Pointed, folded planes rather than botanical veins. The base sits at (0, 19). */
export function CelestialLeaf({ className }: MotifProps) {
  const id = useId();
  return (
    <svg
      className={className}
      viewBox="0 0 72 38"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient
          id={`${id}-leaf`}
          x1="12"
          y1="29"
          x2="56"
          y2="4"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="var(--decor-leaf-base, #353b7a)" />
          <stop offset=".48" stopColor="var(--decor-leaf-mid, #7776e4)" />
          <stop offset="1" stopColor="var(--decor-leaf-tip, #b9caff)" />
        </linearGradient>
      </defs>
      <path
        d="M0 19C16 19 21 3 37 7C50 10 56 6 72 2C59 13 58 26 43 30C27 34 15 23 0 19Z"
        fill={`url(#${id}-leaf)`}
      />
      <path
        d="M0 19 37 7 30 20 43 30C26 33 16 23 0 19Z"
        fill="var(--decor-leaf-fold, #43468e)"
        opacity=".8"
      />
      <path
        d="m30 20 7-13 35-5-21 14Z"
        fill="var(--decor-leaf-light, #a3b4ff)"
        opacity=".75"
      />
      <path
        d="m30 20 21-4 21-14-29 28Z"
        fill="var(--decor-leaf-plane, #7e83ed)"
        opacity=".58"
      />
      <path
        d="M4 19 30 20 65 6"
        fill="none"
        stroke="var(--decor-leaf-ridge, #c4d7ff)"
        strokeWidth=".55"
        opacity=".5"
      />
    </svg>
  );
}

export function CelestialStar({ className }: MotifProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M8 0C9.1 8.2 10.2 10.5 16 12C10.2 13.5 9.1 15.8 8 24C6.9 15.8 5.8 13.5 0 12C5.8 10.5 6.9 8.2 8 0Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Glass highlight and a gradient bloom; no SVG blur/filter or animated paint. */
export function CelestialLantern({ className }: MotifProps) {
  const id = useId();
  return (
    <svg
      className={className}
      viewBox="0 0 60 130"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient
          id={`${id}-glass`}
          x1="12"
          y1="45"
          x2="48"
          y2="109"
          gradientUnits="userSpaceOnUse"
        >
          <stop
            stopColor="var(--decor-glass-top, #a0a0ee)"
            stopOpacity="var(--decor-glass-top-opacity, .32)"
          />
          <stop
            offset=".5"
            stopColor="var(--decor-glass-mid, #45477d)"
            stopOpacity="var(--decor-glass-mid-opacity, .56)"
          />
          <stop
            offset="1"
            stopColor="var(--decor-glass-base, #777cc1)"
            stopOpacity="var(--decor-glass-base-opacity, .65)"
          />
        </linearGradient>
        <radialGradient id={`${id}-bloom`}>
          <stop
            stopColor="var(--decor-bloom, #b4bbff)"
            stopOpacity="var(--decor-bloom-opacity, .48)"
          />
          <stop
            offset="1"
            stopColor="var(--decor-bloom, #777dff)"
            stopOpacity="0"
          />
        </radialGradient>
      </defs>
      <path
        d="M30 0v14m0 9v8"
        stroke="var(--decor-metal, #bda177)"
        strokeWidth=".65"
        fill="none"
      />
      <ellipse
        cx="30"
        cy="19"
        rx="2.3"
        ry="4.5"
        fill="none"
        stroke="var(--decor-metal-edge, #c3a87e)"
        strokeWidth=".7"
      />
      <ellipse
        cx="30"
        cy="31"
        rx="4"
        ry="2"
        fill="none"
        stroke="var(--decor-metal-edge, #c3a87e)"
        strokeWidth=".7"
      />
      <path
        d="m25 33-2 7h14l-2-7Z"
        fill="var(--decor-metal-cap, #a48b6a)"
        opacity=".85"
      />
      <path
        d="M25 40C23 49 10 56 11 79C11 98 16 108 30 109C44 108 49 98 49 79C50 56 37 49 35 40Z"
        fill={`url(#${id}-glass)`}
        stroke="var(--decor-glass-edge, #b4b8e4)"
        strokeWidth=".8"
        strokeOpacity=".72"
      />
      <ellipse cx="30" cy="78" rx="26" ry="35" fill={`url(#${id}-bloom)`} />
      <path
        d="M24 47C21 51 17 55 16 65"
        fill="none"
        stroke="var(--decor-glass-highlight, #ebe9ff)"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity=".85"
      />
      <path
        d="M30 61C31.3 74 33.5 77 41 80C33.5 82 31.3 86 30 99C28.7 86 26.5 82 19 80C26.5 77 28.7 74 30 61Z"
        fill="var(--decor-lantern-core, #eef0ff)"
      />
      <path
        d="m26 112 4 9 4-9"
        fill="var(--decor-lantern-tip, #bfc8f3)"
        opacity=".75"
      />
      <path
        d="M30 121v9"
        stroke="var(--decor-metal, #bda177)"
        strokeWidth=".65"
      />
    </svg>
  );
}

export function CelestialBooks({ className }: MotifProps) {
  const id = useId();
  return (
    <svg
      className={className}
      viewBox="0 0 180 136"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient
          id={`${id}-pages`}
          x1="101"
          y1="62"
          x2="152"
          y2="117"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="var(--decor-pages-start, #555278)" />
          <stop offset="1" stopColor="var(--decor-pages-end, #b1a4cd)" />
        </linearGradient>
      </defs>
      <path
        d="m4 68 90-19 71 21-89 21Z"
        fill="var(--decor-book-top, #323159)"
      />
      <path d="m4 68 72 23v39L4 106Z" fill="var(--decor-book-spine, #1b203a)" />
      <path
        d="m76 91 89-21v37l-89 23Z"
        fill="var(--decor-book-cover, #3b365d)"
      />
      <path
        d="m91 94 67-16v25l-67 17C84 113 86 103 91 94Z"
        fill={`url(#${id}-pages)`}
      />
      <path
        d="m93 100 62-15m-63 21 63-15m-64 21 64-15m-63 21 63-15"
        stroke="var(--decor-page-rule, #d7c5ed)"
        strokeWidth=".6"
        opacity="var(--decor-page-rule-opacity, .3)"
      />
      <path
        d="M83 91c-10 13-9 29-1 35"
        fill="none"
        stroke="var(--decor-book-edge, #8c85b5)"
        strokeWidth="1"
      />
      <path
        d="m19 25 67-13 61 17-63 16Z"
        fill="var(--decor-book-top, #34335e)"
      />
      <path
        d="m19 25 65 20v37L19 61Z"
        fill="var(--decor-book-spine, #20233e)"
      />
      <path
        d="m84 45 63-16v34L84 82Z"
        fill="var(--decor-book-cover, #423b67)"
      />
      <path
        d="m98 47 44-11v24l-44 13C91 67 93 54 98 47Z"
        fill={`url(#${id}-pages)`}
      />
      <path
        d="m99 52 40-10m-41 16 41-10m-41 16 41-10m-40 16 40-10"
        stroke="var(--decor-page-rule, #dfcaef)"
        strokeWidth=".6"
        opacity="var(--decor-page-rule-opacity, .28)"
      />
      <path
        d="M91 43c-8 13-8 26-1 35"
        fill="none"
        stroke="var(--decor-book-edge, #a098c4)"
        strokeWidth="1"
      />
      <path
        d="m62 44 2 7 5 4-5 3-2 8-2-9-5-4 5-2Z"
        fill="none"
        stroke="var(--decor-book-rune, #a49fd8)"
        strokeWidth=".9"
      />
      <path
        d="m53 94 2 6 5 4-5 2-2 8-2-9-5-3 5-2Z"
        fill="none"
        stroke="var(--decor-book-rune, #a49fd8)"
        strokeWidth=".9"
      />
    </svg>
  );
}
