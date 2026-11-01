import {
  blueprintFixture,
  changeSetFixture,
  successfulAttemptFixture,
  workspaceFixture,
  intentFixture,
} from "../contracts/fixtures";
import { naturalText } from "../intelligence/natural-learning-fixture";
import type { StudentWorkspace } from "@/lib/planner/v2/client/workspace";
export function studentFixture(
  mode: "READY" | "DRAFT" | "CLARIFY" | "RESEARCH" = "READY"
): StudentWorkspace {
  const workspace = workspaceFixture(),
    attempt = successfulAttemptFixture();
  attempt.budget.executionDeadlineAt=new Date(Date.now()+3600000).toISOString();
  const intent = { ...intentFixture(), policy: "GENERAL" as const };
  if (mode !== "READY") {
    workspace.phase = "READY";
    workspace.nextAction = "GENERATE";
    workspace.allowedActions = ["GENERATE"];
    workspace.candidate = null;
    attempt.state = "FAILED";
    attempt.stage = "REVIEW";
  }
  if (mode === "CLARIFY") {
    attempt.state = "NEEDS_DECISION";
    attempt.stage = "RESEARCH";
    workspace.phase = "NEEDS_DECISION";
    workspace.nextAction = "ANSWER";
    workspace.allowedActions = ["ANSWER"];
  }
  if (mode === "RESEARCH") {
    attempt.state = "RUNNING";
    attempt.stage = "RESEARCH";
    workspace.phase = "PLANNING";
    workspace.nextAction = "WAIT";
    workspace.allowedActions = ["CANCEL"];
  }
  return {
    plan: {
      planId: workspace.planId,
      title: "Physics preparation",
      state: "DRAFT",
    },
    intent: { intentVersionId: workspace.workingIntentVersionId, intent },
    workspace,
    attempt,
    attemptHistory: [],
    conversation: {
      schemaVersion: 2,
      events: [],
      recommendations: [],
      omittedEvents: 0,
    },
    documents: [],
    research: {
      digest: "a".repeat(64),
      summary: {
        goals: "Explain and predict electricity in unfamiliar circuits.",
        weaknesses:
          "Student reports difficulty choosing a method; demonstrated ability remains unknown.",
        uncertainty: "Transfer to more complex circuits has not been checked.",
      },
      questions:
        mode === "CLARIFY"
          ? [
              {
                ref: "resource_access",
                question: "Can you access your teacher’s practice questions?",
                consequence: "Changes which resource we can schedule.",
              },
            ]
          : [],
    },
    draft:
      mode === "CLARIFY" || mode === "RESEARCH"
        ? null
        : {
            attemptId: attempt.attemptId,
            retainedFromEarlierAttempt: false,
            stage: mode === "READY" ? "READY" : "INCOMPLETE",
            reason:
              mode === "READY"
                ? "Reviewed candidate prepared for confirmation"
                : "The reviewer needs more evidence; this is an unapproved draft.",
            archiveDigest: "b".repeat(64),
            activitiesStrategyId: "11111111-0000-4000-8000-000000000000",
            activitiesStrategyVersion: 1,
            strategies: [
              {
                id: "11111111-0000-4000-8000-000000000000",
                version: 1,
                text: naturalText,
              },
            ],
            blueprints: [{ planRef: "plan_1", blueprint: blueprintFixture() }],
            allocation: {
              schemaVersion: 2,
              status: "FEASIBLE",
              placements: [],
              unscheduled: [],
              committedMinutes: 30,
              capacityProof: null,
              findings: [],
            },
            issues: [],
            reviews: [
              {
                id: "review_1",
                verdict: mode === "READY" ? "APPROVED" : "INCOMPLETE",
                explanation:
                  mode === "READY"
                    ? "Scripted review approved the exact result."
                    : "Independent transfer has not been established. Preserve this draft for manual inspection.",
              },
            ],
            history: [],
          },
    changeSet: mode === "READY" ? changeSetFixture() : null,
    usage: {
      inputTokens: 1200,
      outputTokens: 1900,
      reasoningTokens: 800,
      estimatedCostUsd: 0.0012,
      unknownCosts: 0,
      uncertain: false,
      calls: 5,
    },
  };
}
