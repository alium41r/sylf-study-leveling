/**
 * Celestial Skill Tree Theme & Geometry Definitions
 * Replicates the ethereal celestial sunburst/medallion design from the target spec.
 */

export interface TierVisualTheme {
  tier: number;
  name: string;
  accent: string;
  strokeLight: string;
  strokeDark: string;
  textLight: string;
  textDark: string;
  fillLightStart: string;
  fillLightEnd: string;
  fillDarkStart: string;
  fillDarkEnd: string;
  glowColor: string;
}

export const TIER_THEMES: Record<number, TierVisualTheme> = {
  // Tier 1: Foundation Root (#01) — Radiant Sun Gold
  1: {
    tier: 1,
    name: "Root Foundation",
    accent: "#F59E0B",
    strokeLight: "#D97706",
    strokeDark: "#FBBF24",
    textLight: "#B45309",
    textDark: "#FDE68A",
    fillLightStart: "#FFFBEB",
    fillLightEnd: "#FEF3C7",
    fillDarkStart: "#451A03",
    fillDarkEnd: "#78350F",
    glowColor: "rgba(245, 158, 11, 0.45)",
  },
  // Tier 2: Trunks (#02-#04) — Warm Peach / Apricot
  2: {
    tier: 2,
    name: "Trunk Branches",
    accent: "#F97316",
    strokeLight: "#EA580C",
    strokeDark: "#FB923C",
    textLight: "#C2410C",
    textDark: "#FED7AA",
    fillLightStart: "#FFF7ED",
    fillLightEnd: "#FFEDD5",
    fillDarkStart: "#431407",
    fillDarkEnd: "#7C2D12",
    glowColor: "rgba(249, 115, 22, 0.4)",
  },
  // Tier 3: Branch Subdivision (#05-#10) — Coral Salmon
  3: {
    tier: 3,
    name: "Sub-Branches",
    accent: "#FB923C",
    strokeLight: "#F97316",
    strokeDark: "#FDBA74",
    textLight: "#C2410C",
    textDark: "#FFEDD5",
    fillLightStart: "#FFF7ED",
    fillLightEnd: "#FED7AA",
    fillDarkStart: "#431407",
    fillDarkEnd: "#9A3412",
    glowColor: "rgba(251, 146, 60, 0.4)",
  },
  // Tier 4: Widest Spread (#11-#18) — Salmon / Rose Gold
  4: {
    tier: 4,
    name: "Pathway Nodes",
    accent: "#F43F5E",
    strokeLight: "#E11D48",
    strokeDark: "#FB7185",
    textLight: "#BE123C",
    textDark: "#FECDD3",
    fillLightStart: "#FFF1F2",
    fillLightEnd: "#FFE4E6",
    fillDarkStart: "#4C0519",
    fillDarkEnd: "#881337",
    glowColor: "rgba(244, 63, 94, 0.4)",
  },
  // Tier 5: Mid-Keystones (#19-#24) — Raspberry Rose
  5: {
    tier: 5,
    name: "Mid-Keystones",
    accent: "#E11D48",
    strokeLight: "#BE123C",
    strokeDark: "#F43F5E",
    textLight: "#9F1239",
    textDark: "#FDA4AF",
    fillLightStart: "#FFF1F2",
    fillLightEnd: "#FECDD3",
    fillDarkStart: "#4C0519",
    fillDarkEnd: "#9F1239",
    glowColor: "rgba(225, 29, 72, 0.4)",
  },
  // Tier 6: Specializations (#25-#32) — Orchid / Soft Magenta
  6: {
    tier: 6,
    name: "Specializations",
    accent: "#D946EF",
    strokeLight: "#C026D3",
    strokeDark: "#E879F9",
    textLight: "#A21CAF",
    textDark: "#F5D0FE",
    fillLightStart: "#FDF4FF",
    fillLightEnd: "#FAE8FF",
    fillDarkStart: "#4A044E",
    fillDarkEnd: "#86198F",
    glowColor: "rgba(217, 70, 239, 0.4)",
  },
  // Tier 7: Convergence (#33-#39) — Lilac Lavender
  7: {
    tier: 7,
    name: "Convergence",
    accent: "#A855F7",
    strokeLight: "#9333EA",
    strokeDark: "#C084FC",
    textLight: "#7E22CE",
    textDark: "#E9D5FF",
    fillLightStart: "#FAF5FF",
    fillLightEnd: "#F3E8FF",
    fillDarkStart: "#3B0764",
    fillDarkEnd: "#6B21A8",
    glowColor: "rgba(168, 85, 247, 0.4)",
  },
  // Tier 8: Upper Funnel (#40-#44) — Periwinkle / Royal Violet
  8: {
    tier: 8,
    name: "Upper Keystones",
    accent: "#818CF8",
    strokeLight: "#6366F1",
    strokeDark: "#A5B4FC",
    textLight: "#4F46E5",
    textDark: "#E0E7FF",
    fillLightStart: "#EEF2FF",
    fillLightEnd: "#E0E7FF",
    fillDarkStart: "#1E1B4B",
    fillDarkEnd: "#3730A3",
    glowColor: "rgba(129, 140, 248, 0.45)",
  },
  // Tier 9: Gate Convergence (#45-#47) — Deep Violet / Indigo
  9: {
    tier: 9,
    name: "Gate Nexus",
    accent: "#6366F1",
    strokeLight: "#4F46E5",
    strokeDark: "#818CF8",
    textLight: "#4338CA",
    textDark: "#C7D2FE",
    fillLightStart: "#EEF2FF",
    fillLightEnd: "#E0E7FF",
    fillDarkStart: "#1E1B4B",
    fillDarkEnd: "#4338CA",
    glowColor: "rgba(99, 102, 241, 0.5)",
  },
  // Tier 10: Apex Keystone — Luminous Celestial Violet
  10: {
    tier: 10,
    name: "Apex Keystone",
    accent: "#8B5CF6",
    strokeLight: "#7C3AED",
    strokeDark: "#A78BFA",
    textLight: "#6D28D9",
    textDark: "#DDD6FE",
    fillLightStart: "#F5F3FF",
    fillLightEnd: "#EDE9FE",
    fillDarkStart: "#2E1065",
    fillDarkEnd: "#5B21B6",
    glowColor: "rgba(139, 92, 246, 0.6)",
  },
};

export function getTierTheme(tier: number): TierVisualTheme {
  return TIER_THEMES[tier] || TIER_THEMES[1];
}

// ─── SVG PATH GENERATORS ─────────────────────────────────────────

/**
 * Generates an 8 or 12-point scalloped / sunburst notched medallion path.
 * Centered at (0, 0).
 */
export function getScallopedMedallionPath(
  baseRadius: number = 20,
  notches: number = 12,
  notchProtrusion: number = 2.8
): string {
  const points: [number, number][] = [];
  const totalSteps = notches * 2;
  const angleStep = (Math.PI * 2) / totalSteps;

  for (let i = 0; i < totalSteps; i++) {
    const angle = i * angleStep - Math.PI / 2;
    const r = i % 2 === 0 ? baseRadius + notchProtrusion : baseRadius;
    points.push([r * Math.cos(angle), r * Math.sin(angle)]);
  }

  let d = `M ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i][0].toFixed(2)} ${points[i][1].toFixed(2)}`;
  }
  d += " Z";
  return d;
}

/**
 * Generates an 8-point multifaceted grand celestial apex star path.
 * Grander, majestic proportions ($R_{outer} = 68$, $R_{inner} = 32$).
 * Centered at (0, 0).
 */
export function getApexCelestialStarPath(
  outerRadius: number = 68,
  innerRadius: number = 32
): string {
  const points: [number, number][] = [];
  for (let i = 0; i < 16; i++) {
    const angle = (i * Math.PI) / 8 - Math.PI / 2;
    let r = innerRadius;
    if (i % 4 === 0) {
      r = outerRadius;
    } else if (i % 2 === 0) {
      r = outerRadius * 0.84;
    } else {
      r = innerRadius;
    }
    points.push([r * Math.cos(angle), r * Math.sin(angle)]);
  }

  let d = `M ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i][0].toFixed(2)} ${points[i][1].toFixed(2)}`;
  }
  d += " Z";
  return d;
}

/**
 * Generates the faceted bevel lines inside the Apex Star.
 */
export function getApexStarFacetLines(
  outerRadius: number = 68,
  innerRadius: number = 32
): Array<{ x1: number; y1: number; x2: number; y2: number }> {
  const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  for (let i = 0; i < 16; i++) {
    const angle = (i * Math.PI) / 8 - Math.PI / 2;
    let r = innerRadius;
    if (i % 4 === 0) r = outerRadius;
    else if (i % 2 === 0) r = outerRadius * 0.84;
    lines.push({
      x1: 0,
      y1: 0,
      x2: r * Math.cos(angle),
      y2: r * Math.sin(angle),
    });
  }
  return lines;
}

/**
 * Generates an outer glowing ethereal corona star path for the grand Apex.
 * R_outer = 82, R_inner = 40.
 */
export function getApexCoronaStarPath(
  outerRadius: number = 82,
  innerRadius: number = 40
): string {
  const points: [number, number][] = [];
  for (let i = 0; i < 16; i++) {
    const angle = (i * Math.PI) / 8 - Math.PI / 2;
    let r = innerRadius;
    if (i % 4 === 0) {
      r = outerRadius;
    } else if (i % 2 === 0) {
      r = outerRadius * 0.85;
    } else {
      r = innerRadius;
    }
    points.push([r * Math.cos(angle), r * Math.sin(angle)]);
  }

  let d = `M ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i][0].toFixed(2)} ${points[i][1].toFixed(2)}`;
  }
  d += " Z";
  return d;
}

/**
 * Generates a 4-point diamond sparkle star (`✦`) path centered at (0, 0).
 */
export function getSparkleStarPath(size: number = 6): string {
  const outer = size;
  const inner = size * 0.25;
  const pts: [number, number][] = [
    [0, -outer],
    [inner, -inner],
    [outer, 0],
    [inner, inner],
    [0, outer],
    [-inner, inner],
    [-outer, 0],
    [-inner, -inner],
  ];
  return `M ${pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(" L ")} Z`;
}

/**
 * Symmetrical botanical laurel leaves path flanking Root #01.
 * Scaled and positioned around the $R=34$ medallion.
 */
export function getLaurelLeavesSVG(side: "left" | "right", color: string) {
  const flip = side === "right" ? -1 : 1;
  return {
    stem: `M ${-16 * flip} 22 Q ${-46 * flip} 12 ${-48 * flip} -10 Q ${-44 * flip} -30 ${-26 * flip} -38`,
    leaves: [
      { d: `M ${-22 * flip} 18 Q ${-34 * flip} 14 ${-32 * flip} 4 Q ${-24 * flip} 10 ${-22 * flip} 18 Z` },
      { d: `M ${-32 * flip} 8 Q ${-46 * flip} 4 ${-44 * flip} -6 Q ${-34 * flip} 0 ${-32 * flip} 8 Z` },
      { d: `M ${-42 * flip} -4 Q ${-54 * flip} -12 ${-50 * flip} -22 Q ${-40 * flip} -14 ${-42 * flip} -4 Z` },
      { d: `M ${-40 * flip} -18 Q ${-48 * flip} -28 ${-40 * flip} -36 Q ${-34 * flip} -26 ${-40 * flip} -18 Z` },
      { d: `M ${-30 * flip} -32 Q ${-34 * flip} -44 ${-24 * flip} -48 Q ${-22 * flip} -36 ${-30 * flip} -32 Z` },
    ],
  };
}

/**
 * Piecewise constellation envelope guide widths from root to apex.
 * Ensures the flow lines safely clear every node tier (especially Tier 9 nodes #45 and #47)
 * with a harmonious, balanced margin (~40-60px outside node rims).
 */
const CONSTELLATION_ENVELOPE: Array<[number, number]> = [
  [1120, 52],  // Below Root #01 (y=1100)
  [1100, 76],  // Root #01 clearance (clears laurels at ~48px)
  [990, 280],  // Tier 2: N2_1 / N2_3 (x=280/720, dist=220), margin = 60px
  [880, 385],  // Tier 3: N3_1 / N3_6 (x=180/820, dist=320), margin = 65px
  [770, 455],  // Tier 4: N4_1 / N4_8 (x=120/880, dist=380), margin = 75px
  [660, 420],  // Tier 5: N5_1 / N5_6 (x=180/820, dist=320), margin = 100px
  [550, 448],  // Tier 6: N6_1 / N6_8 (x=140/860, dist=360), margin = 88px
  [440, 410],  // Tier 7: N7_1 / N7_7 (x=180/820, dist=320), margin = 90px
  [330, 345],  // Tier 8: N8_1 / N8_5 (x=240/760, dist=260), margin = 85px
  [220, 260],  // Tier 9: N9_1 / N9_3 (x=320/680, dist=180), margin = 80px! (Clears #45 and #47 with ~58px margin)
  [150, 190],  // Graceful transition funnel between Tier 9 and Apex
  [100, 125],  // Apex level (y=100, star R_outer=68), margin = 57px outside star tips
  [50, 70],    // Spire lead-in
  [15, 26],    // Top needle tip
];

function getEnvelopeHalfWidth(y: number): number {
  if (y >= CONSTELLATION_ENVELOPE[0][0]) return CONSTELLATION_ENVELOPE[0][1];
  const last = CONSTELLATION_ENVELOPE[CONSTELLATION_ENVELOPE.length - 1];
  if (y <= last[0]) return last[1];

  for (let i = 0; i < CONSTELLATION_ENVELOPE.length - 1; i++) {
    const [y0, w0] = CONSTELLATION_ENVELOPE[i];
    const [y1, w1] = CONSTELLATION_ENVELOPE[i + 1];
    if (y <= y0 && y >= y1) {
      const u = (y0 - y) / (y0 - y1);
      const smoothU = u * u * (3 - 2 * u);
      return w0 + (w1 - w0) * smoothU;
    }
  }
  return 100;
}

/**
 * Generates an organic, undulating wavy whirlwind mana stream path.
 * Guaranteed to stay outside all node bounding boxes with proper breathing room.
 */
export function getWhirlwindManaPath(
  side: "left" | "right",
  phaseOffset: number = 0,
  waveAmp: number = 14,
  waveFreq: number = 3.2
): string {
  const isRight = side === "right";
  const numSteps = 54;
  const points: [number, number][] = [];

  for (let i = 0; i <= numSteps; i++) {
    const t = i / numSteps; // 0 (bottom) to 1 (top)
    const y = 1120 - t * 1105; // 1120 -> 15

    const baseW = getEnvelopeHalfWidth(y);

    // Sinusoidal whirlwind / spiral oscillation, dampening gently at apex and root
    const waveEnvelope = Math.sin(Math.PI * Math.min(1, Math.max(0, t)));
    const wave = waveAmp * Math.sin(t * waveFreq * Math.PI * 2 + phaseOffset) * waveEnvelope;

    const totalXOffset = Math.max(20, baseW + wave);
    const x = isRight ? 500 + totalXOffset : 500 - totalXOffset;
    points.push([x, y]);
  }

  // Convert points to smooth cubic bezier path using Catmull-Rom tangents
  let d = `M ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;

    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d;
}
