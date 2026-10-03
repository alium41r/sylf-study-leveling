import { PlannerValidationError } from "@/lib/planner/errors";

/**
 * Runs `action` and reports the planner validation code it failed with, or `null`
 * when it succeeded. Keeps the deterministic-rule assertions in the mastery suite
 * readable: each rule is asserted by its own code rather than by a thrown string.
 */
export function failureCodeOf(action: () => unknown): string | null {
  try {
    action();
    return null;
  } catch (error) {
    if (error instanceof PlannerValidationError) return error.message;
    throw error;
  }
}
