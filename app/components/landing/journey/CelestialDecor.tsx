"use client";

import { useEffect, type CSSProperties, type RefObject } from "react";
import {
  CelestialBooks,
  CelestialLantern,
  CelestialLeaf,
  CelestialStar,
} from "./CelestialMotifs";
import styles from "./CelestialDecor.module.css";

type Variant =
  | "hero"
  | "intro"
  | "focus"
  | "progression"
  | "companion"
  | "planning"
  | "together"
  | "finale"
  | "footer";
type Leaf = [
  x: number,
  y: number,
  size: number,
  angle: number,
  opacity: number,
  keep?: boolean,
];
type StringOrnament = [x: number, y: number, length: number, keep?: boolean];
type Composition = {
  left: Leaf[];
  right: Leaf[];
  vines: [string, string];
  strings: [StringOrnament[], StringOrnament[]];
  lantern?: [side: "left" | "right", x: number, y: number, size: number][];
  books?: boolean;
  stars: number;
};

// Deliberately composed edge clusters. Coordinates are percentages of each lane,
// not randomized page scatter. Alternating branches leave the reading area quiet.
const compositions: Record<Variant, Composition> = {
  hero: {
    vines: [
      "M-20-40C190 90-65 150 40 245S240 315 255 420M-25 285C10 360-15 404 92 472S140 571 256 630M-20 585C148 650 8 772 139 832S214 942 269 1040",
      "M-25 75C26 195 232 161 244 291S-58 465 47 592S217 645 252 744M-30 485C151 505 5 660 82 745S235 794 266 920",
    ],
    left: [
      [22, 22, 48, 56, 0.58, true],
      [80, 30, 41, 24, 0.86],
      [23, 43, 50, -9, 0.93, true],
      [64, 56, 65, 37, 0.96],
      [36, 74, 32, 56, 0.44],
      [77, 85, 39, -13, 0.61],
    ],
    right: [
      [47, 14, 55, 74, 0.92, true],
      [76, 23, 42, -17, 0.85],
      [39, 45, 47, 45, 0.72],
      [62, 55, 62, -25, 0.98, true],
      [80, 62, 44, 18, 0.9],
      [40, 76, 31, 69, 0.48],
    ],
    strings: [
      [
        [18, 0, 165, true],
        [47, 16, 173],
        [60, 54, 155],
      ],
      [
        [19, 0, 130, true],
        [62, 7, 256],
        [38, 47, 287],
      ],
    ],
    lantern: [
      ["right", 20, 27, 48],
      ["right", 47, 56, 40],
    ],
    books: true,
    stars: 14,
  },
  intro: {
    vines: [
      "M-10-50C22 93 178 123 126 238S-10 732 139 1050",
      "M-20 270C129 385 1 709 176 840S182 953 256 1060",
    ],
    left: [
      [42, 28, 39, 51, 0.45, true],
      [22, 72, 32, -22, 0.35],
    ],
    right: [[46, 63, 38, 35, 0.45, true]],
    strings: [[[26, 14, 136, true]], [[51, 38, 118]]],
    stars: 4,
  },
  focus: {
    vines: [
      "M-18 120C112 172 3 443 90 565S12 872-20 990",
      "M-28-35C196 69 39 240 139 326S-26 566 147 718S207 913 275 1050",
    ],
    left: [[20, 42, 33, 48, 0.3, true]],
    right: [
      [40, 18, 47, 60, 0.69, true],
      [51, 38, 42, -26, 0.57],
      [40, 64, 59, 34, 0.78],
      [78, 82, 31, -10, 0.4, true],
    ],
    strings: [
      [[19, 55, 102]],
      [
        [27, 4, 212, true],
        [75, 65, 142],
      ],
    ],
    stars: 7,
  },
  progression: {
    vines: [
      "M-20-35C26 70 246 201 163 307S0 427 95 560S176 722 75 839S155 1003 265 1060",
      "M-25 135C38 350 187 470 110 621S12 852-20 1010",
    ],
    left: [
      [56, 17, 48, -24, 0.66, true],
      [58, 38, 36, 61, 0.5],
      [55, 61, 55, 22, 0.8],
      [34, 85, 37, -30, 0.45, true],
    ],
    right: [[40, 51, 32, 57, 0.29]],
    strings: [
      [
        [23, 4, 195, true],
        [75, 59, 162],
      ],
      [[19, 70, 123]],
    ],
    stars: 7,
  },
  companion: {
    vines: [
      "M-20 85C149 183 17 390 76 520S-15 784 98 1000",
      "M-25-20C161 124 242 205 143 346S13 579 83 704S244 867 259 1040",
    ],
    left: [[24, 26, 32, 41, 0.3, true]],
    right: [
      [57, 19, 43, 46, 0.58, true],
      [49, 41, 57, -25, 0.88],
      [31, 63, 39, 61, 0.51],
      [83, 84, 51, -18, 0.76, true],
    ],
    strings: [
      [[20, 64, 133]],
      [
        [19, 5, 198, true],
        [66, 43, 183],
      ],
    ],
    lantern: [["right", 22, 48, 40]],
    stars: 10,
  },
  planning: {
    vines: [
      "M-10-20C151 131 25 287 119 424S11 685 104 783S182 959 271 1040",
      "M-25 190C47 240 151 372 98 535S15 822 45 1050",
    ],
    left: [
      [42, 23, 36, 68, 0.45, true],
      [41, 47, 53, -22, 0.65],
      [57, 79, 43, 27, 0.59, true],
    ],
    right: [[27, 64, 33, -12, 0.28]],
    strings: [
      [
        [17, 8, 216, true],
        [69, 63, 154],
      ],
      [[19, 16, 114]],
    ],
    stars: 5,
  },
  together: {
    vines: [
      "M-20-30C49 131 178 179 108 346S4 689 179 790S147 956 252 1040",
      "M-20-35C50 129 236 195 135 355S0 657 189 774S206 946 264 1040",
    ],
    left: [
      [39, 21, 44, 41, 0.55, true],
      [37, 54, 37, -21, 0.46],
      [58, 78, 45, 28, 0.63],
    ],
    right: [
      [54, 26, 37, 58, 0.43],
      [33, 57, 49, -27, 0.64, true],
      [74, 83, 37, 13, 0.46],
    ],
    strings: [[[18, 47, 136, true]], [[25, 10, 178, true]]],
    stars: 7,
  },
  finale: {
    vines: [
      "M-20-30C122 91 19 322 127 459S221 582 172 728S64 909 258 1040",
      "M-20-40C169 101 29 263 130 394S233 584 141 745S235 986 268 1040",
    ],
    left: [
      [26, 17, 49, 63, 0.73, true],
      [46, 40, 41, -16, 0.58],
      [64, 63, 57, 34, 0.84, true],
      [47, 88, 32, -28, 0.42],
    ],
    right: [
      [38, 18, 45, -19, 0.71, true],
      [49, 43, 59, 33, 0.83],
      [60, 73, 44, -26, 0.63, true],
      [80, 88, 29, 34, 0.42],
    ],
    strings: [
      [
        [23, 4, 222, true],
        [76, 56, 163],
      ],
      [
        [20, 6, 196, true],
        [76, 46, 221],
      ],
    ],
    lantern: [["right", 22, 25, 44]],
    stars: 11,
  },
  footer: {
    vines: [
      "M-15-80C34 91 179 400 110 651S207 937 268 1090",
      "M-20-20C132 227 233 309 144 575S135 914 240 1040",
    ],
    left: [
      [43, 28, 34, 39, 0.38, true],
      [45, 68, 30, -28, 0.26],
    ],
    right: [[46, 47, 40, 22, 0.42, true]],
    strings: [[[20, 4, 153, true]], [[28, 10, 182, true]]],
    stars: 4,
  },
};

// A small hand-spaced vocabulary, offset for each section (never tiled).
const starSites = [
  [14, 12],
  [78, 19],
  [42, 34],
  [91, 47],
  [20, 65],
  [64, 83],
  [36, 92],
  [88, 8],
  [58, 57],
  [11, 79],
  [77, 38],
  [47, 71],
  [29, 51],
  [85, 93],
];
const dotSites = [
  [7, 15],
  [34, 29],
  [84, 44],
  [18, 59],
  [62, 76],
  [91, 89],
  [55, 7],
  [11, 37],
  [43, 56],
  [73, 93],
  [28, 86],
  [89, 25],
];
const variants = Object.keys(compositions) as Variant[];
// Auth borrows the landing's closing foliage, with its ornaments kept inside the island.
const authComposition: Composition = {
  ...compositions.finale,
  strings: [[], []],
  lantern: undefined,
  stars: 0,
};
function vars(values: Record<string, number | string>): CSSProperties {
  return values as CSSProperties;
}

export default function CelestialDecor({ variant }: { variant: Variant | "auth" }) {
  const scene = variant === "auth" ? authComposition : compositions[variant];
  const sectionIndex = variant === "auth" ? variants.length : variants.indexOf(variant);
  return (
    <div
      className={styles.world}
      data-celestial-decor={variant}
      data-active="false"
      aria-hidden="true"
    >
      {(["left", "right"] as const).map((side, sideIndex) => (
        <div key={side} className={styles.lane} data-side={side}>
          <svg
            className={styles.vines}
            viewBox="0 0 260 1000"
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
            data-depth="mid"
          >
            <path d={scene.vines[sideIndex]} />
            <path
              d={scene.vines[sideIndex]}
              transform="translate(-12 22)"
              className={styles.ghostVine}
            />
          </svg>
          {scene[side].map(([x, y, size, angle, opacity, keep], i) => (
            <span
              key={`leaf-${i}`}
              className={styles.leaf}
              data-keep={keep || undefined}
              data-depth={i % 3 === 0 ? "mid" : "near"}
              style={vars({
                "--x": `${x}%`,
                "--y": `${y}%`,
                "--size": `${size}px`,
                "--angle": `${angle}deg`,
                "--opacity": opacity,
                "--delay": `${-i * 3.7 - sectionIndex}s`,
              })}
            >
              <CelestialLeaf
                className={i % 3 === 1 ? styles.driftingLeaf : undefined}
              />
            </span>
          ))}
          {scene.strings[sideIndex].map(([x, y, length, keep], i) => (
            <span
              key={`string-${i}`}
              className={styles.string}
              data-keep={keep || undefined}
              data-depth="far"
              style={vars({
                "--x": `${x}%`,
                "--y": `${y}%`,
                "--length": `${length}px`,
              })}
            >
              <i />
              <CelestialStar className={styles.stringStar} />
            </span>
          ))}
          {scene.lantern
            ?.filter(([edge]) => edge === side)
            .map(([, x, y, size], i) => (
              <span
                key={`lantern-${i}`}
                className={styles.lantern}
                data-depth="near"
                style={vars({
                  "--x": `${x}%`,
                  "--y": `${y}%`,
                  "--size": `${size}px`,
                  "--delay": `${-i * 7 - sectionIndex}s`,
                })}
              >
                <CelestialLantern />
              </span>
            ))}
          {scene.books && side === "left" && (
            <CelestialBooks className={styles.books} />
          )}
          {Array.from({ length: scene.stars }, (_, i) => {
            const [x, y] =
              starSites[
                (i + sectionIndex * 3 + sideIndex * 5) % starSites.length
              ];
            return (
              <span
                key={`star-${i}`}
                className={styles.star}
                data-keep={i < 2 || undefined}
                data-depth="far"
                style={vars({
                  "--x": `${x}%`,
                  "--y": `${y}%`,
                  "--size": `${i % 4 === 0 ? 11 : 5 + (i % 3)}px`,
                  "--opacity": i % 4 === 0 ? 0.8 : 0.47,
                })}
              >
                <CelestialStar />
              </span>
            );
          })}
          {dotSites.slice(0, variant === "hero" ? 12 : 6).map(([x, y], i) => (
            <i
              key={`dot-${i}`}
              className={styles.dot}
              data-depth="far"
              style={vars({
                "--x": `${((x + sectionIndex * 17) % 92) + 4}%`,
                "--y": `${((y + sectionIndex * 13 + sideIndex * 7) % 94) + 3}%`,
                "--opacity": i % 3 === 0 ? 0.58 : 0.3,
              })}
            />
          ))}
        </div>
      ))}
      {variant === "hero" && (
        <div className={styles.distantStars} data-depth="far">
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
      )}
    </div>
  );
}

/** One observer and input-driven RAF for the whole world, no animation loop or React scroll state. */
export function CelestialWorld({
  root,
  paused,
}: {
  root: RefObject<HTMLDivElement | null>;
  paused: boolean;
}) {
  useEffect(() => {
    const layers = [
      ...(root.current?.querySelectorAll<HTMLElement>(
        "[data-celestial-decor]"
      ) ?? []),
    ];
    if (!layers.length) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const visible = new Set<HTMLElement>();
    const centers = new Map<HTMLElement, number>();
    const written = new Map<HTMLElement, { active: string; drift: string }>();
    let needsMeasure = true;
    let frame = 0;
    const enabled = () => !paused && !reduced.matches && !document.hidden;
    const paint = () => {
      frame = 0;
      const parallax = enabled() && window.innerWidth > 900;
      // Read all geometry together, only after layout/viewport changes. Reading
      // a rectangle after writing inherited styles forces a style/layout flush.
      if (needsMeasure) {
        const scrollY = window.scrollY;
        for (const layer of layers) {
          const bounds = layer.getBoundingClientRect();
          centers.set(layer, bounds.top + scrollY + bounds.height / 2);
        }
        needsMeasure = false;
      }
      const readingCenter = window.scrollY + window.innerHeight / 2;
      for (const layer of layers) {
        const on = enabled() && visible.has(layer);
        const active = String(on);
        // The 24px range is spread over a full screen: movement is barely perceptible.
        const drift =
          parallax && on
            ? Math.max(
                -12,
                Math.min(12, (readingCenter - centers.get(layer)!) * 0.012)
              )
            : 0;
        const value = `${drift.toFixed(2)}px`;
        const previous = written.get(layer);
        if (previous?.active !== active) layer.dataset.active = active;
        if (previous?.drift !== value)
          layer.style.setProperty("--decor-drift", value);
        written.set(layer, { active, drift: value });
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const scrolled = () => {
      if (enabled() && window.innerWidth > 900 && visible.size) schedule();
    };
    const resized = () => {
      needsMeasure = true;
      schedule();
    };
    const observer =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            (entries) => {
              for (const entry of entries)
                entry.isIntersecting
                  ? visible.add(entry.target as HTMLElement)
                  : visible.delete(entry.target as HTMLElement);
              schedule();
            },
            { rootMargin: "120px 0px" }
          )
        : null;
    for (const layer of layers) observer?.observe(layer);
    const layoutObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(resized)
        : null;
    if (root.current) layoutObserver?.observe(root.current);
    window.addEventListener("scroll", scrolled, { passive: true });
    window.addEventListener("resize", resized);
    document.addEventListener("visibilitychange", schedule);
    reduced.addEventListener("change", schedule);
    paint();
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      layoutObserver?.disconnect();
      window.removeEventListener("scroll", scrolled);
      window.removeEventListener("resize", resized);
      document.removeEventListener("visibilitychange", schedule);
      reduced.removeEventListener("change", schedule);
      for (const layer of layers) {
        layer.dataset.active = "false";
        layer.style.removeProperty("--decor-drift");
      }
    };
  }, [root, paused]);
  return null;
}
