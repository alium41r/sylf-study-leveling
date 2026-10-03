export class PlannerError extends Error {
  constructor(
    public status: 400 | 401 | 404 | 409 | 422 | 429 | 503,
    public code: string,
    /**
     * An optional bounded payload the surface needs in order to act.
     *
     * One case needs it: a flexible draft edit that only needs the student's
     * acknowledgement answers with the findings it raised, because the *point* of the
     * refusal is that the client could not have known which tradeoffs it was making.
     * The payload is content-free apart from code names, unit labels and one sentence
     * per finding — never a snapshot. `plannerRoute` forwards it under `findings`;
     * nothing else in the planner reads it.
     */
    public details?: Record<string, unknown>
  ) {
    super(code);
  }
}
export function plannerConflict(): never { throw new PlannerError(409, "PLANNER_REVIEW_REQUIRED"); }
export class PlannerValidationError extends Error {}
