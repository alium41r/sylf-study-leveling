import { useId } from "react";
import {
  CelestialBooks,
  CelestialLantern,
  CelestialLeaf,
} from "../landing/journey/CelestialMotifs";
import styles from "./StudyIsland.module.css";

type MotifProps = { className?: string };

/** Auth scenery is native geometry. The established companion is mounted separately. */
function Crystal({
  x,
  y,
  scale = 1,
}: {
  x: number;
  y: number;
  scale?: number;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path d="M0-25 13 0 0 28-12 0Z" fill="#5554cf" />
      <path d="M0-25 2 1-12 0Z" fill="#9e9bff" />
      <path d="M0-25 13 0 2 1Z" fill="#7274f5" />
      <path d="M-12 0 2 1 0 28Z" fill="#343791" />
      <path d="M2 1 13 0 0 28Z" fill="#b6adff" />
      <path
        d="m-10 0 12 1 9-1"
        fill="none"
        stroke="#e0d4ff"
        strokeWidth=".7"
        opacity=".6"
      />
    </g>
  );
}

function Leaf({
  x,
  y,
  rotate = 0,
  scale = 1,
}: {
  x: number;
  y: number;
  rotate?: number;
  scale?: number;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}>
      <svg width="66" height="35" x="0" y="-17">
        <CelestialLeaf />
      </svg>
    </g>
  );
}

/** A shared folded-leaf branch, used as island vegetation and as the canopy. */
export function Moonvine({ className }: MotifProps) {
  return (
    <svg
      viewBox="0 0 170 300"
      className={className}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M91 299C33 232 99 164 86 103C81 72 57 37 69 0M77 223C107 190 116 155 144 123M85 162C58 143 27 132 17 88M86 108C119 84 117 38 151 20"
        stroke="var(--island-vine, #6268bf)"
        strokeWidth="1.4"
      />
      <Leaf x={79} y={217} rotate={-42} scale={0.8} />
      <Leaf x={76} y={189} rotate={-151} scale={0.72} />
      <Leaf x={86} y={129} rotate={-144} scale={0.86} />
      <Leaf x={110} y={83} rotate={-47} scale={0.72} />
      <Leaf x={85} y={80} rotate={-136} scale={0.6} />
      <Leaf x={123} y={160} rotate={-56} scale={0.66} />
      <Leaf x={36} y={121} rotate={-129} scale={0.5} />
      <Leaf x={63} y={36} rotate={-67} scale={0.64} />
    </svg>
  );
}

export function HangingLantern({ className }: MotifProps) {
  return (
    <svg
      viewBox="0 0 100 280"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M50 0V143"
        stroke="var(--island-vine, #6268bf)"
        strokeWidth="1"
      />
      <path d="m50 52 3 5-3 5-3-5Z" fill="#b39ccd" />
      <g className={styles.lanternSwing}>
        <svg
          x="20"
          y="142"
          width="60"
          height="130"
          className={styles.lanternGlass}
        >
          <CelestialLantern />
        </svg>
      </g>
    </svg>
  );
}

export function Moon({ className }: MotifProps) {
  const id = useId();
  return (
    <svg
      viewBox="0 0 280 280"
      className={className}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id={`${id}-moonlight`}>
          <stop stopColor="#959bff" stopOpacity=".14" />
          <stop offset="1" stopColor="#959bff" stopOpacity="0" />
        </radialGradient>
        <linearGradient
          id={`${id}-moon`}
          x1="107"
          y1="76"
          x2="158"
          y2="185"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#fff3df" />
          <stop offset=".55" stopColor="#e5d7ff" />
          <stop offset="1" stopColor="#a8a4f9" />
        </linearGradient>
      </defs>
      <circle cx="140" cy="140" r="140" fill={`url(#${id}-moonlight)`} />
      <path
        d="M65 234A119 119 0 1 1 170 255"
        stroke="var(--island-orbit, #777ab7)"
        strokeOpacity=".34"
        strokeWidth=".8"
      />
      <path
        d="M34 160A108 108 0 0 1 160 34"
        stroke="var(--island-orbit, #777ab7)"
        strokeOpacity=".22"
        strokeWidth=".6"
      />
      <circle cx="47" cy="72" r="2.2" fill="#c7c5ff" />
      <path
        d="M149 83C119 94 104 120 111 146C119 177 151 191 178 175C155 178 134 163 129 141C123 116 131 98 149 83Z"
        fill={`url(#${id}-moon)`}
      />
      <path
        d="m149 83-24 48-14 15c-7-26 8-52 38-63Z"
        fill="#fff6ec"
        opacity=".55"
      />
      <path
        d="m111 146 25 15 16 22c-20-3-35-15-41-37Z"
        fill="#bcb0ed"
        opacity=".55"
      />
      <path d="m220 176 2 7 5 2-5 2-2 7-2-7-5-2 5-2Z" fill="#c1b4eb" />
    </svg>
  );
}

export function Sky({ className }: MotifProps) {
  const stars = [
    [92, 248, 2],
    [190, 142, 1],
    [273, 217, 1.5],
    [333, 100, 1],
    [711, 337, 1.8],
    [606, 83, 1.3],
    [90, 550, 1.3],
    [670, 660, 1.6],
    [539, 708, 1],
    [241, 658, 1],
    [471, 293, 1],
    [718, 197, 1],
  ];
  return (
    <svg
      viewBox="0 0 800 780"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <g className={styles.stars}>
        {stars.map(([x, y, r]) => (
          <circle
            key={`${x}-${y}`}
            cx={x}
            cy={y}
            r={r}
            fill="var(--island-starlight, #929bdd)"
          />
        ))}
      </g>
      <g className={styles.starsSlow} fill="var(--island-starlight, #b7b1e7)">
        <path d="m198 271 3 10 7 3-7 3-3 10-3-10-7-3 7-3Z" />
        <path d="m684 119 2 7 5 2-5 2-2 7-2-7-5-2 5-2Z" />
        <path d="m744 575 2 8 6 3-6 2-2 8-2-8-6-2 6-3Z" />
        <path d="m130 648 2 7 5 2-5 2-2 7-2-7-5-2 5-2Z" />
      </g>
    </svg>
  );
}

/** Rock landmarks from the original CelestialStudyArtwork, in its source coordinates. */
type RockPoint = readonly [number, number];
const ROCK = {
  a: [961.792, 599.531], b: [1017, 611.785], c: [1035.95, 614.361],
  d: [1026.08, 619.232], e: [1069.4, 627.64], f: [1096.2, 625.901],
  g: [1165.75, 639.563], h: [1225.41, 644.698], i: [1300.71, 633.746],
  j: [1360.64, 644.565], k: [1434.94, 632.909], l: [1430.09, 629.61],
  m: [1458.35, 629.078], n: [1498.73, 621.485], o: [1511.18, 619.833],
  p: [1551.53, 614.403], q: [1549.98, 611.78], r: [1592.17, 602.014],
  leftTip: [1036.53, 687.251], leftNotch: [1060.16, 659.805],
  secondTip: [1093.05, 700.641], secondNotch: [1121.94, 673.68],
  thirdTip: [1173.9, 740.798], thirdNotch: [1187.89, 724.944],
  centerShoulder: [1230.36, 774.909], quartzLeft: [1243.79, 790.465],
  tip: [1268.21, 833.352], quartzRight: [1292.46, 790.297],
  rightShoulder: [1313.04, 760.558], rightNotch: [1384.76, 684.978],
  fourthTip: [1415.34, 727.51], fourthNotch: [1466.42, 663.939],
  fifthTip: [1500.02, 698.733], fifthNotch: [1528.43, 651.242],
  rightTip: [1539.83, 669.579],
  centerFold: [1221.13, 733.437], rightFold: [1331.97, 708.016],
  sideFold: [1405.39, 713.237],
} as const satisfies Record<string, RockPoint>;
const r = ROCK;
const CAP_FRONT = [r.a, r.b, r.c, r.d, r.e, r.f, r.g, r.h, r.i,
  r.j, r.k, r.l, r.m, r.n, r.o, r.p, r.q, r.r];
const ROCK_FACES: { vertices: RockPoint[]; color: string }[] = [
  { vertices: [r.a, r.b, r.leftTip], color: "#2A3197" },
  { vertices: [r.b, r.c, r.d, r.leftNotch, r.leftTip], color: "#191E5E" },
  { vertices: [r.d, r.e, r.secondTip, r.leftNotch], color: "#21287C" },
  { vertices: [r.e, r.f, r.secondNotch, r.secondTip], color: "#191E5E" },
  { vertices: [r.f, r.g, r.centerFold, r.centerShoulder, r.thirdNotch, r.thirdTip, r.secondNotch], color: "#252C80" },
  { vertices: [r.g, r.h, r.centerFold], color: "#3437B1" },
  { vertices: [r.h, r.i, r.centerShoulder, r.centerFold], color: "#252C80" },
  { vertices: [r.i, r.j, r.rightFold], color: "#2A3197" },
  { vertices: [r.i, r.rightFold, r.rightShoulder, r.quartzRight, r.tip, r.quartzLeft, r.centerShoulder], color: "#3848C1" },
  { vertices: [r.j, r.k, r.rightNotch, r.rightShoulder, r.rightFold], color: "#21287C" },
  { vertices: [r.k, r.l, r.m, r.sideFold, r.rightNotch], color: "#191E5E" },
  { vertices: [r.m, r.n, r.fourthNotch, r.fourthTip, r.sideFold], color: "#2A3197" },
  { vertices: [r.n, r.o, r.fifthNotch, r.fifthTip, r.fourthNotch], color: "#253391" },
  { vertices: [r.o, r.p, r.fifthNotch], color: "#2A3197" },
  { vertices: [r.p, r.q, r.r, r.rightTip, r.fifthNotch], color: "#21287C" },
];
const ROCK_OUTLINE = [
  ...CAP_FRONT, r.rightTip, r.fifthNotch, r.fifthTip, r.fourthNotch,
  r.fourthTip, r.sideFold, r.rightNotch, r.rightShoulder, r.quartzRight,
  r.tip, r.quartzLeft, r.centerShoulder, r.thirdNotch, r.thirdTip,
  r.secondNotch, r.secondTip, r.leftNotch, r.leftTip,
];
const ROCK_SCALE = 663 / (r.r[0] - r.a[0]);
function scenePoint([x, y]: RockPoint, compact = false): RockPoint {
  const sceneY = 467 + (y - r.a[1]) * ROCK_SCALE;
  // All plateau landmarks remain fixed; only the lower hanging rock shortens on mobile.
  return [82 + (x - r.a[0]) * ROCK_SCALE,
    compact && sceneY > 515 ? 515 + (sceneY - 515) * 0.68 : sceneY];
}
const rockPoints = (vertices: readonly RockPoint[], compact = false) =>
  vertices.map((point) => scenePoint(point, compact).join(",")).join(" ");
const capFrontPoints = rockPoints(CAP_FRONT);
const capOutline = `82,467 218,433 355,424 498,433 682,456 ${
  rockPoints([...CAP_FRONT].reverse())}`;

function FloatingRock({ compact = false }: { compact?: boolean }) {
  const points = (vertices: readonly RockPoint[]) => rockPoints(vertices, compact);
  return (
    <g
      className={compact ? styles.compactRock : styles.fullRock}
      data-rock-geometry={compact ? "compact" : "full"}
    >
      <polygon points={points(ROCK_OUTLINE)} fill="#252C80" data-rock-outline="true" />
      {ROCK_FACES.map(({ vertices, color }, index) => (
        <polygon
          key={index}
          points={points(vertices)}
          fill={color}
          stroke={color}
          strokeWidth=".4"
          strokeLinejoin="round"
          data-rock-face="true"
        />
      ))}
      {/* The original quartz terminus is part of the island's silhouette. */}
      <polygon
        points={points([[1268.38, 745.908], r.quartzRight, r.tip, r.quartzLeft])}
        fill="#8B8FF5"
      />
      <polygon
        points={points([[1268.38, 745.908], [1267.96, 790.437], r.quartzLeft])}
        fill="#666FFE"
      />
      <polygon
        points={points([[1259.12, 817.74], [1276.37, 818.678], r.tip])}
        fill="#9FA1F9"
      />
    </g>
  );
}

export function IslandScenery() {
  const id = useId();
  const paint = (name: string) => `url(#${id}-${name})`;
  return (
    <svg
      viewBox="0 0 800 780"
      className={styles.islandSvg}
      fill="none"
      aria-hidden="true"
      focusable="false"
      data-island-scenery="true"
    >
      <defs>
        <clipPath id={`${id}-cap-clip`}>
          <polygon points={capOutline} />
        </clipPath>
        <radialGradient id={`${id}-contact-shadow`}>
          <stop stopColor="#282655" stopOpacity=".5" />
          <stop offset=".55" stopColor="#282655" stopOpacity=".3" />
          <stop offset="1" stopColor="#282655" stopOpacity="0" />
        </radialGradient>
        <linearGradient
          id={`${id}-rim`}
          x1="154"
          y1="490"
          x2="692"
          y2="494"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#7c7ad2" />
          <stop offset=".52" stopColor="#c7baff" />
          <stop offset="1" stopColor="#7079d6" />
        </linearGradient>
        <radialGradient id={`${id}-lamplight`}>
          <stop stopColor="#e1c4ff" stopOpacity=".58" />
          <stop offset=".45" stopColor="#a8a1ff" stopOpacity=".23" />
          <stop offset="1" stopColor="#aaa7ff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-haze`}>
          <stop stopColor="#7770df" stopOpacity=".12" />
          <stop offset="1" stopColor="#7770df" stopOpacity="0" />
        </radialGradient>
        <linearGradient
          id={`${id}-metal`}
          x1="616"
          y1="324"
          x2="669"
          y2="478"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#eed0b4" />
          <stop offset=".45" stopColor="#aa819e" />
          <stop offset="1" stopColor="#685774" />
        </linearGradient>
      </defs>
      <ellipse
        className={styles.underlight}
        cx="425"
        cy="639"
        rx="290"
        ry="110"
        fill={paint("haze")}
      />
      <path
        d="M145 436C9 474 61 531 427 532C716 533 827 480 701 447"
        stroke="var(--island-orbit, #777ab7)"
        strokeWidth="1"
        strokeOpacity=".25"
      />
      <g className={styles.islandDepth}>
        <g className={styles.crystals}>
          <Crystal x={244} y={605} scale={1.3} />
          <Crystal x={292} y={659} scale={0.9} />
          <Crystal x={495} y={668} scale={1} />
          <Crystal x={611} y={603} scale={1.2} />
        </g>
      </g>
      <FloatingRock />
      <FloatingRock compact />
      <polygon points={capOutline} fill="#7471F3" />
      <g clipPath={paint("cap-clip")}>
        <path
          d="M82 467 218 433 351 462 244 479Z"
          fill="#a49be6"
          opacity=".45"
        />
        <path
          d="M218 433 355 424 498 433 528 461 351 462Z"
          fill="#aba0e9"
          opacity=".22"
        />
        <path
          d="M498 433 682 456 528 461Z"
          fill="#ded0fa"
          opacity=".12"
        />
        <path
          d="M745 483 662 493 500 518 528 461Z"
          fill="#3d3b87"
          opacity=".3"
        />
        <path
          d="M166 497 244 479 351 462 454 488 412 531 319 521 232 509Z"
          fill="#a498e4"
          opacity=".25"
        />
        <path d="M351 462 528 461 454 488Z" fill="#c6b5ef" opacity=".18" />
      </g>
      <polyline
        points={capFrontPoints}
        stroke={paint("rim")}
        strokeWidth=".65"
        opacity=".35"
        strokeLinejoin="round"
      />
      <ellipse
        cx="531"
        cy="459"
        rx="143"
        ry="51"
        fill={paint("lamplight")}
        className={styles.lampPool}
      />
      <ellipse
        cx="447"
        cy="477"
        rx="89"
        ry="16"
        fill={paint("contact-shadow")}
      />
      <ellipse
        cx="258"
        cy="478"
        rx="80"
        ry="12"
        fill={paint("contact-shadow")}
      />
      <ellipse
        cx="636"
        cy="476"
        rx="44"
        ry="9"
        fill={paint("contact-shadow")}
      />
      <g className={styles.plantLeft}>
        <path
          d="M207 456C189 423 175 390 182 348C187 319 174 304 159 290M184 382C148 366 146 348 131 334M189 416C219 395 224 364 246 352"
          stroke="#727cca"
          strokeWidth="2"
        />
        <Leaf x={185} y={368} rotate={-145} scale={0.82} />
        <Leaf x={188} y={400} rotate={-40} scale={0.74} />
        <Leaf x={182} y={346} rotate={-53} scale={0.8} />
        <Leaf x={206} y={390} rotate={-49} scale={0.66} />
        <Leaf x={185} y={433} rotate={-163} scale={0.57} />
        <Leaf x={174} y={309} rotate={-141} scale={0.7} />
      </g>
      <g className={styles.plantRight}>
        <path
          d="M676 463C657 426 691 406 701 366M675 427C655 414 651 399 646 391"
          stroke="#717acf"
          strokeWidth="1.8"
        />
        <Leaf x={679} y={414} rotate={-28} scale={0.66} />
        <Leaf x={690} y={394} rotate={-52} scale={0.86} />
        <Leaf x={670} y={433} rotate={-147} scale={0.56} />
        <Leaf x={679} y={451} rotate={-9} scale={0.48} />
      </g>
      <svg x="208" y="367" width="142" height="117">
        <CelestialBooks />
      </svg>
      <g transform="translate(342 449)">
        <ellipse cx="22" cy="35" rx="31" ry="6" fill="#37316e" opacity=".5" />
        <path d="M37 7C59 3 60 30 39 27" stroke="#373277" strokeWidth="7" />
        <path d="M0 0H43L40 27C35 41 6 41 3 27Z" fill="#353075" />
        <path
          d="M2 4 5 27C7 32 10 34 14 34L11 4Z"
          fill="#6255b9"
          opacity=".55"
        />
        <ellipse cx="21.5" cy="1" rx="21.5" ry="5" fill="#c6b9e9" />
        <ellipse cx="21.5" cy="2" rx="17" ry="2.7" fill="#73618a" />
        <path
          d="M22 10C11 12 11 25 21 27C25 28 29 25 30 22C22 26 15 18 22 10Z"
          fill="#f5e8ec"
        />
        <g
          className={styles.steam}
          stroke="#b8b7ed"
          strokeWidth="2"
          strokeLinecap="round"
          opacity=".5"
        >
          <path d="M15-9C1-23 29-25 17-42" />
          <path d="M27-12C43-29 18-32 30-52" opacity=".5" />
        </g>
      </g>
      <ellipse cx="651" cy="478" rx="14" ry="4" fill="#9b83b3" />
      <path
        d="M654 477C649 450 655 407 653 378C651 341 617 325 604 343C591 361 620 371 622 355"
        stroke={paint("metal")}
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path d="M646 477H662L657 463H651Z" fill="#655574" />
      <path d="M609 362V375" stroke="#c5a4b5" strokeWidth="1.5" />
      <ellipse
        cx="610"
        cy="420"
        rx="79"
        ry="82"
        fill={paint("lamplight")}
        className={styles.lampPool}
      />
      <svg
        x="580"
        y="366"
        width="60"
        height="111"
        className={styles.lanternGlass}
      >
        <CelestialLantern />
      </svg>
      <path d="m555 491 10-5 12 2 3 5-15 3Z" fill="#a59ae0" />
      <path d="m162 476 11-4 11 4-6 3Z" fill="#c0b0ed" />
      <path d="m697 482 9-7 12 3-6 5Z" fill="#9993df" />
      <g className={styles.fireflies} fill="#e6d4ff">
        <circle cx="302" cy="355" r="2" />
        <circle cx="567" cy="312" r="1.6" />
        <circle cx="106" cy="418" r="1.5" />
        <circle cx="727" cy="442" r="1.8" />
      </g>
    </svg>
  );
}
