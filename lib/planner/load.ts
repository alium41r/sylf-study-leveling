/**
 * Coarse cognitive intensity for planner work — LOW, MEDIUM, HIGH.
 *
 * This is an ACADEMIC-WORKLOAD label for planning quality only. It is deliberately
 * derived, deterministic and planner-local:
 *
 * - It is a pure function of the item's own intent (and, for Mastery, its stage), so a
 *   stored revision can never carry an intensity that disagrees with its own items.
 *   Nothing is written to a Quest row.
 * - It never infers anything about the student. Minutes are not a proxy for ability,
 *   and this module has no notion of health, mood, motivation, disability or capacity.
 * - It is ADVISORY. Capacity in minutes stays authoritative: an intensity finding can
 *   never make a feasible plan infeasible, it only tells the planner (and the critic)
 *   that a day is academically unrealistic even though its minutes fit.
 */
export const COGNITIVE_INTENSITIES = ["LOW", "MEDIUM", "HIGH"] as const;
export type CognitiveIntensity = (typeof COGNITIVE_INTENSITIES)[number];

/**
 * Intent → intensity. Ordinary learning and normal practice are MEDIUM; light recall,
 * review and error organisation are LOW; dense, timed or assessment work is HIGH.
 */
export const INTENSITY_BY_INTENT: Record<string, CognitiveIntensity> = {
  LEARN: "MEDIUM",
  REVIEW: "LOW",
  RECALL: "LOW",
  PRACTICE: "MEDIUM",
  TIMED_PRACTICE: "HIGH",
  MISTAKE_REVIEW: "LOW",
  MOCK_EXAM: "HIGH",
  FINAL_REVIEW: "HIGH",
  ASSESS: "HIGH",
};

/**
 * A Mastery stage is more specific than the intent it pairs with, so it refines the
 * answer where the two disagree: a recall touch inside ACTIVE_RECALL is still light.
 */
export const INTENSITY_BY_MASTERY_STAGE: Record<string, CognitiveIntensity> = {
  UNDERSTAND: "MEDIUM",
  LEARN: "MEDIUM",
  ACTIVE_RECALL: "LOW",
  PRACTICE: "MEDIUM",
  REVIEW_MISTAKES: "LOW",
  MASTERY_CHECK: "HIGH",
};

export interface IntensityBearing {
  type: string;
  stage?: string | null;
  masteryStage?: string | null;
  date?: string;
  removed?: boolean;
}

/** Intensity from the intent alone, which is what every mode's items always carry. */
export function intensityFromIntent(intent: string): CognitiveIntensity {
  return INTENSITY_BY_INTENT[intent] ?? "MEDIUM";
}

/**
 * Intensity for one planner item. A Mastery stage wins over the intent because it is
 * the more precise statement of what the work is.
 */
export function intensityOf(item: IntensityBearing): CognitiveIntensity {
  const stage = item.masteryStage ?? item.stage ?? null;
  if (stage && stage in INTENSITY_BY_MASTERY_STAGE)
    return INTENSITY_BY_MASTERY_STAGE[stage];
  return intensityFromIntent(item.type);
}

export interface DayIntensity {
  date: string;
  counts: Record<CognitiveIntensity, number>;
  items: string[];
}

/** Intensity per date, for the planner and the review UI. Pure and bounded. */
export function intensityByDate(
  items: readonly IntensityBearing[]
): Map<string, DayIntensity> {
  const byDate = new Map<string, DayIntensity>();
  for (const item of items) {
    if (item.removed || !item.date) continue;
    const day = byDate.get(item.date) ?? {
      date: item.date,
      counts: { LOW: 0, MEDIUM: 0, HIGH: 0 },
      items: [],
    };
    day.counts[intensityOf(item)] += 1;
    day.items.push((item as { key?: string }).key ?? "");
    byDate.set(item.date, day);
  }
  return byDate;
}

export interface IntensityAdvisory {
  date: string;
  issueCode: "INTENSITY_SPIKE";
  /** HIGH when the day is a severe stack, LOW when it simply has no light work. */
  severity: "LOW" | "MEDIUM";
  itemKeys: string[];
  high: number;
  low: number;
  medium: number;
  instruction: string;
}

/**
 * Days whose academic rhythm is poor even though their minutes fit.
 *
 * Two rules, both advisory:
 * - three or more HIGH items on one date is a severe stack;
 * - a date made only of HIGH items (two or more) has nothing lighter to alternate
 *   with, which is the "HIGH + HIGH + HIGH" pattern the planner should avoid when an
 *   equivalent schedule exists.
 *
 * `HIGH + LOW` and `HIGH + MEDIUM` are deliberately never flagged: they are the
 * rhythms this exists to prefer.
 */
export function intensityAdvisories(
  items: readonly IntensityBearing[]
): IntensityAdvisory[] {
  const advisories: IntensityAdvisory[] = [];
  for (const day of intensityByDate(items).values()) {
    const total = day.counts.LOW + day.counts.MEDIUM + day.counts.HIGH;
    if (day.counts.HIGH >= 3)
      advisories.push({
        date: day.date,
        issueCode: "INTENSITY_SPIKE",
        severity: "MEDIUM",
        itemKeys: day.items,
        high: day.counts.HIGH,
        low: day.counts.LOW,
        medium: day.counts.MEDIUM,
        instruction:
          "This day stacks three or more demanding items; move one to a lighter day or make it lighter work.",
      });
    else if (day.counts.HIGH >= 2 && total === day.counts.HIGH)
      advisories.push({
        date: day.date,
        issueCode: "INTENSITY_SPIKE",
        severity: "LOW",
        itemKeys: day.items,
        high: day.counts.HIGH,
        low: day.counts.LOW,
        medium: day.counts.MEDIUM,
        instruction:
          "This day is entirely demanding work; alternating it with lighter recall or review would read better.",
      });
  }
  return advisories.filter((advisory) => advisory.itemKeys.length > 0);
}

/** The intensity mix of one day, for UI copy and quality metrics. */
export function dayIntensity(
  items: readonly IntensityBearing[]
): Record<CognitiveIntensity, number> {
  const counts: Record<CognitiveIntensity, number> = { LOW: 0, MEDIUM: 0, HIGH: 0 };
  for (const item of items) if (!item.removed) counts[intensityOf(item)] += 1;
  return counts;
}

export const COGNITIVE_INTENSITY_LABEL: Record<CognitiveIntensity, string> = {
  LOW: "Light",
  MEDIUM: "Standard",
  HIGH: "Demanding",
};
