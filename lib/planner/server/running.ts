import "server-only";

/**
 * In-process cancellation registry.
 *
 * One entry per plan: the durable operation row is always authoritative, and this
 * map only lets a same-process cancel abort the live provider request immediately.
 * Exam generation, roadmap generation and selected-period expansion all register
 * here, so a user can never start two expensive operations for one plan.
 */
const running = new Map<string, AbortController>();

export function registerRunning(planId: string, controller: AbortController) {
  running.set(planId, controller);
  return () => {
    if (running.get(planId) === controller) running.delete(planId);
  };
}

export function abortRunning(planId: string): boolean {
  const controller = running.get(planId);
  if (!controller) return false;
  controller.abort();
  return true;
}
