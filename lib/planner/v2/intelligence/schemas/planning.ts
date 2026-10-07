import { z } from "zod";
import { DateV2Schema,DigestV2Schema,LocalIdV2Schema,SummaryV2Schema,EffortRangeV2Schema,withPlannerEnvelope,PLANNER_V2_ENVELOPE as E,BlueprintActivityV2Schema } from "../../contracts";
const nonnegative=z.number().nonnegative();
export const AllocationFactsSchema=withPlannerEnvelope(z.strictObject({
  weeks:z.array(z.strictObject({week:DateV2Schema,otherCommittedMinutes:nonnegative,protectedTargetMinutes:nonnegative,
    perGoalCommittedMinutes:z.array(z.strictObject({planRef:LocalIdV2Schema,minutes:nonnegative})).max(E.targets)})).max(72),
  pins:z.array(z.strictObject({planRef:LocalIdV2Schema,activityRef:LocalIdV2Schema,date:DateV2Schema,completionDate:DateV2Schema.optional(),
    remainingMinutes:z.number().int().min(0).max(E.timeboxMaxMinutes),alreadyReserved:z.boolean(),contentDigest:DigestV2Schema,
    state:z.enum(["UNSTARTED","RUNNING","PAUSED","ENDED_INCOMPLETE","COMPLETED"]),remainingDisposition:z.enum(["OPEN","WITHDRAWN","COMPLETED"]),
    actualSeconds:z.number().int().nonnegative(),executionVersion:z.number().int().nonnegative()})).max(E.outstandingActivitiesPerPlan*E.targets),
  externalActivities:z.array(z.strictObject({ref:LocalIdV2Schema,date:DateV2Schema,available:z.boolean(),contentDigest:DigestV2Schema})).max(E.outstandingActivitiesPerPlan*E.targets),
  preferences:z.array(z.strictObject({planRef:LocalIdV2Schema,pacing:z.enum(["COMFORTABLE_EARLY","SPREAD"]),maximumTimeboxMinutes:z.number().int().min(5).max(240).optional()})).min(1).max(E.targets),
}));
export type AllocationFacts=z.infer<typeof AllocationFactsSchema>;
export const DetailSchema=z.strictObject({days:z.union([z.literal(14),z.literal(28)]),checkpoint:SummaryV2Schema});
export const RecoveryAdjustmentSchema=z.strictObject({percent:z.number().min(0).max(50),reason:SummaryV2Schema});
export const PlanningSupportSchema=withPlannerEnvelope(z.strictObject({
  detail:DetailSchema,tradeOffExplanation:SummaryV2Schema,recoveryAdjustment:RecoveryAdjustmentSchema.optional(),
  unreviewedPhaseRefs:z.array(z.strictObject({planRef:LocalIdV2Schema,phaseRef:LocalIdV2Schema})).max(E.milestones*E.targets).optional(),
  splits:z.array(z.strictObject({planRef:LocalIdV2Schema,originalRef:LocalIdV2Schema,pieceRefs:z.array(LocalIdV2Schema).min(2).max(13),originalActivity:BlueprintActivityV2Schema,requiresReview:z.literal(true)})).max(E.newlyDetailedActivities),
  forecasts:z.array(z.strictObject({planRef:LocalIdV2Schema,phases:z.array(z.strictObject({phaseRef:LocalIdV2Schema,effort:EffortRangeV2Schema.optional(),
    status:z.enum(["PROJECTED","UNKNOWN_EFFORT","BEYOND_FORECAST_WINDOW","FORECAST_BLOCKED"]),likelyFinishDate:DateV2Schema.optional(),lowFinishDate:DateV2Schema.optional(),highFinishDate:DateV2Schema.optional(),
    remainingLikelyMinutes:z.number().int().nonnegative().optional(),booked:z.literal(false)})).max(E.milestones)})).max(E.targets),
  adaptationReason:SummaryV2Schema.optional(),
  adaptation:z.enum(["NOT_REQUESTED","PENDING","KEPT","REVISED"]),
}));
export type PlanningSupport=z.infer<typeof PlanningSupportSchema>;
