import type {
  CanonicalIntentV2,
  PlannerWorkspaceV2,
  PlannerAttemptV2,
  PlanChangeSetV2,
  LearningBlueprintV2,
} from "../contracts";
import type { PlannerConversation } from "../intelligence/schemas/conversation";
import type { FoundationArtifact } from "../intelligence/foundation/contracts";
import type { AllocationReport } from "../intelligence/schemas/scheduling";

export const LEGACY_STUDENT_RESOURCE_PROFILE = "student-preview-v1";
export const STUDENT_RESOURCE_PROFILE = "student-preview-v2";
export interface StudentReadiness {
  enabled: boolean;
  ready: boolean;
  reason: string | null;
  profile: string;
}
export interface StudentPlan {
  planId: string;
  title: string;
  state: string;
}
export interface StudentWorkspace {
  plan: StudentPlan;
  intent: { intentVersionId: string; intent: CanonicalIntentV2 };
  workspace: PlannerWorkspaceV2;
  conversation: PlannerConversation;
  documents: { documentId: string; title: string }[];
  attempt: PlannerAttemptV2 | null;
  attemptHistory: { attemptId: string; state: string; at: string }[];
  research: {
    digest: string;
    foundationDigest?: string;
    summary: Record<string, string> | null;
    questions: { ref: string; question: string; consequence: string }[];
  } | null;
  draft: {
    attemptId: string;
    retainedFromEarlierAttempt: boolean;
    stage: string;
    reason: string;
    archiveDigest: string;
    activitiesStrategyId: string | null;
    activitiesStrategyVersion: number | null;
    strategies: { id: string; version: number; text: string }[];
    blueprints: { planRef: string; blueprint: LearningBlueprintV2 }[];
    allocation: AllocationReport | null;
    issues: Extract<FoundationArtifact, { kind: "ISSUE" }>["value"][];
    reviews: { id: string; verdict: string; explanation: string }[];
    history: { id: string; kind: string; label: string }[];
  } | null;
  changeSet: PlanChangeSetV2 | null;
  usage: {
    inputTokens: number;
    outputTokens: number;
    reasoningTokens: number | null;
    estimatedCostUsd: number;
    unknownCosts: number;
    uncertain: boolean;
    calls: number;
  } | null;
}
export const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
/** User schedule stores Sunday=0, canonical Planner windows store Monday=0. */
export const plannerRestDays = (days: readonly number[]) =>
  days.map((day) => (day + 6) % 7);
export const STUDENT_SPENDING_LIMIT_USD = 1.75;

/** Read-only presentation of actual work; never approval or execution input. */
export interface PlannerActivity {
  attemptId: string;
  state: PlannerAttemptV2["state"];
  startedAt?:string;
  finishedAt?:string;
  calls: { id:string; label:string; state:"WORKING"|"RECEIVED"|"STOPPED"; startedAt:string; finishedAt?:string;reasoning?:PlannerReasoningText }[];
  research: { id:string; callId?:string; label:string; detail:string; reason:string|null; working:boolean }[];
  output: { text:string; receivedCharacters:number; clipped:boolean; updatedAt:string; state:"WRITING"|"RECEIVED"|"INTERRUPTED" }|null;
}
export interface PlannerReasoningText {text:string;characters:number;complete:boolean;clipped:boolean;redacted:boolean;recorded:boolean}
