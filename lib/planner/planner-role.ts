import { z } from "zod";
import { PlannerValidationError } from "./errors";

/**
 * Planner-level planning roles: CORE and STRETCH.
 *
 * A role is a planning decision, not an educational one: CORE is the highest-value
 * work required to keep a plan on track, STRETCH is optional extra work that exists
 * only when safe capacity is left over. Two rules follow from that and are enforced
 * in code rather than by convention:
 *
 * 1. A plan's educational requirements must be satisfied by its CORE items alone
 *    (`assertCoreSufficient`). Work that a mode's own rules demand can never be
 *    labelled STRETCH, which is what stops "Stretch" from becoming a place to hide
 *    required work.
 * 2. STRETCH is never materialized by confirmation. It stays planner-owned optional
 *    work until the student explicitly promotes it, so optional work cannot turn into
 *    an overdue Quest merely because it was generated.
 *
 * Role is stored in versioned planner metadata only. Item rows keep their ordinary
 * shape; `role` is absent on every draft written before this existed, and an absent
 * role means CORE — the pre-existing behaviour.
 */
export const PLANNER_ROLES = ["CORE", "STRETCH"] as const;
export const PlannerRoleSchema = z.enum(PLANNER_ROLES);
export type PlannerRole = (typeof PLANNER_ROLES)[number];

/** A role rides the same planner metadata block as the mode-specific fields. */
export const plannerRoleMetadata = { role: PlannerRoleSchema.optional() } as const;

export interface RoleBearing {
  role?: PlannerRole;
  removed?: boolean;
}

export const isStretch = (item: RoleBearing): boolean => item.role === "STRETCH";
export const isCore = (item: RoleBearing): boolean => item.role !== "STRETCH";

/** Active items (nothing removed), which is the set a plan is judged on. */
export const coreItems = <T extends RoleBearing>(items: readonly T[]): T[] =>
  items.filter((item) => !item.removed && isCore(item));
export const stretchItems = <T extends RoleBearing>(items: readonly T[]): T[] =>
  items.filter((item) => !item.removed && isStretch(item));

export const PLANNER_ROLE_LABEL: Record<PlannerRole, string> = {
  CORE: "Core",
  STRETCH: "Stretch",
};

/** Copy the review UI shows, kept next to the rule it describes. */
export const PLANNER_ROLE_COPY = {
  CORE: "Required work. Skipping it puts the plan behind.",
  STRETCH:
    "Optional extra work. Sylf will not schedule it unless you ask for it.",
  PROMOTE: "Add this stretch work",
  PROMOTED: "Added to your schedule",
} as const;

/**
 * Optional work must not be able to hide required work.
 *
 * The mode's own rules are run twice: once over the whole draft (which is what the
 * existing validators already do) and once with every STRETCH item removed. A draft
 * whose CORE subset fails the mode's rules is rejected outright, so a student who
 * skips all Stretch work still holds a complete, valid plan.
 *
 * The error code stays exact, because the UI translates codes and the repair prompt
 * is given one; the rule the CORE subset actually missed rides along as `cause` for
 * diagnostics.
 */
export function assertCoreSufficient(
  items: readonly RoleBearing[],
  run: () => void
): void {
  if (!stretchItems(items).length) return;
  try {
    run();
  } catch (error) {
    const detail =
      error instanceof PlannerValidationError ? error.message : "MODE_RULES";
    const failure = new PlannerValidationError("STRETCH_NOT_OPTIONAL");
    (failure as { cause?: unknown }).cause = detail;
    throw failure;
  }
}

/** True when a core-sufficiency failure was reported, whatever its detail. */
export const isCoreSufficiencyFailure = (code: string | undefined): boolean =>
  code === "STRETCH_NOT_OPTIONAL";
