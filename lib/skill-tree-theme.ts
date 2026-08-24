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
 * Grander, larger proportions ($R_{outer} = 48$, $R_{inner} = 22$).
 * Centered at (0, 0).
 */
export function getApexCelestialStarPath(
  outerRadius: number = 48,
  innerRadius: number = 22
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
  outerRadius: number = 48,
  innerRadius: number = 22
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
 * Generates an organic, undulating wavy whirlwind mana stream path.
 * side: 'left' | 'right'
 * phaseOffset: number (0 to Math.PI*2)
 * waveAmp: amplitude of the wavy undulation (e.g. 24px)
 * waveFreq: number of full wave cycles (e.g. 3.5)
 */
export function getWhirlwindManaPath(
  side: "left" | "right",
  phaseOffset: number = 0,
  waveAmp: number = 22,
  waveFreq: number = 3.5
): string {
  const isRight = side === "right";
  const numSteps = 36;
  const points: [number, number][] = [];

  for (let i = 0; i <= numSteps; i++) {
    const t = i / numSteps; // 0 (bottom) to 1 (top)
    const y = 1100 - t * 1060; // 1100 -> 40

    // Smooth envelope width: starts at 50, expands to ~455 around t=0.35-0.5, then tapers to 24 at apex
    const baseW = 455 * Math.sin(Math.PI * Math.pow(t, 0.82)) + 45 * (1 - t);

    // Sinusoidal whirlwind / spiral oscillation
    const wave = waveAmp * Math.sin(t * waveFreq * Math.PI * 2 + phaseOffset) * Math.sin(Math.PI * t);

    const totalXOffset = baseW + wave;
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
