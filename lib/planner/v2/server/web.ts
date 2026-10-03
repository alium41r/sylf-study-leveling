import "server-only";
import { getApplicationPool } from "../../../prisma";
import { PlannerDatabase } from "./database";
import { IntentService } from "./intents";
import { AttemptService } from "./attempts";
import { RevisionService } from "./revisions";
import { ApplyService } from "./apply";
import { SessionService } from "./sessions";
import { WorkspaceService } from "./workspace";
import { AdoptionService } from "./adoption";
import { reject } from "./database";

/** Protocol opt-in uses the same routes and services. Legacy requests cannot
 * mutate adopted Plans; deployment flags never weaken execution protection. */
export function isDurablePlannerRequest(request: Request): boolean {
  return request.headers.get("x-sylf-planner-contract") === "2" || new URL(request.url).searchParams.get("contractVersion") === "2";
}
export function requireDurablePlannerAdmission(): void {
  if (process.env.PLANNER_V2_DURABLE_CORE_ENABLED !== "true") reject("WORKER_UNAVAILABLE", "Planner V2 is not enabled in this deployment.");
}

export function durablePlanner() {
  const db = new PlannerDatabase(getApplicationPool());
  const attempts = new AttemptService(db);
  return { db, intents: new IntentService(db), attempts, revisions: new RevisionService(attempts), apply: new ApplyService(db), sessions: new SessionService(db), workspace: new WorkspaceService(db),
    adoption: new AdoptionService(db, process.env.PLANNER_V2_DURABLE_CORE_ENABLED === "true") };
}
