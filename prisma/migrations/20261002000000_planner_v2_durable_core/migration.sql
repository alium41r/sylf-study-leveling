-- AlterTable
ALTER TABLE "Quest" ADD COLUMN     "executionVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "plannedMinutes" INTEGER,
ADD COLUMN     "plannerSpec" JSONB,
ADD COLUMN     "plannerSpecDigest" TEXT,
ADD COLUMN     "remainingDisposition" TEXT NOT NULL DEFAULT 'OPEN',
ADD COLUMN     "remainingEstimateBasisActualSeconds" INTEGER,
ADD COLUMN     "remainingMinutesEstimate" INTEGER;

-- AlterTable
ALTER TABLE "PlannerPlan" ADD COLUMN     "contractVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "conversationVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "migrationEvidence" JSONB,
ADD COLUMN     "reservedGoalId" INTEGER,
ADD COLUMN     "workingIntentVersionId" UUID;

-- AlterTable
ALTER TABLE "PlannerRevision" ADD COLUMN     "attemptId" UUID,
ADD COLUMN     "requestedIntentVersionId" UUID,
ADD COLUMN     "resolvedIntentVersionId" UUID,
ADD COLUMN     "v2Artifact" JSONB;

-- AlterTable
ALTER TABLE "PlannerQuestLink" ADD COLUMN     "baselineSpecDigest" TEXT;

-- AlterTable
ALTER TABLE "StudySession" ADD COLUMN     "acceptedBreakAtResume" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "acceptedFocusAtResume" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "executionState" TEXT,
ADD COLUMN     "executionVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "runningSince" TIMESTAMP(3),
ADD COLUMN     "transitionReceipts" JSONB;

-- CreateTable
CREATE TABLE "PlannerIntentVersion" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "userId" INTEGER NOT NULL,
    "parentId" UUID,
    "version" INTEGER NOT NULL,
    "artifact" JSONB NOT NULL,
    "digest" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlannerIntentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlannerAttempt" (
    "id" UUID NOT NULL,
    "userId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "fence" INTEGER NOT NULL DEFAULT 0,
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "executionDeadlineAt" TIMESTAMP(3),
    "artifact" JSONB NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlannerAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlannerIntentVersion_planId_version_key" ON "PlannerIntentVersion"("planId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "PlannerIntentVersion_id_planId_key" ON "PlannerIntentVersion"("id", "planId");

-- CreateIndex
CREATE INDEX "PlannerAttempt_state_createdAt_idx" ON "PlannerAttempt"("state", "createdAt");

-- CreateIndex
CREATE INDEX "PlannerAttempt_state_leaseExpiresAt_idx" ON "PlannerAttempt"("state", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "PlannerAttempt_userId_kind_state_idx" ON "PlannerAttempt"("userId", "kind", "state");

-- CreateIndex
CREATE UNIQUE INDEX "PlannerAttempt_userId_requestKey_key" ON "PlannerAttempt"("userId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "PlannerPlan_workingIntentVersionId_key" ON "PlannerPlan"("workingIntentVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "PlannerPlan_reservedGoalId_key" ON "PlannerPlan"("reservedGoalId");

-- AddForeignKey
ALTER TABLE "PlannerPlan" ADD CONSTRAINT "PlannerPlan_workingIntentVersionId_fkey" FOREIGN KEY ("workingIntentVersionId") REFERENCES "PlannerIntentVersion"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannerRevision" ADD CONSTRAINT "PlannerRevision_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "PlannerAttempt"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannerIntentVersion" ADD CONSTRAINT "PlannerIntentVersion_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlannerPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannerIntentVersion" ADD CONSTRAINT "PlannerIntentVersion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannerIntentVersion" ADD CONSTRAINT "PlannerIntentVersion_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "PlannerIntentVersion"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannerAttempt" ADD CONSTRAINT "PlannerAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Phase 1 integrity is additive. Legacy snapshots remain immutable and readable.
ALTER TABLE "AiUsageLog" ALTER COLUMN "estimatedCostUsd" DROP NOT NULL;
ALTER TABLE "AiUsageLog" ADD COLUMN "requestId" UUID, ADD COLUMN "rootRequestId" UUID, ADD COLUMN reservation JSONB, ADD COLUMN "attemptId" UUID,
  ADD COLUMN stage TEXT, ADD COLUMN "accountingState" TEXT NOT NULL DEFAULT 'SETTLED';
CREATE UNIQUE INDEX "AiUsageLog_requestId_key" ON "AiUsageLog"("requestId");
ALTER TABLE "AiUsageLog" ADD CONSTRAINT "AiUsageLog_accountingState_check" CHECK ("accountingState" IN ('DISPATCHED','UNKNOWN_SPEND','SETTLED'));
CREATE UNIQUE INDEX "PlannerAttempt_rootRequestId_key" ON "PlannerAttempt"((artifact->'budget'->>'rootRequestId'));
ALTER TABLE "PlannerPlan" DROP CONSTRAINT planner_plan_bounds;
ALTER TABLE "PlannerPlan" ADD CONSTRAINT planner_plan_bounds CHECK (
  mode IN ('GENERAL','EXAM','ROADMAP','MASTERY') AND state IN ('DRAFT','ACTIVE','COMPLETED','ARCHIVED')
  AND version>=0 AND "conversationVersion">=0 AND "contractVersion" IN (1,2)
  AND length(title) BETWEEN 1 AND 200 AND length("creationKey") BETWEEN 8 AND 100 AND "creationHash" ~ '^[a-f0-9]{64}$');
ALTER TABLE "PlannerPlan" ADD CONSTRAINT planner_working_intent_membership
  FOREIGN KEY ("workingIntentVersionId",id) REFERENCES "PlannerIntentVersion"(id,"planId") DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "PlannerIntentVersion" ADD CONSTRAINT planner_intent_parent_membership
  FOREIGN KEY ("parentId","planId") REFERENCES "PlannerIntentVersion"(id,"planId") DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "PlannerRevision" ADD CONSTRAINT planner_requested_intent_membership
  FOREIGN KEY ("requestedIntentVersionId","planId") REFERENCES "PlannerIntentVersion"(id,"planId") DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "PlannerRevision" ADD CONSTRAINT planner_resolved_intent_membership
  FOREIGN KEY ("resolvedIntentVersionId","planId") REFERENCES "PlannerIntentVersion"(id,"planId") DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "PlannerIntentVersion" ADD CONSTRAINT planner_intent_bounds CHECK (
  version>0 AND digest ~ '^[a-f0-9]{64}$' AND octet_length(artifact::text)<=4194304
  AND artifact->>'schemaVersion'='2' AND artifact->>'intentVersionId'=id::text
  AND artifact->>'planId'="planId"::text AND (artifact->>'ownerId')::int="userId"
  AND (artifact->>'version')::int=version AND (artifact->>'parentIntentVersionId')::uuid IS NOT DISTINCT FROM "parentId");
ALTER TABLE "PlannerAttempt" ADD CONSTRAINT planner_attempt_bounds CHECK (
  kind IN ('PLAN','REPLAN','EXPAND','JOINT','RESEARCH_ADVICE')
  AND state IN ('QUEUED','RUNNING','NEEDS_DECISION','SUCCEEDED','FAILED','CANCELLED','SUPERSEDED')
  AND fence>=0 AND "requestHash" ~ '^[a-f0-9]{64}$' AND length("requestKey") BETWEEN 8 AND 100
  AND octet_length(artifact::text)<=4194304 AND (payload IS NULL OR octet_length(payload::text)<=4194304)
  AND artifact->>'schemaVersion'='2' AND artifact->>'attemptId'=id::text AND (artifact->>'ownerId')::int="userId"
  AND artifact->>'kind'=kind AND artifact->>'state'=state AND (artifact->>'fence')::int=fence
  AND artifact->>'requestHash'="requestHash" AND artifact->>'idempotencyKey'="requestKey"
  AND ((state='RUNNING' AND "leaseOwner" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL
    AND artifact->'lease'->>'owner'="leaseOwner" AND (artifact->'lease'->>'fence')::int=fence
    AND (artifact->'lease'->>'expiresAt')::timestamptz=("leaseExpiresAt" AT TIME ZONE 'UTC'))
    OR (state<>'RUNNING' AND "leaseOwner" IS NULL AND "leaseExpiresAt" IS NULL AND artifact->'lease'='null'::jsonb))
  AND (artifact->'budget'->>'executionDeadlineAt')::timestamptz IS NOT DISTINCT FROM ("executionDeadlineAt" AT TIME ZONE 'UTC')
  AND (kind<>'RESEARCH_ADVICE' OR jsonb_array_length(artifact->'targets')=0)
  AND (kind='RESEARCH_ADVICE' OR jsonb_array_length(artifact->'targets') BETWEEN 1 AND 2));
CREATE UNIQUE INDEX planner_attempt_one_running_planning ON "PlannerAttempt"("userId") WHERE state='RUNNING' AND kind<>'RESEARCH_ADVICE';
CREATE UNIQUE INDEX planner_attempt_one_running_research ON "PlannerAttempt"("userId") WHERE state='RUNNING' AND kind='RESEARCH_ADVICE';

-- Extend the existing constraint, preserving its complete legacy branch.
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_constraintdef(oid) INTO definition FROM pg_constraint WHERE conname='planner_revision_bounds' AND conrelid='"PlannerRevision"'::regclass;
 EXECUTE 'ALTER TABLE "PlannerRevision" DROP CONSTRAINT planner_revision_bounds';
 EXECUTE 'ALTER TABLE "PlannerRevision" ADD CONSTRAINT planner_revision_bounds ' ||
 regexp_replace(definition, '^CHECK \((.*)\)$', 'CHECK ((\1) OR ("schemaVersion"=2 AND "operationState"=''SEALED'' AND sequence>0 AND "baseVersion">=0 AND "attemptId" IS NOT NULL AND "requestedIntentVersionId" IS NOT NULL AND "resolvedIntentVersionId" IS NOT NULL AND "v2Artifact" IS NOT NULL AND octet_length("v2Artifact"::text)<=4194304 AND "v2Artifact"->>''revisionId''=id::text AND "v2Artifact"->>''planId''="planId"::text AND "v2Artifact"->>''digest''=digest AND "sealedAt" IS NOT NULL AND digest ~ ''^[a-f0-9]{64}$''))');
END $$;

-- Existing baseline JSON remains frozen. New execution baselines use the common
-- V2 envelope, avoiding an obsolete 16 KiB link limit after valid publication.
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_constraintdef(oid) INTO definition FROM pg_constraint WHERE conname='planner_link_bounds' AND conrelid='"PlannerQuestLink"'::regclass;
 EXECUTE 'ALTER TABLE "PlannerQuestLink" DROP CONSTRAINT planner_link_bounds';
 EXECUTE 'ALTER TABLE "PlannerQuestLink" ADD CONSTRAINT planner_link_bounds ' ||
 regexp_replace(definition, 'octet_length\(baseline::text\) <= 16384', '(octet_length(baseline::text) <= 16384 OR (baseline->>''schemaVersion''=''2'' AND "baselineSpecDigest" ~ ''^[a-f0-9]{64}$'' AND octet_length(baseline::text)<=4194304))');
END $$;
ALTER TABLE "PlannerPlan" ADD CONSTRAINT planner_v2_migration_envelope CHECK ("migrationEvidence" IS NULL OR octet_length("migrationEvidence"::text)<=4194304);
ALTER TABLE "Quest" ADD CONSTRAINT planner_v2_duration_bounds CHECK (
  ("plannedMinutes" IS NULL AND "plannerSpec" IS NULL AND "plannerSpecDigest" IS NULL AND "remainingMinutesEstimate" IS NULL AND "remainingEstimateBasisActualSeconds" IS NULL)
  OR ("plannedMinutes" BETWEEN 5 AND 240 AND "targetMinutes"="plannedMinutes" AND "requiredMinutes"="plannedMinutes"
  AND "remainingMinutesEstimate" BETWEEN 0 AND 1440 AND "remainingEstimateBasisActualSeconds">=0
  AND "remainingEstimateBasisActualSeconds"<="elapsedSeconds" AND "plannerSpec"->>'schemaVersion'='2'
  AND "plannerSpecDigest" ~ '^[a-f0-9]{64}$' AND "remainingDisposition" IN ('OPEN','WITHDRAWN','COMPLETED')
  AND (("remainingDisposition"='OPEN' AND "remainingMinutesEstimate">0 AND status<>'COMPLETED')
    OR ("remainingDisposition"='COMPLETED' AND "remainingMinutesEstimate"=0 AND status='COMPLETED')
    OR ("remainingDisposition"='WITHDRAWN' AND "remainingMinutesEstimate"=0 AND status<>'COMPLETED'))));
ALTER TABLE "StudySession" ADD CONSTRAINT planner_v2_session_bounds CHECK (
  ("executionState" IS NULL AND "executionVersion"=0) OR
  ("executionState" IN ('RUNNING','PAUSED','ENDED') AND "executionVersion">0
    AND (("executionState"='ENDED')=("endedAt" IS NOT NULL))
    AND (("executionState"='RUNNING')=("runningSince" IS NOT NULL))
    AND "acceptedFocusAtResume" BETWEEN 0 AND "durationSeconds"
    AND "acceptedBreakAtResume" BETWEEN 0 AND "breakSeconds"));

CREATE FUNCTION public.planner_v2_assert_coordinated(owner_id int) RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_locks WHERE locktype='advisory' AND pid=pg_backend_pid()
   AND classid=73641::oid AND objid=owner_id::oid AND objsubid=2 AND granted) THEN
   RAISE EXCEPTION 'PLANNER_COORDINATION_REQUIRED' USING ERRCODE='23514';
 END IF;
END $$;
CREATE FUNCTION public.planner_v2_artifact_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE owner_id int; target jsonb; previous jsonb; old_target jsonb;
BEGIN
 owner_id := COALESCE(NEW."userId",OLD."userId");
 IF TG_OP='DELETE' AND NOT EXISTS (SELECT 1 FROM "User" WHERE id=owner_id) THEN RETURN OLD; END IF;
 PERFORM public.planner_v2_assert_coordinated(owner_id);
 IF TG_TABLE_NAME='PlannerIntentVersion' THEN
   IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'PLANNER_INTENT_IMMUTABLE' USING ERRCODE='23514'; END IF;
   IF NOT EXISTS (SELECT 1 FROM "PlannerPlan" WHERE id=NEW."planId" AND "userId"=owner_id AND "contractVersion"=2) THEN
     RAISE EXCEPTION 'PLANNER_OWNERSHIP' USING ERRCODE='23514'; END IF;
 ELSE
   IF TG_OP='DELETE' THEN RAISE EXCEPTION 'PLANNER_ATTEMPT_IMMUTABLE' USING ERRCODE='23514'; END IF;
   FOR target IN SELECT value FROM jsonb_array_elements(NEW.artifact->'targets') LOOP
     IF NOT EXISTS (SELECT 1 FROM "PlannerPlan" p JOIN "PlannerIntentVersion" i ON i."planId"=p.id
       WHERE p.id=(target->>'planId')::uuid AND p."userId"=owner_id AND i.id=(target->>'requestedIntentVersionId')::uuid) THEN
       RAISE EXCEPTION 'PLANNER_OWNERSHIP' USING ERRCODE='23514'; END IF;
   END LOOP;
   IF TG_OP='UPDATE' THEN
     IF NOT (CASE OLD.state
       WHEN 'QUEUED' THEN NEW.state IN ('QUEUED','RUNNING','CANCELLED','SUPERSEDED','FAILED')
       WHEN 'RUNNING' THEN NEW.state IN ('RUNNING','QUEUED','NEEDS_DECISION','SUCCEEDED','FAILED','CANCELLED','SUPERSEDED')
       WHEN 'NEEDS_DECISION' THEN NEW.state IN ('NEEDS_DECISION','CANCELLED','SUPERSEDED')
       ELSE NEW.state=OLD.state END) THEN RAISE EXCEPTION 'PLANNER_ATTEMPT_STATE_INVALID' USING ERRCODE='23514'; END IF;
     IF ROW(NEW.id,NEW."userId",NEW.kind,NEW."requestKey",NEW."requestHash",NEW."createdAt") IS DISTINCT FROM
       ROW(OLD.id,OLD."userId",OLD.kind,OLD."requestKey",OLD."requestHash",OLD."createdAt") OR
       (NEW.artifact-'state'-'stage'-'targets'-'budget'-'fence'-'lease'-'checkpoint'-'question'-'error'-'result'-'applyReceipt') IS DISTINCT FROM
       (OLD.artifact-'state'-'stage'-'targets'-'budget'-'fence'-'lease'-'checkpoint'-'question'-'error'-'result'-'applyReceipt') OR NEW.fence<OLD.fence THEN
       RAISE EXCEPTION 'PLANNER_ATTEMPT_IDENTITY_IMMUTABLE' USING ERRCODE='23514'; END IF;
     IF OLD.state IN ('FAILED','CANCELLED','SUPERSEDED') AND ROW(NEW.artifact,NEW.payload) IS DISTINCT FROM ROW(OLD.artifact,OLD.payload) THEN
       RAISE EXCEPTION 'PLANNER_TERMINAL_IMMUTABLE' USING ERRCODE='23514'; END IF;
     IF OLD.state='SUCCEEDED' AND ((NEW.artifact-'applyReceipt') IS DISTINCT FROM (OLD.artifact-'applyReceipt')
       OR OLD.artifact->'applyReceipt'<>'null'::jsonb AND NEW.artifact->'applyReceipt' IS DISTINCT FROM OLD.artifact->'applyReceipt') THEN
       RAISE EXCEPTION 'PLANNER_RESULT_IMMUTABLE' USING ERRCODE='23514'; END IF;
     IF OLD.state='SUCCEEDED' AND (COALESCE(NEW.payload,'{}'::jsonb)#-'{changeSet,applyReceipt}') IS DISTINCT FROM
       (COALESCE(OLD.payload,'{}'::jsonb)#-'{changeSet,applyReceipt}') THEN RAISE EXCEPTION 'PLANNER_RESULT_IMMUTABLE' USING ERRCODE='23514'; END IF;
     IF NEW.state='RUNNING' AND (OLD.state<>'RUNNING' OR NEW."leaseOwner" IS DISTINCT FROM OLD."leaseOwner") AND NEW.fence<=OLD.fence THEN
       RAISE EXCEPTION 'PLANNER_FENCE_REQUIRED' USING ERRCODE='23514'; END IF;
     IF OLD.state='RUNNING' AND NEW.state IN ('RUNNING','SUCCEEDED','NEEDS_DECISION') AND (OLD."leaseExpiresAt" AT TIME ZONE 'UTC')<=clock_timestamp() THEN
       RAISE EXCEPTION 'PLANNER_LEASE_EXPIRED' USING ERRCODE='23514'; END IF;
     IF OLD.state='RUNNING' AND NEW.state IN ('RUNNING','SUCCEEDED','NEEDS_DECISION') AND (OLD."executionDeadlineAt" AT TIME ZONE 'UTC')<=clock_timestamp() THEN
       RAISE EXCEPTION 'PLANNER_BUDGET_EXHAUSTED' USING ERRCODE='23514'; END IF;
     IF OLD."executionDeadlineAt" IS NOT NULL AND NEW."executionDeadlineAt" IS DISTINCT FROM OLD."executionDeadlineAt" AND
       (OLD.artifact->'budget'->>'profile'=NEW.artifact->'budget'->>'profile' OR
        NEW."executionDeadlineAt" IS DISTINCT FROM ((OLD.artifact->'budget'->>'processingStartedAt')::timestamptz AT TIME ZONE 'UTC')+
         (CASE NEW.artifact->'budget'->>'profile' WHEN 'ADVICE' THEN 30 WHEN 'CALENDAR_ONLY' THEN 30 WHEN 'EDUCATIONAL' THEN 180 WHEN 'RESEARCH' THEN 300 END)*interval '1 second'-
         (OLD.artifact->'budget'->>'foregroundProcessingMs')::bigint*interval '1 millisecond') THEN
       RAISE EXCEPTION 'PLANNER_DEADLINE_IMMUTABLE' USING ERRCODE='23514'; END IF;
     IF ROW(NEW.artifact->'budget'->>'rootRequestId',NEW.artifact->'budget'->>'processingStartedAt',NEW.artifact->'budget'->>'foregroundProcessingMs') IS DISTINCT FROM
       ROW(OLD.artifact->'budget'->>'rootRequestId',OLD.artifact->'budget'->>'processingStartedAt',OLD.artifact->'budget'->>'foregroundProcessingMs') AND OLD."executionDeadlineAt" IS NOT NULL THEN
       RAISE EXCEPTION 'PLANNER_BUDGET_RESET' USING ERRCODE='23514'; END IF;
     IF array_position(ARRAY['ADVICE','CALENDAR_ONLY','EDUCATIONAL','RESEARCH'],NEW.artifact->'budget'->>'profile')<
       array_position(ARRAY['ADVICE','CALENDAR_ONLY','EDUCATIONAL','RESEARCH'],OLD.artifact->'budget'->>'profile') THEN
       RAISE EXCEPTION 'PLANNER_BUDGET_RESET' USING ERRCODE='23514'; END IF;
     IF jsonb_array_length(NEW.artifact->'targets')<>jsonb_array_length(OLD.artifact->'targets') THEN RAISE EXCEPTION 'PLANNER_TARGET_IMMUTABLE' USING ERRCODE='23514'; END IF;
     FOR old_target IN SELECT value FROM jsonb_array_elements(OLD.artifact->'targets') LOOP
       SELECT value INTO target FROM jsonb_array_elements(NEW.artifact->'targets') WHERE value->>'planId'=old_target->>'planId';
       IF target IS NULL OR (target-'resolvedIntentVersionId'-'resolution'-'resolvedPlanningVersion'-'contextDigest') IS DISTINCT FROM
         (old_target-'resolvedIntentVersionId'-'resolution'-'resolvedPlanningVersion'-'contextDigest') OR
         old_target->>'resolvedIntentVersionId' IS NOT NULL AND ROW(target->>'resolvedIntentVersionId',target->>'resolution',target->>'resolvedPlanningVersion') IS DISTINCT FROM
           ROW(old_target->>'resolvedIntentVersionId',old_target->>'resolution',old_target->>'resolvedPlanningVersion') OR
         old_target->>'contextDigest' IS NOT NULL AND target->>'contextDigest' IS DISTINCT FROM old_target->>'contextDigest' THEN
         RAISE EXCEPTION 'PLANNER_RESOLUTION_IMMUTABLE' USING ERRCODE='23514'; END IF;
     END LOOP;
     FOR target IN SELECT jsonb_build_object('key',key,'value',value) FROM jsonb_each(OLD.artifact->'budget'->'consumed') LOOP
       IF (NEW.artifact->'budget'->'consumed'->>(target->>'key'))::bigint<(target->>'value')::bigint THEN RAISE EXCEPTION 'PLANNER_BUDGET_RESET' USING ERRCODE='23514'; END IF;
     END LOOP;
   END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER planner_v2_intent_guard BEFORE INSERT OR UPDATE OR DELETE ON "PlannerIntentVersion" FOR EACH ROW EXECUTE FUNCTION public.planner_v2_artifact_guard();
CREATE TRIGGER planner_v2_attempt_guard BEFORE INSERT OR UPDATE OR DELETE ON "PlannerAttempt" FOR EACH ROW EXECUTE FUNCTION public.planner_v2_artifact_guard();

CREATE FUNCTION public.planner_v2_revision_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE owner_id int;
BEGIN
 SELECT "userId" INTO owner_id FROM "PlannerPlan" WHERE id=COALESCE(NEW."planId",OLD."planId");
 IF TG_OP='DELETE' AND owner_id IS NULL THEN RETURN OLD; END IF;
 IF COALESCE(NEW."schemaVersion",OLD."schemaVersion")=2 THEN
   PERFORM public.planner_v2_assert_coordinated(owner_id);
   IF TG_OP='DELETE' OR TG_OP='UPDATE' AND ROW(NEW."v2Artifact",NEW."attemptId",NEW."requestedIntentVersionId",NEW."resolvedIntentVersionId") IS DISTINCT FROM
      ROW(OLD."v2Artifact",OLD."attemptId",OLD."requestedIntentVersionId",OLD."resolvedIntentVersionId") THEN RAISE EXCEPTION 'PLANNER_REVISION_IMMUTABLE' USING ERRCODE='23514'; END IF;
   IF NOT EXISTS (SELECT 1 FROM "PlannerAttempt" WHERE id=NEW."attemptId" AND "userId"=owner_id AND kind<>'RESEARCH_ADVICE') THEN RAISE EXCEPTION 'PLANNER_OWNERSHIP' USING ERRCODE='23514'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER planner_v2_revision_guard BEFORE INSERT OR UPDATE OR DELETE ON "PlannerRevision" FOR EACH ROW EXECUTE FUNCTION public.planner_v2_revision_guard();

-- Cutover is per Plan. Legacy services holding the same advisory lock still
-- cannot mutate a V2 Plan, revision or lineage through their old capabilities.
CREATE FUNCTION public.planner_v2_core_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE owner_id int; plan_id uuid; generation int;
BEGIN
 IF TG_TABLE_NAME='PlannerPlan' THEN
   owner_id:=COALESCE(NEW."userId",OLD."userId"); generation:=COALESCE(NEW."contractVersion",OLD."contractVersion");
 ELSE
   plan_id:=COALESCE(NEW."planId",OLD."planId");
   SELECT "userId","contractVersion" INTO owner_id,generation FROM "PlannerPlan" WHERE id=plan_id;
 END IF;
 -- Account erasure can fire FK SET NULL updates before child DELETE triggers.
 -- A vanished owner is only a cascade exception, never a live-client bypass.
 IF TG_OP<>'INSERT' AND (owner_id IS NULL OR NOT EXISTS (SELECT 1 FROM "User" WHERE id=owner_id)) THEN
   IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;
 IF generation=2 THEN
   PERFORM public.planner_v2_assert_coordinated(owner_id);
   IF current_setting('sylf.planner_v2_core_owner',true) IS DISTINCT FROM owner_id::text THEN
     RAISE EXCEPTION 'PLANNER_V2_PATH_REQUIRED' USING ERRCODE='23514'; END IF;
   IF TG_TABLE_NAME='PlannerRevision' THEN
     IF NEW."schemaVersion"<>2 THEN RAISE EXCEPTION 'PLANNER_V2_PATH_REQUIRED' USING ERRCODE='23514'; END IF;
   END IF;
   IF TG_TABLE_NAME='PlannerQuestLink' THEN
    IF TG_OP='UPDATE' AND OLD."baselineSpecDigest" IS NOT NULL AND NEW."baselineSpecDigest" IS DISTINCT FROM OLD."baselineSpecDigest" THEN
      RAISE EXCEPTION 'PLANNER_BASELINE_IMMUTABLE' USING ERRCODE='23514'; END IF;
   END IF;
   IF TG_TABLE_NAME='PlannerPlan' THEN
    IF TG_OP='UPDATE' THEN
     IF NEW."userId"<>OLD."userId" OR NEW."contractVersion"<OLD."contractVersion" OR NEW.version<OLD.version OR NEW."conversationVersion"<OLD."conversationVersion" THEN
       RAISE EXCEPTION 'PLANNER_IDENTITY_IMMUTABLE' USING ERRCODE='23514'; END IF;
     IF OLD."contractVersion"=2 AND OLD."migrationEvidence" IS NOT NULL AND NEW."migrationEvidence" IS DISTINCT FROM OLD."migrationEvidence" THEN
       RAISE EXCEPTION 'PLANNER_BASELINE_IMMUTABLE' USING ERRCODE='23514'; END IF;
     IF OLD."workingIntentVersionId" IS NOT NULL AND NEW."workingIntentVersionId" IS DISTINCT FROM OLD."workingIntentVersionId" AND
       NOT EXISTS (SELECT 1 FROM "PlannerIntentVersion" WHERE id=NEW."workingIntentVersionId" AND "planId"=NEW.id AND "parentId"=OLD."workingIntentVersionId") THEN
       RAISE EXCEPTION 'PLANNER_INTENT_ANCESTRY_REQUIRED' USING ERRCODE='23514'; END IF;
    END IF;
   END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER planner_v2_core_plan BEFORE INSERT OR UPDATE OR DELETE ON "PlannerPlan" FOR EACH ROW EXECUTE FUNCTION public.planner_v2_core_guard();
CREATE TRIGGER planner_v2_core_revision BEFORE INSERT OR UPDATE OR DELETE ON "PlannerRevision" FOR EACH ROW EXECUTE FUNCTION public.planner_v2_core_guard();
CREATE TRIGGER planner_v2_core_link BEFORE INSERT OR UPDATE OR DELETE ON "PlannerQuestLink" FOR EACH ROW EXECUTE FUNCTION public.planner_v2_core_guard();
REVOKE ALL ON FUNCTION public.planner_v2_core_guard() FROM PUBLIC,anon,authenticated,service_role;

-- Context/economic sources participate in the user-first lock. Cosmetic profile
-- writes and heartbeat timestamps are deliberately not context generations.
CREATE FUNCTION public.planner_v2_source_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE owner_id int;
BEGIN
 IF TG_TABLE_NAME='User' THEN
   owner_id:=COALESCE(NEW.id,OLD.id);
   IF TG_OP='UPDATE' AND ROW(NEW.timezone,NEW."restDays",NEW."dailyGoalMinutes",NEW."enableHpPenalty",NEW.hp,NEW."maxHp",NEW.level,NEW."currentXP",NEW.sylph,NEW."streakDays",NEW."lastActiveDate",NEW."totalStudySeconds",NEW."totalStudyMinutes",NEW."lastDailyPenaltyEvaluatedDate") IS NOT DISTINCT FROM
     ROW(OLD.timezone,OLD."restDays",OLD."dailyGoalMinutes",OLD."enableHpPenalty",OLD.hp,OLD."maxHp",OLD.level,OLD."currentXP",OLD.sylph,OLD."streakDays",OLD."lastActiveDate",OLD."totalStudySeconds",OLD."totalStudyMinutes",OLD."lastDailyPenaltyEvaluatedDate") THEN RETURN NEW; END IF;
 ELSIF TG_TABLE_NAME='SubjectNode' THEN
   SELECT "userId" INTO owner_id FROM "Subject" WHERE id=COALESCE(NEW."subjectId",OLD."subjectId");
 ELSE owner_id:=COALESCE(NEW."userId",OLD."userId"); END IF;
 IF TG_OP='DELETE' AND (owner_id IS NULL OR NOT EXISTS (SELECT 1 FROM "User" WHERE id=owner_id)) THEN RETURN OLD; END IF;
 IF EXISTS (SELECT 1 FROM "PlannerPlan" WHERE "userId"=owner_id AND "contractVersion"=2) THEN
   PERFORM public.planner_v2_assert_coordinated(owner_id);
 END IF;
 IF TG_TABLE_NAME='Subject' THEN
   IF TG_OP='UPDATE' AND OLD."archivedAt" IS NULL AND NEW."archivedAt" IS NOT NULL AND EXISTS
     (SELECT 1 FROM "StudySession" WHERE "subjectId"=OLD.id AND "userId"=owner_id AND "endedAt" IS NULL) THEN
     RAISE EXCEPTION 'PLANNER_EXECUTION_PROTECTED' USING ERRCODE='23514'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER planner_v2_user_source BEFORE UPDATE OR DELETE ON "User" FOR EACH ROW EXECUTE FUNCTION public.planner_v2_source_guard();
CREATE TRIGGER planner_v2_subject_source BEFORE INSERT OR UPDATE OR DELETE ON "Subject" FOR EACH ROW EXECUTE FUNCTION public.planner_v2_source_guard();
CREATE TRIGGER planner_v2_node_source BEFORE INSERT OR UPDATE OR DELETE ON "SubjectNode" FOR EACH ROW EXECUTE FUNCTION public.planner_v2_source_guard();
CREATE TRIGGER planner_v2_rest_source BEFORE INSERT OR UPDATE OR DELETE ON "FloatingRestDay" FOR EACH ROW EXECUTE FUNCTION public.planner_v2_source_guard();
CREATE TRIGGER planner_v2_stats_source BEFORE INSERT OR UPDATE OR DELETE ON "UserStats" FOR EACH ROW EXECUTE FUNCTION public.planner_v2_source_guard();
CREATE TRIGGER planner_v2_inventory_source BEFORE INSERT OR UPDATE OR DELETE ON "InventoryItem" FOR EACH ROW EXECUTE FUNCTION public.planner_v2_source_guard();
CREATE TRIGGER planner_v2_owned_inventory_source BEFORE INSERT OR UPDATE OR DELETE ON "UserInventory" FOR EACH ROW EXECUTE FUNCTION public.planner_v2_source_guard();
REVOKE ALL ON FUNCTION public.planner_v2_source_guard() FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE "PlannerIntentVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlannerAttempt" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "PlannerIntentVersion","PlannerAttempt" FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.planner_v2_assert_coordinated(int),public.planner_v2_artifact_guard(),public.planner_v2_revision_guard() FROM PUBLIC,anon,authenticated,service_role;

-- Legacy guard retains its original protection outside reviewed V2 apply.
-- Account erasure is the explicit exception to historical participant retention.
-- Party timers do not write StudySession/Quest rewards; retain their own guards.
CREATE OR REPLACE FUNCTION public.check_focus_session_member_delete_guard()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_ended_at timestamp;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "User" WHERE id=OLD."userId") THEN RETURN OLD; END IF;
  SELECT "endedAt" INTO v_ended_at FROM public."FocusSession" WHERE id=OLD."sessionId";
  IF v_ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot delete participant records from an ended focus session' USING ERRCODE='check_violation';
  END IF;
  RETURN OLD;
END $$;

CREATE OR REPLACE FUNCTION public.planner_quest_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE linked boolean; structural boolean; unsafe_change boolean;
BEGIN
  IF current_setting('sylf.planner_v2_apply_owner',true)=OLD."userId"::text THEN
    PERFORM public.planner_v2_assert_coordinated(OLD."userId");
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  SELECT EXISTS(SELECT 1 FROM "PlannerQuestLink" WHERE "questId" = OLD.id) INTO linked;
  IF NOT linked THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  -- An explicitly authorized account deletion has already removed its parent
  -- User row when FK cascades run. Preserve the existing full-erasure action;
  -- the plan cascade subsequently removes these temporary tombstones too.
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM "User" WHERE id = OLD."userId") THEN
    UPDATE "PlannerQuestLink" SET "questId" = NULL, disposition = 'DELETED', "removedAt" = now(), "removalReason" = 'ACCOUNT_DELETED', "updatedAt" = now() WHERE "questId" = OLD.id;
    RETURN OLD;
  END IF;
  structural := TG_OP = 'DELETE';
  IF TG_OP = 'UPDATE' THEN
    structural := ROW(NEW."userId", NEW.title, NEW.description, NEW."scheduledFor", NEW."targetMinutes", NEW."requiredMinutes", NEW.difficulty, NEW."xpReward", NEW."sylphReward", NEW."subjectId", NEW."subjectNodeId", NEW."goalId", NEW."scopeWeight")
      IS DISTINCT FROM ROW(OLD."userId", OLD.title, OLD.description, OLD."scheduledFor", OLD."targetMinutes", OLD."requiredMinutes", OLD.difficulty, OLD."xpReward", OLD."sylphReward", OLD."subjectId", OLD."subjectNodeId", OLD."goalId", OLD."scopeWeight");
  END IF;
  IF NOT structural THEN RETURN NEW; END IF;
  IF current_setting('sylf.planner_manual_quest', true) IS DISTINCT FROM OLD.id::text THEN
    RAISE EXCEPTION 'PLANNER_REVIEW_REQUIRED' USING ERRCODE = '23514';
  END IF;
  unsafe_change := TG_OP = 'DELETE';
  IF TG_OP = 'UPDATE' THEN
    unsafe_change := ROW(NEW."scheduledFor", NEW."targetMinutes", NEW."requiredMinutes", NEW.difficulty, NEW."xpReward", NEW."sylphReward", NEW."goalId", NEW."subjectId", NEW."subjectNodeId", NEW."scopeWeight")
      IS DISTINCT FROM ROW(OLD."scheduledFor", OLD."targetMinutes", OLD."requiredMinutes", OLD.difficulty, OLD."xpReward", OLD."sylphReward", OLD."goalId", OLD."subjectId", OLD."subjectNodeId", OLD."scopeWeight");
    IF NEW."userId" <> OLD."userId" OR NEW."subjectNodeId" IS NOT NULL OR NEW."targetMinutes" <> NEW."requiredMinutes" THEN
      RAISE EXCEPTION 'PLANNER_REVIEW_REQUIRED' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF OLD.status IN ('COMPLETED','FAILED') OR (unsafe_change AND (OLD."elapsedSeconds" > 0 OR OLD.status = 'IN_PROGRESS' OR EXISTS(SELECT 1 FROM "StudySession" WHERE "questId" = OLD.id))) THEN
    RAISE EXCEPTION 'PLANNER_EXECUTION_PROTECTED' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN
    UPDATE "PlannerQuestLink" SET "questId" = NULL, disposition = 'DELETED', "removedAt" = now(), "removalReason" = 'USER_DELETED', "changedAt" = now(), "updatedAt" = now() WHERE "questId" = OLD.id;
    RETURN OLD;
  END IF;
  UPDATE "PlannerQuestLink" SET disposition = 'DETACHED', "changedAt" = now(), "updatedAt" = now() WHERE "questId" = OLD.id;
  RETURN NEW;
END $$;

CREATE FUNCTION public.planner_v2_execution_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE owner_id int; apply_authorized boolean; structural boolean; session_authorized boolean;
BEGIN
 owner_id := COALESCE(NEW."userId",OLD."userId");
 IF TG_OP='DELETE' AND NOT EXISTS (SELECT 1 FROM "User" WHERE id=owner_id) THEN RETURN OLD; END IF;
 IF EXISTS (SELECT 1 FROM "PlannerPlan" WHERE "userId"=owner_id AND "contractVersion"=2) THEN
   PERFORM public.planner_v2_assert_coordinated(owner_id);
 END IF;
 apply_authorized := current_setting('sylf.planner_v2_apply_owner',true)=owner_id::text;
 IF TG_TABLE_NAME='Quest' THEN
   -- History outside the V2 envelope remains immutable after Goal adoption.
   -- It cannot be revived through a legacy timer or a generic Quest edit.
   IF TG_OP<>'INSERT' AND OLD."plannedMinutes" IS NULL AND EXISTS
     (SELECT 1 FROM "PlannerPlan" WHERE "userId"=owner_id AND "goalId"=OLD."goalId" AND "contractVersion"=2) AND
     (TG_OP='DELETE' OR NEW IS DISTINCT FROM OLD) AND NOT
     (TG_OP='UPDATE' AND NEW."plannedMinutes" IS NOT NULL AND COALESCE(apply_authorized,false)) THEN
       RAISE EXCEPTION 'PLANNER_EXECUTION_PROTECTED' USING ERRCODE='23514'; END IF;
   IF TG_OP<>'DELETE' AND NEW."plannedMinutes" IS NULL AND NEW."goalId" IS NOT NULL AND NOT COALESCE(apply_authorized,false) THEN
     IF (TG_OP='INSERT' OR NEW."goalId" IS DISTINCT FROM OLD."goalId") AND EXISTS
       (SELECT 1 FROM "PlannerPlan" WHERE "userId"=owner_id AND "goalId"=NEW."goalId" AND "contractVersion"=2) THEN
       RAISE EXCEPTION 'PLANNER_APPLY_REQUIRED' USING ERRCODE='23514'; END IF;
   END IF;
   IF TG_OP='INSERT' AND NEW."plannedMinutes" IS NOT NULL AND NOT COALESCE(apply_authorized,false) THEN
     RAISE EXCEPTION 'PLANNER_APPLY_REQUIRED' USING ERRCODE='23514'; END IF;
   IF TG_OP<>'INSERT' AND OLD."plannedMinutes" IS NOT NULL THEN
     structural := TG_OP='DELETE';
     IF TG_OP='UPDATE' THEN
       structural := (to_jsonb(NEW)-'status'-'elapsedSeconds'-'completedAt'-'executionVersion'-'remainingMinutesEstimate'-'remainingDisposition') IS DISTINCT FROM
         (to_jsonb(OLD)-'status'-'elapsedSeconds'-'completedAt'-'executionVersion'-'remainingMinutesEstimate'-'remainingDisposition');
     END IF;
     IF structural AND NOT COALESCE(apply_authorized,false) THEN RAISE EXCEPTION 'PLANNER_APPLY_REQUIRED' USING ERRCODE='23514'; END IF;
     IF TG_OP='DELETE' OR structural THEN
       IF EXISTS (SELECT 1 FROM "StudySession" WHERE "questId"=OLD.id AND ("executionState"='RUNNING' OR "endedAt" IS NULL AND "executionState" IS NULL)) THEN
         RAISE EXCEPTION 'PLANNER_EXECUTION_PROTECTED' USING ERRCODE='23514'; END IF;
       IF OLD.status='COMPLETED' OR OLD."remainingDisposition"<>'OPEN' THEN RAISE EXCEPTION 'PLANNER_EXECUTION_PROTECTED' USING ERRCODE='23514'; END IF;
       IF OLD.status='IN_PROGRESS' OR OLD."elapsedSeconds">0 OR EXISTS (SELECT 1 FROM "StudySession" WHERE "questId"=OLD.id) THEN
         IF TG_OP='DELETE' THEN RAISE EXCEPTION 'PLANNER_STARTED_HISTORY_PROTECTED' USING ERRCODE='23514'; END IF;
         IF ROW(NEW.title,NEW.description,NEW."plannedMinutes",NEW."subjectId",NEW."subjectNodeId",NEW."goalId",NEW."xpReward",NEW."sylphReward") IS DISTINCT FROM
           ROW(OLD.title,OLD.description,OLD."plannedMinutes",OLD."subjectId",OLD."subjectNodeId",OLD."goalId",OLD."xpReward",OLD."sylphReward") OR
           NEW."plannerSpec"->'content' IS DISTINCT FROM OLD."plannerSpec"->'content' THEN RAISE EXCEPTION 'PLANNER_STARTED_CONTENT_PROTECTED' USING ERRCODE='23514'; END IF;
       END IF;
     ELSIF TG_OP='UPDATE' AND NEW IS DISTINCT FROM OLD THEN
       session_authorized := current_setting('sylf.planner_v2_execution_quest',true)=OLD.id::text;
       IF NOT COALESCE(apply_authorized,false) AND NOT COALESCE(session_authorized,false) THEN RAISE EXCEPTION 'PLANNER_EXECUTION_PROTOCOL_REQUIRED' USING ERRCODE='23514'; END IF;
       IF NEW."elapsedSeconds"<OLD."elapsedSeconds" OR NEW."executionVersion"<OLD."executionVersion" OR
         (ROW(NEW.status,NEW."completedAt",NEW."remainingDisposition") IS DISTINCT FROM ROW(OLD.status,OLD."completedAt",OLD."remainingDisposition") AND NEW."executionVersion"<=OLD."executionVersion") THEN
         RAISE EXCEPTION 'PLANNER_EXECUTION_VERSION_REQUIRED' USING ERRCODE='23514'; END IF;
       IF OLD."remainingDisposition"='WITHDRAWN' AND NEW.status='COMPLETED' THEN RAISE EXCEPTION 'PLANNER_WITHDRAWN_COMPLETION_FORBIDDEN' USING ERRCODE='23514'; END IF;
     END IF;
   END IF;
 ELSIF TG_TABLE_NAME='StudySession' THEN
   -- A preserved out-of-envelope Quest is history, not a legacy execution
   -- escape hatch inside an adopted Goal. Cutover may only freeze attribution.
   IF COALESCE(NEW."executionState",OLD."executionState") IS NULL AND EXISTS
     (SELECT 1 FROM "Quest" q JOIN "PlannerPlan" p ON p."goalId"=q."goalId"
       WHERE q.id=COALESCE(NEW."questId",OLD."questId") AND p."userId"=owner_id AND p."contractVersion"=2) THEN
     IF NOT (TG_OP='UPDATE' AND COALESCE(apply_authorized,false) AND OLD."endedAt" IS NOT NULL AND
       (to_jsonb(NEW)-'executionContext') IS NOT DISTINCT FROM (to_jsonb(OLD)-'executionContext')) THEN
       RAISE EXCEPTION 'PLANNER_EXECUTION_PROTECTED' USING ERRCODE='23514'; END IF;
   END IF;
   IF COALESCE(NEW."executionState",OLD."executionState") IS NOT NULL THEN
     IF current_setting('sylf.planner_v2_session_transition',true) IS DISTINCT FROM COALESCE(NEW.id,OLD.id)::text THEN
       RAISE EXCEPTION 'PLANNER_EXECUTION_PROTOCOL_REQUIRED' USING ERRCODE='23514'; END IF;
     IF TG_OP='DELETE' THEN RAISE EXCEPTION 'PLANNER_STARTED_HISTORY_PROTECTED' USING ERRCODE='23514'; END IF;
     IF TG_OP='UPDATE' AND (NEW."userId"<>OLD."userId" OR NEW."questId" IS DISTINCT FROM OLD."questId" OR NEW."subjectId" IS DISTINCT FROM OLD."subjectId"
       OR NEW."startedAt"<>OLD."startedAt" OR NEW."durationSeconds"<OLD."durationSeconds" OR NEW."breakSeconds"<OLD."breakSeconds"
       OR NEW."executionVersion"<=OLD."executionVersion" OR OLD."executionState"='ENDED' AND NEW."executionState"<>'ENDED') THEN
       RAISE EXCEPTION 'PLANNER_SESSION_HISTORY_PROTECTED' USING ERRCODE='23514'; END IF;
   END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER planner_v2_execution_quest BEFORE INSERT OR UPDATE OR DELETE ON "Quest" FOR EACH ROW EXECUTE FUNCTION public.planner_v2_execution_guard();
CREATE TRIGGER planner_v2_execution_session BEFORE INSERT OR UPDATE OR DELETE ON "StudySession" FOR EACH ROW EXECUTE FUNCTION public.planner_v2_execution_guard();
REVOKE ALL ON FUNCTION public.planner_v2_execution_guard() FROM PUBLIC,anon,authenticated,service_role;

-- Effective start_study_session: original economic ledger, user-first coordination and V2 admission.
CREATE OR REPLACE FUNCTION public.start_study_session(
    p_user_id INT,
    p_quest_id INT DEFAULT NULL,
    p_subject_id INT DEFAULT NULL,
    p_initial_seconds INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id INT;
  v_started_at TIMESTAMP;
  v_initial_seconds INT;
  v_existing RECORD;
  v_last_end TIMESTAMP;
BEGIN
  PERFORM pg_advisory_xact_lock(73641,p_user_id);
  IF EXISTS (SELECT 1 FROM "Quest" WHERE id=p_quest_id AND "userId"=p_user_id AND "plannedMinutes" IS NOT NULL) THEN
    RAISE EXCEPTION 'PLANNER_EXECUTION_PROTOCOL_REQUIRED' USING ERRCODE='23514'; END IF;
  IF EXISTS (SELECT 1 FROM "StudySession" WHERE "userId"=p_user_id AND "executionState" IN ('RUNNING','PAUSED')) THEN
    RAISE EXCEPTION 'PLANNER_EXPLICIT_STOP_REQUIRED' USING ERRCODE='23514'; END IF;
  -- ══ S2 identity guard (20260827000000) — never trust caller-supplied p_user_id ══
  -- The app reaches this function as role postgres/supabase_admin. Any other
  -- role must prove its JWT subject equals p_user_id before anything runs.
  IF current_user NOT IN ('postgres', 'supabase_admin') THEN
    IF COALESCE((auth.jwt() ->> 'sub'), NULLIF(current_setting('request.jwt.claim.sub', true), ''), '') <> p_user_id::text THEN
      RAISE EXCEPTION 'S2 identity guard: caller identity does not match p_user_id' USING ERRCODE = '42501';
    END IF;
  END IF;
  -- 1. HARD CAP on carried seconds (server-authoritative trust boundary; T3: reduced to 30 minutes).
  v_initial_seconds := LEAST(GREATEST(0, COALESCE(p_initial_seconds, 0)), 1800);

  -- 2. Ownership validation — a session may never reference another
  --    user's subject or quest.
  IF p_subject_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public."Subject" WHERE id = p_subject_id AND "userId" = p_user_id
  ) THEN
    RAISE EXCEPTION 'Subject not found or unauthorized' USING ERRCODE = '42501';
  END IF;
  IF p_quest_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public."Quest" WHERE id = p_quest_id AND "userId" = p_user_id
  ) THEN
    RAISE EXCEPTION 'Quest not found or unauthorized' USING ERRCODE = '42501';
  END IF;

  -- If quest is provided, update quest status to IN_PROGRESS
  IF p_quest_id IS NOT NULL THEN
    UPDATE public."Quest"
    SET status = 'IN_PROGRESS'
    WHERE id = p_quest_id AND "userId" = p_user_id AND status = 'PENDING';
  END IF;

  -- 3. ADOPT: converge concurrent/duplicate starts onto ONE session row.
  --    A second tab racing the same lazy start receives the EXISTING open
  --    session instead of creating a duplicate that could double-credit
  --    the same wall-clock period.
  SELECT id, "startedAt", "durationMinutes", "durationSeconds", "focusRate"
  INTO v_existing
  FROM public."StudySession"
  WHERE "userId" = p_user_id
    AND "endedAt" IS NULL
    AND "questId" IS NOT DISTINCT FROM p_quest_id
    AND "subjectId" IS NOT DISTINCT FROM p_subject_id
  ORDER BY id
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'id', v_existing.id,
      'userId', p_user_id,
      'questId', p_quest_id,
      'subjectId', p_subject_id,
      'durationMinutes', v_existing."durationMinutes",
      'durationSeconds', v_existing."durationSeconds",
      'focusRate', v_existing."focusRate",
      'startedAt', v_existing."startedAt"
    );
  END IF;

  -- 4. Anti-fabrication overlap guard: compute the user's last ENDED
  --    session BEFORE closing open rows (closing sets endedAt = NOW(),
  --    which would otherwise wipe the legitimate backdate window).
  SELECT MAX("endedAt") INTO v_last_end
  FROM public."StudySession"
  WHERE "userId" = p_user_id AND "endedAt" IS NOT NULL;

  -- 5. Close any OTHER unended active sessions for this user (single
  --    open-session invariant; abandoned rows cannot accumulate).
  UPDATE public."StudySession"
  SET "endedAt" = NOW()
  WHERE "userId" = p_user_id AND "endedAt" IS NULL;

  -- 6. Backdated start — capped (step 1) and never allowed to precede
  --    the user's last ended session (step 4). A fabricated backdate can
  --    only reach into time the user demonstrably did not already have
  --    credited, and never more than 1h.
  v_started_at := NOW() - (v_initial_seconds || ' seconds')::INTERVAL;

  IF v_last_end IS NOT NULL THEN
    v_started_at := GREATEST(v_started_at, v_last_end - INTERVAL '60 seconds');
  END IF;

  -- Insert new study session (stored duration stays 0 — the settle RPC
  -- credits the exact delta on the first flush).
  INSERT INTO public."StudySession" (
    "userId", "questId", "subjectId", "durationMinutes", "durationSeconds", "focusRate", "startedAt"
  ) VALUES (
    p_user_id, p_quest_id, p_subject_id, 0, 0, 80, v_started_at
  )
  RETURNING id INTO v_session_id;

  RETURN jsonb_build_object(
    'id', v_session_id,
    'userId', p_user_id,
    'questId', p_quest_id,
    'subjectId', p_subject_id,
    'durationMinutes', 0,
    'durationSeconds', 0,
    'focusRate', 80,
    'startedAt', v_started_at
  );
END;
$$;

-- Effective settle_study_session_atomic: original economic ledger, user-first coordination and V2 admission.
CREATE OR REPLACE FUNCTION public.settle_study_session_atomic(
    p_user_id INT,
    p_session_id INT DEFAULT NULL,
    p_duration_seconds INT DEFAULT 0,
    p_break_seconds INT DEFAULT 0,
    p_quest_id INT DEFAULT NULL,
    p_subject_id INT DEFAULT NULL,
    p_complete_quest BOOLEAN DEFAULT FALSE,
    p_is_final BOOLEAN DEFAULT FALSE,
    p_user_local_date TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user RECORD;
    v_quest RECORD;
    v_node RECORD;
    v_session_owner INT;
    v_claimed BOOLEAN := FALSE;
    v_previous_seconds INT := 0;
    v_previous_break INT := 0;
    v_started_at TIMESTAMP;
    v_actual_seconds INT;
    v_break_seconds INT;
    v_focus_rate_actual INT;
    v_stored_seconds INT := 0;
    v_delta_seconds INT := 0;
    v_new_total_seconds INT;
    v_session_id INT := p_session_id;
    v_was_insert BOOLEAN := FALSE;
    v_wall_seconds INT;
    v_last_end TIMESTAMP;
    v_award_eligible BOOLEAN;

    v_session_minutes NUMERIC;
    v_session_multiplier NUMERIC := 1.0;
    v_streak_multiplier NUMERIC := 1.0;
    v_session_xp INT := 0;
    v_session_sylph INT := 0;

    v_quest_found BOOLEAN := FALSE;
    v_quest_open BOOLEAN := FALSE;
    v_quest_completed BOOLEAN := FALSE;
    v_quest_xp INT := 0;
    v_quest_sylph INT := 0;
    v_hp_healed INT := 0;
    v_new_hp INT;
    v_today TEXT;
    v_target_seconds INT := 0;
    v_should_complete BOOLEAN := FALSE;
    v_ratio NUMERIC := 0;
    v_full BOOLEAN := FALSE;
    v_base_xp INT := 0;
    v_base_sylph INT := 0;
    v_early BOOLEAN := FALSE;
    v_raw_progress NUMERIC := 0;

    v_node_id INT := NULL;
    v_node_found BOOLEAN := FALSE;
    v_new_progress NUMERIC := NULL;
    v_mastery_granted BOOLEAN := FALSE;

    v_total_xp INT := 0;
    v_total_sylph INT := 0;
    v_level_up_sylph INT := 0;
    v_level_up_sp INT := 0;
    v_rank_up_sp INT := 0;
    v_lifetime_xp INT;
    v_level INT;
    v_current_xp INT;
    v_xp_threshold INT;
    v_rank TEXT;
    v_rank_db TEXT;
    v_previous_rank TEXT;
    v_levels_gained INT := 0;
    v_did_rank_up BOOLEAN := FALSE;
    v_rank_up_text TEXT := '';
BEGIN
  PERFORM pg_advisory_xact_lock(73641,p_user_id);
  IF EXISTS (SELECT 1 FROM "StudySession" WHERE id=p_session_id AND "userId"=p_user_id AND "executionState" IS NOT NULL)
    AND current_setting('sylf.planner_v2_session_transition',true) IS DISTINCT FROM p_session_id::text THEN
    RAISE EXCEPTION 'PLANNER_EXECUTION_PROTOCOL_REQUIRED' USING ERRCODE='23514'; END IF;
  -- ══ S2 identity guard (20260827000000) — never trust caller-supplied p_user_id ══
  -- The app reaches this function as role postgres/supabase_admin. Any other
  -- role must prove its JWT subject equals p_user_id before anything runs.
  IF current_user NOT IN ('postgres', 'supabase_admin') THEN
    IF COALESCE((auth.jwt() ->> 'sub'), NULLIF(current_setting('request.jwt.claim.sub', true), ''), '') <> p_user_id::text THEN
      RAISE EXCEPTION 'S2 identity guard: caller identity does not match p_user_id' USING ERRCODE = '42501';
    END IF;
  END IF;
    IF p_user_id IS NULL OR p_user_id <= 0 THEN
        RAISE EXCEPTION 'Invalid user id' USING ERRCODE = '22023';
    END IF;

    v_actual_seconds := GREATEST(0, COALESCE(p_duration_seconds, 0));
    v_break_seconds := GREATEST(0, COALESCE(p_break_seconds, 0));

    -- 1. Lock StudySession first (fixed order: Session → Quest → User → UserStats → Node)
    IF v_session_id IS NOT NULL THEN
        SELECT "userId", "durationSeconds", "breakSeconds", "rewardsClaimed", "startedAt"
        INTO v_session_owner, v_previous_seconds, v_previous_break, v_claimed, v_started_at
        FROM public."StudySession"
        WHERE id = v_session_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Session not found: %', v_session_id;
        END IF;
        IF v_session_owner <> p_user_id THEN
            RAISE EXCEPTION 'Session % does not belong to user %', v_session_id, p_user_id
                USING ERRCODE = '42501';
        END IF;
        v_previous_seconds := COALESCE(v_previous_seconds, 0);
        v_previous_break := COALESCE(v_previous_break, 0);

        -- Server-side wall-clock clamp: cumulative focus can never exceed the
        -- (possibly backdated) session window + 60s grace. Because the stored
        -- duration is monotonic, a clamped flush can never regress data —
        -- it simply credits nothing until real time catches up.
        v_wall_seconds := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - v_started_at))));
        v_actual_seconds := LEAST(v_actual_seconds, v_wall_seconds + 60);
        v_break_seconds := LEAST(v_break_seconds, GREATEST(0, v_wall_seconds + 60 - v_actual_seconds));
    ELSE
        v_was_insert := TRUE;

        -- Trust boundary for the direct-call insert path (the API always
        -- provides a session id): ownership validation plus the same
        -- 30-minute recovery cap as start_study_session. This branch can
        -- never mint more time than the documented bound.
        IF p_subject_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public."Subject" WHERE id = p_subject_id AND "userId" = p_user_id
        ) THEN
            RAISE EXCEPTION 'Subject not found or unauthorized' USING ERRCODE = '42501';
        END IF;
        IF p_quest_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public."Quest" WHERE id = p_quest_id AND "userId" = p_user_id
        ) THEN
            RAISE EXCEPTION 'Quest not found or unauthorized' USING ERRCODE = '42501';
        END IF;
        v_actual_seconds := LEAST(v_actual_seconds, 1800);
        v_break_seconds := LEAST(v_break_seconds, 1800);
    END IF;

    IF (v_actual_seconds + v_break_seconds) > 0 THEN
        v_focus_rate_actual := ROUND(100.0 * v_actual_seconds / (v_actual_seconds + v_break_seconds));
    ELSE
        v_focus_rate_actual := 80;
    END IF;

    v_delta_seconds := GREATEST(0, v_actual_seconds - v_previous_seconds);

    -- 2. Lock Quest (if linked)
    IF p_quest_id IS NOT NULL THEN
        SELECT * INTO v_quest
        FROM public."Quest"
        WHERE id = p_quest_id AND "userId" = p_user_id
        FOR UPDATE;
        IF FOUND THEN
            v_quest_found := TRUE;
            v_quest_open := (v_quest.status = 'ACTIVE' OR v_quest.status = 'IN_PROGRESS' OR v_quest.status = 'PENDING');
        END IF;
    END IF;

    -- 3. Lock User and ensure UserStats exists
    SELECT * INTO v_user FROM public."User" WHERE id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found: %', p_user_id;
    END IF;

    INSERT INTO public."UserStats" ("userId", "level", "xp", "rank", "currency", "skillPoints",
        "endurance", "tenacity", "velocity", "discipline", "synthesis", "updatedAt")
    VALUES (p_user_id, v_user.level, public.canonical_required_xp(v_user.level) + v_user."currentXP", 'RANK E', 0, 0, 10, 10, 10, 10, 10, CURRENT_TIMESTAMP)
    ON CONFLICT ("userId") DO NOTHING;

    PERFORM 1 FROM public."UserStats" WHERE "userId" = p_user_id FOR UPDATE;

    -- Streak multiplier (canonical ladder) — used by both session and quest rewards.
    IF v_user."streakDays" >= 8 THEN
        v_streak_multiplier := 1.5;
    ELSIF v_user."streakDays" >= 4 THEN
        v_streak_multiplier := 1.3;
    ELSIF v_user."streakDays" >= 2 THEN
        v_streak_multiplier := 1.15;
    ELSIF v_user."streakDays" >= 1 THEN
        v_streak_multiplier := 1.05;
    ELSE
        v_streak_multiplier := 1.0;
    END IF;

    -- 4. Lock SubjectNode (if the quest targets one). Nested IFs: a
    -- record field must never appear in the same condition as a plain
    -- boolean variable (PostgreSQL does not guarantee short-circuit
    -- evaluation order for unassigned RECORD access).
    IF v_quest_found THEN
        IF v_quest."subjectNodeId" IS NOT NULL THEN
            v_node_id := v_quest."subjectNodeId";
            SELECT sn."progress", sn."isMastered", sn."spAward", sn."nodeId", sn."title"
            INTO v_node
            FROM public."SubjectNode" sn
            JOIN public."Subject" s ON s.id = sn."subjectId"
            WHERE sn.id = v_node_id AND s."userId" = p_user_id
            FOR UPDATE OF sn;
            IF FOUND THEN
                v_node_found := TRUE;
            END IF;
        END IF;
    END IF;

    -- 5. Upsert session row — monotonic stored duration; endedAt only on final.
    IF v_session_id IS NOT NULL THEN
        v_stored_seconds := GREATEST(v_actual_seconds, v_previous_seconds);
        UPDATE public."StudySession"
        SET "executionVersion" = CASE WHEN "executionState" IS NULL THEN "executionVersion" ELSE "executionVersion"+1 END,
            "executionState" = CASE WHEN "executionState" IS NOT NULL AND p_is_final THEN 'ENDED' ELSE "executionState" END,
            "runningSince" = CASE WHEN p_is_final THEN NULL ELSE "runningSince" END,
            "durationMinutes" = FLOOR(v_stored_seconds / 60.0),
            "durationSeconds" = v_stored_seconds,
            "breakSeconds" = GREATEST(v_break_seconds, "breakSeconds"),
            "focusRate" = v_focus_rate_actual,
            "endedAt" = CASE WHEN p_is_final THEN NOW() ELSE "endedAt" END,
            "rewardsClaimed" = CASE WHEN p_is_final THEN TRUE ELSE "rewardsClaimed" END
        WHERE id = v_session_id AND "userId" = p_user_id;
    ELSE
        -- Overlap guard: the backdated start can never precede the end of
        -- the user's most recent ended session (minus 60s grace) — the
        -- insert path can only fill REAL wall-clock gaps in the user's
        -- own history, bounded by the 30-minute cap above.
        SELECT MAX("endedAt") INTO v_last_end
        FROM public."StudySession"
        WHERE "userId" = p_user_id AND "endedAt" IS NOT NULL;

        v_started_at := NOW() - ((v_actual_seconds + v_break_seconds) || ' seconds')::INTERVAL;
        IF v_last_end IS NOT NULL THEN
            v_started_at := GREATEST(v_started_at, v_last_end - INTERVAL '60 seconds');
        END IF;

        -- Wall-consistency clamp: the stored/credited duration can never
        -- exceed the guarded window + 60s grace, exactly like the session
        -- branch. (The overlap guard alone shifts startedAt; this clamp
        -- actually bounds the credited seconds.)
        v_wall_seconds := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - v_started_at))));
        v_actual_seconds := LEAST(v_actual_seconds, v_wall_seconds + 60);
        v_break_seconds := LEAST(v_break_seconds, GREATEST(0, v_wall_seconds + 60 - v_actual_seconds));

        IF (v_actual_seconds + v_break_seconds) > 0 THEN
            v_focus_rate_actual := ROUND(100.0 * v_actual_seconds / (v_actual_seconds + v_break_seconds));
        ELSE
            v_focus_rate_actual := 80;
        END IF;
        v_delta_seconds := GREATEST(0, v_actual_seconds - v_previous_seconds);

        INSERT INTO public."StudySession" (
            "userId", "questId", "subjectId", "durationMinutes", "durationSeconds", "breakSeconds", "focusRate",
            "rewardsClaimed", "startedAt", "endedAt"
        ) VALUES (
            p_user_id, p_quest_id, p_subject_id,
            FLOOR(v_actual_seconds / 60.0), v_actual_seconds, v_break_seconds, v_focus_rate_actual,
            p_is_final,
            v_started_at,
            CASE WHEN p_is_final THEN NOW() ELSE NULL END
        )
        RETURNING id INTO v_session_id;
        v_stored_seconds := v_actual_seconds;
    END IF;

    -- 6. Lifetime study totals advance strictly by the delta.
    IF v_delta_seconds > 0 THEN
        v_new_total_seconds := COALESCE(v_user."totalStudySeconds", 0) + v_delta_seconds;
        UPDATE public."User"
        SET "totalStudySeconds" = v_new_total_seconds,
            "totalStudyMinutes" = FLOOR(v_new_total_seconds / 60.0)
        WHERE id = p_user_id;
    END IF;

    -- 7. Quest elapsed advances strictly by the delta.
    IF v_quest_found AND v_delta_seconds > 0 THEN
        UPDATE public."Quest"
        -- Actual progress does not advance the structural execution generation.
        SET "elapsedSeconds" = "elapsedSeconds" + v_delta_seconds
        WHERE id = p_quest_id;
        v_quest."elapsedSeconds" := v_quest."elapsedSeconds" + v_delta_seconds;
    END IF;

    -- 8. Progression baseline (canonical curve — never trust stored thresholds).
    v_level := v_user.level;
    v_current_xp := v_user."currentXP";
    v_xp_threshold := public.canonical_xp_for_next_level(v_level);
    v_rank := v_user."hunterRank";
    v_previous_rank := v_user."hunterRank";

    -- 9. Focus-session time rewards (single award point: final flush or direct insert).
    v_award_eligible := (p_is_final OR v_was_insert)
                        AND (v_delta_seconds > 0 OR v_previous_seconds = 0);
    IF v_award_eligible AND v_actual_seconds >= 60 THEN
        v_session_minutes := v_actual_seconds / 60.0;

        IF v_session_minutes >= 120 THEN
            v_session_multiplier := 1.3;
        ELSIF v_session_minutes >= 60 THEN
            v_session_multiplier := 1.2;
        ELSIF v_session_minutes >= 30 THEN
            v_session_multiplier := 1.1;
        ELSE
            v_session_multiplier := 1.0;
        END IF;

        v_session_xp := FLOOR(5 * v_session_minutes * v_session_multiplier);
        v_session_sylph := GREATEST(5, FLOOR(0.5 * v_session_minutes * v_streak_multiplier));
    END IF;

    -- 10. Quest completion & node settlement (only for open quests).
    IF v_quest_found AND v_quest_open THEN
        v_target_seconds := COALESCE(v_quest."targetMinutes", v_quest."requiredMinutes", 45) * 60;
        v_should_complete := (p_complete_quest = TRUE) OR (v_quest."plannedMinutes" IS NULL AND v_quest."elapsedSeconds" >= v_target_seconds);

        IF v_should_complete THEN
            v_quest_completed := TRUE;
            v_full := (v_quest."elapsedSeconds" >= v_target_seconds);
            v_ratio := LEAST(1.0, CASE WHEN v_target_seconds > 0 THEN v_quest."elapsedSeconds"::NUMERIC / v_target_seconds ELSE 1.0 END);

            v_base_xp := CASE WHEN v_full THEN v_quest."xpReward" ELSE FLOOR(v_quest."xpReward" * v_ratio) END;
            v_base_sylph := CASE WHEN v_full THEN v_quest."sylphReward" ELSE FLOOR(v_quest."sylphReward" * v_ratio) END;

            -- Early-completion bonus (parity with claim_quest_reward).
            v_today := COALESCE(NULLIF(p_user_local_date, ''), TO_CHAR(NOW(), 'YYYY-MM-DD'));
            IF v_quest."scheduledFor" IS NOT NULL AND v_quest."scheduledFor" <> '' AND v_today < v_quest."scheduledFor" THEN
                v_early := TRUE;
                v_base_xp := FLOOR(v_base_xp * 1.2);
                v_base_sylph := FLOOR(v_base_sylph * 1.2);
            END IF;

            -- Gate Key multiplier (parity with claim_quest_reward).
            IF v_quest."isGateKeyApplied" THEN
                v_base_xp := v_base_xp * 2;
                v_base_sylph := v_base_sylph * 2;
            END IF;

            -- Streak multiplier applies to Sylph (parity with claim_quest_reward).
            v_base_sylph := FLOOR(v_base_sylph * v_streak_multiplier);
            v_quest_xp := GREATEST(0, v_base_xp);
            v_quest_sylph := GREATEST(0, v_base_sylph);

            -- HP restoration (parity with claim_quest_reward: +20 up to max).
            IF v_user.hp < v_user."maxHp" THEN
                v_hp_healed := LEAST(20, v_user."maxHp" - v_user.hp);
                v_new_hp := v_user.hp + v_hp_healed;
            ELSE
                v_new_hp := v_user.hp;
            END IF;

            UPDATE public."Quest"
            SET "executionVersion" = CASE WHEN "plannedMinutes" IS NULL THEN "executionVersion" ELSE "executionVersion"+1 END,
              "remainingDisposition" = CASE WHEN "plannedMinutes" IS NULL THEN "remainingDisposition" ELSE 'COMPLETED' END,
              "remainingMinutesEstimate" = CASE WHEN "plannedMinutes" IS NULL THEN "remainingMinutesEstimate" ELSE 0 END,
              status = 'COMPLETED',
                "completedAt" = NOW()
            WHERE id = p_quest_id;

            -- Node progress mirrors the reward: full scope weight at full
            -- completion, scaled by studied time otherwise.
            IF v_node_found THEN
                v_new_progress := CASE WHEN v_full
                    THEN LEAST(100.0, GREATEST(5.0, FLOOR(v_quest."scopeWeight" * 100)))
                    ELSE LEAST(100.0, GREATEST(0.0, FLOOR(v_quest."scopeWeight" * 100 * v_ratio)))
                END;
            END IF;
        ELSE
            -- Quest still open: advance the node proportionally to THIS flush's delta.
            IF v_node_found AND v_delta_seconds >= 30 THEN
                v_raw_progress := FLOOR(v_quest."scopeWeight" * 100 * LEAST(1.0, v_delta_seconds::NUMERIC / NULLIF(v_target_seconds, 0)));
                v_new_progress := LEAST(100.0, GREATEST(1.0, v_raw_progress));
            END IF;
        END IF;

        IF v_new_progress IS NOT NULL AND v_new_progress > 0 AND v_node_found THEN
            UPDATE public."SubjectNode"
            SET progress = LEAST(100, v_node.progress + v_new_progress),
                "isMastered" = CASE WHEN v_node.progress + v_new_progress >= 100 THEN TRUE ELSE "isMastered" END,
                "masteredAt" = CASE WHEN v_node.progress + v_new_progress >= 100 AND NOT v_node.isMastered THEN NOW() ELSE "masteredAt" END,
                "updatedAt" = CURRENT_TIMESTAMP
            WHERE id = v_node_id;
            v_mastery_granted := (NOT v_node.isMastered) AND (v_node.progress + v_new_progress >= 100);
        END IF;
    END IF;

    -- 11. Combined XP / level-up processing (single pass, single User write).
    v_total_xp := v_session_xp + v_quest_xp;
    v_total_sylph := v_session_sylph + v_quest_sylph;

    IF v_total_xp > 0 THEN
        v_current_xp := v_current_xp + v_total_xp;
        WHILE v_current_xp >= v_xp_threshold LOOP
            v_current_xp := v_current_xp - v_xp_threshold;
            v_level := v_level + 1;
            v_levels_gained := v_levels_gained + 1;
            v_xp_threshold := public.canonical_xp_for_next_level(v_level);
        END LOOP;

        v_rank := public.canonical_rank_display(v_level);
        v_did_rank_up := (v_rank <> v_previous_rank);

        IF v_levels_gained > 0 THEN
            v_level_up_sylph := v_level * 300;
            v_total_sylph := v_total_sylph + v_level_up_sylph;
        END IF;

        -- SP stipend: +2 SP per level gained, +5 SP per rank up.
        v_level_up_sp := v_levels_gained * 2;
        v_rank_up_sp := CASE WHEN v_did_rank_up THEN 5 ELSE 0 END;
    END IF;

    -- 12. Single atomic User + UserStats mutation.
    IF v_total_xp > 0 OR v_total_sylph > 0 OR v_hp_healed > 0 THEN
        UPDATE public."User"
        SET level = v_level,
            "currentXP" = v_current_xp,
            "xpToNextLevel" = v_xp_threshold,
            "hunterRank" = v_rank,
            sylph = sylph + v_total_sylph,
            hp = CASE WHEN v_hp_healed > 0 THEN v_new_hp ELSE hp END
        WHERE id = p_user_id;

        v_lifetime_xp := public.canonical_required_xp(v_level) + v_current_xp;
        v_rank_db := public.canonical_rank_db(v_level);

        UPDATE public."UserStats"
        SET xp = v_lifetime_xp,
            level = v_level,
            rank = v_rank_db,
            currency = currency + v_total_sylph,
            "skillPoints" = "skillPoints" + v_level_up_sp + v_rank_up_sp,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "userId" = p_user_id;
    END IF;

    -- 13. Audit ledgers.
    IF v_session_xp > 0 THEN
        INSERT INTO public."XpLedger" ("userId", amount, "balanceAfter", reason, source, metadata, "createdAt")
        VALUES (p_user_id, v_session_xp, public.canonical_required_xp(v_level) + v_current_xp,
                'FOCUS_SESSION', 'TIMER', jsonb_build_object('sessionId', v_session_id), NOW());
    END IF;

    IF v_quest_xp > 0 THEN
        INSERT INTO public."XpLedger" ("userId", amount, "balanceAfter", reason, source, metadata, "createdAt")
        VALUES (p_user_id, v_quest_xp, public.canonical_required_xp(v_level) + v_current_xp,
                'SESSION_QUEST_REWARD', 'QUEST',
                jsonb_build_object('sessionId', v_session_id, 'questId', p_quest_id), NOW());
    END IF;

    IF v_session_sylph > 0 THEN
        INSERT INTO public."SylphLedger" ("userId", amount, source, "createdAt")
        VALUES (p_user_id, v_session_sylph, 'TIMER', NOW());
    END IF;

    IF v_quest_sylph > 0 THEN
        INSERT INTO public."SylphLedger" ("userId", amount, source, "createdAt")
        VALUES (p_user_id, v_quest_sylph, 'QUEST', NOW());
    END IF;

    IF v_level_up_sylph > 0 THEN
        INSERT INTO public."SylphLedger" ("userId", amount, source, "createdAt")
        VALUES (p_user_id, v_level_up_sylph, 'LEVEL_UP', NOW());
    END IF;

    IF v_hp_healed > 0 THEN
        INSERT INTO public."HpLedger" ("userId", amount, source, "createdAt")
        VALUES (p_user_id, v_hp_healed, 'QUEST_REWARD_HEAL', NOW());
    END IF;

    -- 14. System messages.
    IF v_quest_completed THEN
        INSERT INTO public."SystemMessage" ("userId", content, type, read, "createdAt")
        VALUES (
            p_user_id,
            CASE WHEN v_full
                THEN '**🏆 QUEST COMPLETED: ' || v_quest.title || '**\n\nTarget Duration: ' || COALESCE(v_quest."targetMinutes", v_quest."requiredMinutes", 45) || ' mins.\n\nRewards Claimed: **+' || v_quest_xp || ' XP** • **+' || v_quest_sylph || ' Sylph**.'
                ELSE '**🏆 QUEST COMPLETED EARLY: ' || v_quest.title || '**\n\nRewards Claimed: **+' || v_quest_xp || ' XP** • **+' || v_quest_sylph || ' Sylph** (full reward unlocks at ' || COALESCE(v_quest."targetMinutes", v_quest."requiredMinutes", 45) || ' mins).'
            END,
            'REWARD', false, NOW()
        );
    END IF;

    IF v_mastery_granted THEN
        INSERT INTO public."SystemMessage" ("userId", content, type, read, "createdAt")
        VALUES (
            p_user_id,
            '**🎯 SYLLABUS NODE MASTERED: ' || v_node.title || '**\n\nYou achieved 100% mastery on node **' || v_node."nodeId" || '**!\n\nReward Minted: **+' || COALESCE(v_node."spAward", 0) || ' Subject SP**.',
            'REWARD', false, NOW()
        );
    END IF;

    IF v_levels_gained > 0 THEN
        v_rank_up_text := CASE WHEN v_did_rank_up THEN E'\n\nRank Up! You are now a ' || v_rank || E'-Rank Hunter.' ELSE '' END;
        INSERT INTO public."SystemMessage" ("userId", content, type, read, "createdAt")
        VALUES (
            p_user_id,
            E'**Level Up**\n\nYou have reached Level ' || v_level || '.' || v_rank_up_text || E'\n\nStipend: +' || v_level_up_sylph || E' Sylph • +' || (v_level_up_sp + v_rank_up_sp) || E' SP\n\nYou have grown stronger.',
            'LEVEL_UP', false, NOW()
        );
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'sessionId', v_session_id,
        'isFinal', p_is_final,
        'alreadyClaimed', (p_is_final AND v_claimed),
        'durationSeconds', v_stored_seconds,
        'breakSeconds', GREATEST(v_break_seconds, v_previous_break),
        'deltaSeconds', v_delta_seconds,
        'awarded', v_award_eligible AND v_actual_seconds >= 60,
        'xpGained', v_session_xp,
        'sylphGained', v_session_sylph,
        'totalSylphEarned', v_total_sylph,
        'questCompleted', v_quest_completed,
        'questXp', v_quest_xp,
        'questSylph', v_quest_sylph,
        'hpHealed', v_hp_healed,
        'level', v_level,
        'currentXP', v_current_xp,
        'xpToNextLevel', v_xp_threshold,
        'hunterRank', v_rank,
        'levelsGained', v_levels_gained,
        'didRankUp', v_did_rank_up,
        'nodeProgress', v_new_progress,
        'masteryGranted', v_mastery_granted
    );
END;
$$;

-- Effective claim_quest_reward: original economic ledger, user-first coordination and V2 admission.
CREATE OR REPLACE FUNCTION public.claim_quest_reward(
    p_user_id INT,
    p_quest_id INT,
    p_user_local_date TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quest RECORD;
  v_user RECORD;
  v_today TEXT;
  v_is_late BOOLEAN := FALSE;
  v_is_early BOOLEAN := FALSE;
  v_penalty INT := 10;
  v_new_hp INT;
  v_final_xp INT;
  v_final_sylph INT;
  v_multiplier NUMERIC := 1.0;
  v_level INT;
  v_current_xp INT;
  v_xp_threshold INT;
  v_rank TEXT;
  v_previous_rank TEXT;
  v_levels_gained INT := 0;
  v_did_rank_up BOOLEAN := FALSE;
  v_level_up_sylph INT := 0;
  v_level_up_sp INT := 0;
  v_rank_up_sp INT := 0;
  v_total_sylph_earned INT;
  v_hp_healed INT := 0;
  v_rank_up_text TEXT;
  v_early_bonus_text TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(73641,p_user_id);
  IF EXISTS (SELECT 1 FROM "Quest" WHERE id=p_quest_id AND "userId"=p_user_id AND "plannedMinutes" IS NOT NULL)
    AND current_setting('sylf.planner_v2_execution_quest',true) IS DISTINCT FROM p_quest_id::text THEN
    RAISE EXCEPTION 'PLANNER_EXECUTION_PROTOCOL_REQUIRED' USING ERRCODE='23514'; END IF;
  IF EXISTS (SELECT 1 FROM "Quest" WHERE id=p_quest_id AND "remainingDisposition"='WITHDRAWN') THEN
    RAISE EXCEPTION 'PLANNER_WITHDRAWN_COMPLETION_FORBIDDEN' USING ERRCODE='23514'; END IF;
  -- Fetch & lock Quest
  SELECT * INTO v_quest
  FROM public."Quest"
  WHERE id = p_quest_id AND "userId" = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quest not found: %', p_quest_id;
  END IF;

  IF v_quest.status = 'COMPLETED' THEN
    RAISE EXCEPTION 'Quest already completed: %', p_quest_id;
  END IF;

  -- Fetch & lock User
  SELECT * INTO v_user
  FROM public."User"
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;

  v_today := COALESCE(p_user_local_date, TO_CHAR(NOW(), 'YYYY-MM-DD'));

  -- Check deadline
  IF v_quest."scheduledFor" IS NOT NULL AND v_quest."scheduledFor" <> '' THEN
    IF v_today > v_quest."scheduledFor" THEN
      v_is_late := TRUE;
    ELSIF v_today < v_quest."scheduledFor" THEN
      v_is_early := TRUE;
    END IF;
  END IF;

  -- If late, process as failed quest with penalty
  IF v_is_late THEN
    IF v_quest.difficulty = 'EASY' THEN v_penalty := 5;
    ELSIF v_quest.difficulty = 'NORMAL' THEN v_penalty := 10;
    ELSIF v_quest.difficulty = 'HARD' THEN v_penalty := 20;
    ELSIF v_quest.difficulty = 'EXPERT' THEN v_penalty := 40;
    END IF;

    IF v_quest."isGateKeyApplied" THEN v_penalty := v_penalty * 3; END IF;
    IF v_quest."isKamishWardActive" THEN v_penalty := 0; END IF;

    v_new_hp := GREATEST(0, v_user.hp - v_penalty);

    UPDATE public."Quest"
    SET status = 'FAILED', "executionVersion"=CASE WHEN "plannedMinutes" IS NULL THEN "executionVersion" ELSE "executionVersion"+1 END
    WHERE id = p_quest_id;

    UPDATE public."User"
    SET hp = v_new_hp
    WHERE id = p_user_id;

    IF v_penalty > 0 THEN
      INSERT INTO public."HpLedger" ("userId", amount, source, "createdAt")
      VALUES (p_user_id, -v_penalty, 'QUEST_FAILED_LATE', NOW());
    END IF;

    INSERT INTO public."SystemMessage" ("userId", content, type, read, "createdAt")
    VALUES (
      p_user_id,
      E'**Quest Failed (Late)**\n\n"' || v_quest.title || E'" was completed past its deadline of ' || v_quest."scheduledFor" || E'.\n\nPenalty: -' || v_penalty || E' HP',
      'WARNING',
      false,
      NOW()
    );

    RETURN jsonb_build_object(
      'success', true,
      'questId', p_quest_id,
      'status', 'FAILED',
      'penalty', jsonb_build_object('hpLost', v_penalty, 'currentHp', v_new_hp)
    );
  END IF;

  -- Calculate Rewards
  v_final_xp := v_quest."xpReward";
  v_final_sylph := v_quest."sylphReward";

  IF v_is_early THEN
    v_final_xp := FLOOR(v_final_xp * 1.2);
    v_final_sylph := FLOOR(v_final_sylph * 1.2);
  END IF;

  IF v_quest."isGateKeyApplied" THEN
    v_final_xp := v_final_xp * 2;
    v_final_sylph := v_final_sylph * 2;
  END IF;

  -- Streak multiplier
  IF v_user."streakDays" >= 8 THEN v_multiplier := 1.5;
  ELSIF v_user."streakDays" >= 4 THEN v_multiplier := 1.3;
  ELSIF v_user."streakDays" >= 2 THEN v_multiplier := 1.15;
  ELSIF v_user."streakDays" >= 1 THEN v_multiplier := 1.05;
  ELSE v_multiplier := 1.0;
  END IF;

  v_final_sylph := FLOOR(v_final_sylph * v_multiplier);

  -- Level up loop — CANONICAL curve (floor(100 * L^1.5)).
  -- The stored legacy threshold is ignored; it is always recomputed.
  v_level := v_user.level;
  v_current_xp := v_user."currentXP" + v_final_xp;
  v_xp_threshold := public.canonical_xp_for_next_level(v_level);
  v_previous_rank := v_user."hunterRank";

  WHILE v_current_xp >= v_xp_threshold LOOP
    v_current_xp := v_current_xp - v_xp_threshold;
    v_level := v_level + 1;
    v_levels_gained := v_levels_gained + 1;
    v_xp_threshold := public.canonical_xp_for_next_level(v_level);
  END LOOP;

  -- Canonical 8-tier rank ladder: 10/25/50/75/100/125/150
  v_rank := public.canonical_rank_display(v_level);
  v_did_rank_up := (v_rank <> v_previous_rank);

  IF v_levels_gained > 0 THEN
    v_level_up_sylph := v_level * 300;
  END IF;

  -- SP stipend: +2 SP per level gained, +5 SP per rank up.
  v_level_up_sp := v_levels_gained * 2;
  v_rank_up_sp := CASE WHEN v_did_rank_up THEN 5 ELSE 0 END;
  v_total_sylph_earned := v_final_sylph + v_level_up_sylph;

  -- HP restoration
  IF v_user.hp < v_user."maxHp" THEN
    v_hp_healed := LEAST(20, v_user."maxHp" - v_user.hp);
    v_new_hp := v_user.hp + v_hp_healed;
  ELSE
    v_new_hp := v_user.hp;
  END IF;

  -- Apply updates
  UPDATE public."Quest"
  SET "executionVersion" = CASE WHEN "plannedMinutes" IS NULL THEN "executionVersion" ELSE "executionVersion"+1 END,
              "remainingDisposition" = CASE WHEN "plannedMinutes" IS NULL THEN "remainingDisposition" ELSE 'COMPLETED' END,
              "remainingMinutesEstimate" = CASE WHEN "plannedMinutes" IS NULL THEN "remainingMinutesEstimate" ELSE 0 END,
              status = 'COMPLETED',
      "completedAt" = NOW()
  WHERE id = p_quest_id;

  UPDATE public."User"
  SET level = v_level,
      "currentXP" = v_current_xp,
      "xpToNextLevel" = v_xp_threshold,
      "hunterRank" = v_rank,
      sylph = sylph + v_total_sylph_earned,
      hp = v_new_hp
  WHERE id = p_user_id;

  -- Mirror lifetime XP into UserStats (canonical cumulative store)
  -- Lifetime = XP accumulated below the current level + XP within it.
  INSERT INTO public."UserStats" ("userId", "level", "xp", "rank", "currency", "skillPoints",
      "endurance", "tenacity", "velocity", "discipline", "synthesis", "updatedAt")
  VALUES (p_user_id, v_level,
          public.canonical_required_xp(v_level) + v_current_xp,
          public.canonical_rank_db(v_level), v_total_sylph_earned, v_level_up_sp + v_rank_up_sp, 10, 10, 10, 10, 10, CURRENT_TIMESTAMP)
  ON CONFLICT ("userId") DO UPDATE SET
      xp = public.canonical_required_xp(v_level) + v_current_xp,
      level = EXCLUDED.level,
      rank = EXCLUDED.rank,
      currency = "UserStats".currency + v_total_sylph_earned,
      "skillPoints" = "UserStats"."skillPoints" + v_level_up_sp + v_rank_up_sp,
      "updatedAt" = CURRENT_TIMESTAMP;

  -- Audit & Messages
  IF v_final_xp > 0 THEN
    INSERT INTO public."XpLedger" ("userId", amount, "balanceAfter", reason, source, metadata, "createdAt")
    VALUES (p_user_id, v_final_xp,
            public.canonical_required_xp(v_level) + v_current_xp,
            'QUEST_COMPLETE', 'QUEST', jsonb_build_object('questId', p_quest_id), NOW());
  END IF;

  IF v_final_sylph > 0 THEN
    INSERT INTO public."SylphLedger" ("userId", amount, source, "createdAt")
    VALUES (p_user_id, v_final_sylph, 'QUEST', NOW());
  END IF;

  IF v_level_up_sylph > 0 THEN
    INSERT INTO public."SylphLedger" ("userId", amount, source, "createdAt")
    VALUES (p_user_id, v_level_up_sylph, 'LEVEL_UP', NOW());
  END IF;

  IF v_hp_healed > 0 THEN
    INSERT INTO public."HpLedger" ("userId", amount, source, "createdAt")
    VALUES (p_user_id, v_hp_healed, 'QUEST_REWARD_HEAL', NOW());
  END IF;

  v_early_bonus_text := CASE WHEN v_is_early THEN E'\n(Includes 20% Early Completion Bonus!)' ELSE '' END;

  INSERT INTO public."SystemMessage" ("userId", content, type, read, "createdAt")
  VALUES (
    p_user_id,
    E'**Quest Complete**\n\n"' || v_quest.title || E'"\n\nRewards Obtained:\n• +' || v_final_xp || E' XP\n• +' || v_final_sylph || E' Sylph' || CASE WHEN v_multiplier > 1.0 THEN ' (Streak x' || v_multiplier || ')' ELSE '' END || v_early_bonus_text,
    'REWARD',
    false,
    NOW()
  );

  IF v_levels_gained > 0 THEN
    v_rank_up_text := CASE WHEN v_did_rank_up THEN E'\n\nRANK UP: ' || v_previous_rank || E'-Rank → ' || v_rank || E'-Rank' ELSE '' END;
    INSERT INTO public."SystemMessage" ("userId", content, type, read, "createdAt")
    VALUES (
      p_user_id,
      E'**Level Up**\n\nYou have reached Level ' || v_level || '.' || v_rank_up_text || E'\n\nStipend: +' || v_level_up_sylph || E' Sylph • +' || (v_level_up_sp + v_rank_up_sp) || E' SP\n\nYou have grown stronger.',
      'LEVEL_UP',
      false,
      NOW()
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'questId', p_quest_id,
    'status', 'COMPLETED',
    'xpGained', v_final_xp,
    'sylphGained', v_final_sylph,
    'totalSylphEarned', v_total_sylph_earned,
    'hpHealed', v_hp_healed,
    'currentHp', v_new_hp,
    'level', v_level,
    'currentXP', v_current_xp,
    'xpToNextLevel', v_xp_threshold,
    'hunterRank', v_rank,
    'levelsGained', v_levels_gained,
    'didRankUp', v_did_rank_up
  );
END;
$$;

-- Effective complete_study_session: original economic ledger, user-first coordination and V2 admission.
CREATE OR REPLACE FUNCTION public.complete_study_session(
    p_user_id INT,
    p_session_id INT DEFAULT NULL,
    p_duration_minutes INT DEFAULT 0,
    p_duration_seconds INT DEFAULT 0,
    p_quest_id INT DEFAULT NULL,
    p_subject_id INT DEFAULT NULL,
    p_break_seconds INT DEFAULT 0,
    p_focus_rate INT DEFAULT 80,
    p_is_final BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
  v_actual_seconds INT;
  v_break_seconds INT;
  v_focus_rate_actual INT;
  v_previous_seconds INT := 0;
  v_delta_seconds INT := 0;
  v_stored_seconds INT;
  v_new_total_seconds INT;
  v_was_insert BOOLEAN := FALSE;
  v_award_eligible BOOLEAN := FALSE;
  v_minutes NUMERIC;
  v_streak_multiplier NUMERIC := 1.0;
  v_session_multiplier NUMERIC := 1.0;
  v_xp_gained INT := 0;
  v_final_sylph INT := 0;
  v_total_sylph_earned INT := 0;
  v_level INT;
  v_current_xp INT;
  v_xp_threshold INT;
  v_rank TEXT;
  v_rank_db TEXT;
  v_previous_rank TEXT;
  v_levels_gained INT := 0;
  v_did_rank_up BOOLEAN := FALSE;
  v_level_up_sylph INT := 0;
  v_session_id INT := p_session_id;
  v_lifetime_xp INT;
  v_rank_up_text TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(73641,p_user_id);
  IF EXISTS (SELECT 1 FROM "StudySession" WHERE id=p_session_id AND "userId"=p_user_id AND "executionState" IS NOT NULL)
    AND current_setting('sylf.planner_v2_session_transition',true) IS DISTINCT FROM p_session_id::text THEN
    RAISE EXCEPTION 'PLANNER_EXECUTION_PROTOCOL_REQUIRED' USING ERRCODE='23514'; END IF;
  -- ══ S2 identity guard (20260827000000) — never trust caller-supplied p_user_id ══
  -- The app reaches this function as role postgres/supabase_admin. Any other
  -- role must prove its JWT subject equals p_user_id before anything runs.
  IF current_user NOT IN ('postgres', 'supabase_admin') THEN
    IF COALESCE((auth.jwt() ->> 'sub'), NULLIF(current_setting('request.jwt.claim.sub', true), ''), '') <> p_user_id::text THEN
      RAISE EXCEPTION 'S2 identity guard: caller identity does not match p_user_id' USING ERRCODE = '42501';
    END IF;
  END IF;
  -- Lock the StudySession claim anchor FIRST (fixed lock order:
  -- StudySession → User → UserStats) and capture the previously
  -- credited duration for exact delta accounting.
  IF v_session_id IS NOT NULL THEN
    SELECT "durationSeconds"
    INTO v_previous_seconds
    FROM public."StudySession"
    WHERE id = v_session_id AND "userId" = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Session not found: %', v_session_id;
    END IF;
    v_previous_seconds := COALESCE(v_previous_seconds, 0);
  END IF;

  -- Fetch and lock user row for atomic update
  SELECT id, level, "currentXP", "xpToNextLevel", "hunterRank", sylph, "streakDays",
         "totalStudyMinutes", "totalStudySeconds"
  INTO v_user
  FROM public."User"
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;

  -- Normalize the claimed duration (server-clamped upstream).
  v_actual_seconds := GREATEST(0, COALESCE(p_duration_seconds, p_duration_minutes * 60));
  v_break_seconds := GREATEST(0, COALESCE(p_break_seconds, 0));

  -- focusRate = share of ACTIVE session time that was focus (never 0/0 → 80).
  IF (v_actual_seconds + v_break_seconds) > 0 THEN
    v_focus_rate_actual := ROUND(100.0 * v_actual_seconds / (v_actual_seconds + v_break_seconds));
  ELSE
    v_focus_rate_actual := 80;
  END IF;

  -- EXACT PARITY: only the new portion since the last credit counts.
  v_delta_seconds := GREATEST(0, v_actual_seconds - v_previous_seconds);

  -- Session row is SET to the exact cumulative duration (never +=).
  -- Stored duration is MONOTONIC so a lagging/duplicate client flush can
  -- never regress a previously-flushed higher value.
  IF v_session_id IS NOT NULL THEN
    v_stored_seconds := GREATEST(v_actual_seconds, v_previous_seconds);
    UPDATE public."StudySession"
    SET "durationMinutes" = FLOOR(v_stored_seconds / 60.0),
        "durationSeconds" = v_stored_seconds,
        "breakSeconds" = GREATEST(v_break_seconds, "breakSeconds"),
        "focusRate" = v_focus_rate_actual,
        "endedAt" = CASE WHEN p_is_final THEN NOW() ELSE "endedAt" END
    WHERE id = v_session_id AND "userId" = p_user_id;
  ELSE
    v_was_insert := TRUE;
    v_stored_seconds := v_actual_seconds;
    INSERT INTO public."StudySession" (
      "userId", "questId", "subjectId", "durationMinutes", "durationSeconds", "breakSeconds", "focusRate", "startedAt", "endedAt"
    ) VALUES (
      p_user_id, p_quest_id, p_subject_id,
      FLOOR(v_actual_seconds / 60.0), v_actual_seconds, v_break_seconds, v_focus_rate_actual,
      NOW() - (v_actual_seconds || ' seconds')::INTERVAL, CASE WHEN p_is_final THEN NOW() ELSE NULL END
    )
    RETURNING id INTO v_session_id;
  END IF;

  -- Lifetime study totals advance ONLY by the delta — minutes stay
  -- exactly floor(totalSeconds / 60) at all times.
  IF v_delta_seconds > 0 THEN
    v_new_total_seconds := COALESCE(v_user."totalStudySeconds", 0) + v_delta_seconds;
    UPDATE public."User"
    SET "totalStudySeconds" = v_new_total_seconds,
        "totalStudyMinutes" = FLOOR(v_new_total_seconds / 60.0)
    WHERE id = p_user_id;
  END IF;

  -- Quest elapsed time advances ONLY by the delta as well.
  IF p_quest_id IS NOT NULL AND v_delta_seconds > 0 THEN
    UPDATE public."Quest"
    SET "elapsedSeconds" = "elapsedSeconds" + v_delta_seconds
    WHERE id = p_quest_id AND "userId" = p_user_id;
  END IF;

  -- ─── Canonical rewards — awarded exactly ONCE per session ───
  -- Final flush (or direct completion) is the single award point;
  -- intermediate auto-save flushes never award. Retrying the final
  -- flush yields delta = 0 and is therefore ineligible.
  v_award_eligible := (p_is_final OR v_was_insert)
                      AND (v_delta_seconds > 0 OR v_previous_seconds = 0);

  v_level := v_user.level;
  v_current_xp := v_user."currentXP";
  v_xp_threshold := public.canonical_xp_for_next_level(v_level); -- canonical, never trust stored legacy value
  v_rank := v_user."hunterRank";
  v_previous_rank := v_user."hunterRank";

  IF v_award_eligible AND v_actual_seconds >= 60 THEN
    v_minutes := v_actual_seconds / 60.0;

    -- Long-session multiplier = xpMultiplier in the canonical formula.
    IF v_minutes >= 120 THEN
      v_session_multiplier := 1.3;
    ELSIF v_minutes >= 60 THEN
      v_session_multiplier := 1.2;
    ELSIF v_minutes >= 30 THEN
      v_session_multiplier := 1.1;
    ELSE
      v_session_multiplier := 1.0;
    END IF;

    -- Streak multiplier = sylphMultiplier in the canonical formula.
    IF v_user."streakDays" >= 8 THEN
      v_streak_multiplier := 1.5;
    ELSIF v_user."streakDays" >= 4 THEN
      v_streak_multiplier := 1.3;
    ELSIF v_user."streakDays" >= 2 THEN
      v_streak_multiplier := 1.15;
    ELSIF v_user."streakDays" >= 1 THEN
      v_streak_multiplier := 1.05;
    ELSE
      v_streak_multiplier := 1.0;
    END IF;

    -- Canonical unified difficulty formula:
    --   XP    = FLOOR(5 × minutes × xpMultiplier)
    --   Sylph = MAX(5, FLOOR(0.5 × minutes × sylphMultiplier))
    v_xp_gained := FLOOR(5 * v_minutes * v_session_multiplier);
    v_final_sylph := GREATEST(5, FLOOR(0.5 * v_minutes * v_streak_multiplier));

    -- Award XP & process multi-level up loop — CANONICAL curve
    v_current_xp := v_current_xp + v_xp_gained;
    WHILE v_current_xp >= v_xp_threshold LOOP
      v_current_xp := v_current_xp - v_xp_threshold;
      v_level := v_level + 1;
      v_levels_gained := v_levels_gained + 1;
      v_xp_threshold := public.canonical_xp_for_next_level(v_level);
    END LOOP;

    -- Canonical 8-tier rank ladder: 10/25/50/75/100/125/150
    v_rank := public.canonical_rank_display(v_level);
    v_did_rank_up := (v_rank <> v_previous_rank);

    -- Level up stipend
    IF v_levels_gained > 0 THEN
      v_level_up_sylph := v_level * 300;
    END IF;
    v_total_sylph_earned := v_final_sylph + v_level_up_sylph;

    -- Atomic user progression update (rewards only; totals updated above)
    UPDATE public."User"
    SET level = v_level,
        "currentXP" = v_current_xp,
        "xpToNextLevel" = v_xp_threshold,
        "hunterRank" = v_rank,
        sylph = sylph + v_total_sylph_earned
    WHERE id = p_user_id;

    -- Mirror lifetime XP into UserStats (canonical cumulative store)
    v_lifetime_xp := public.canonical_required_xp(v_level) + v_current_xp;
    v_rank_db := public.canonical_rank_db(v_level);

    INSERT INTO public."UserStats" ("userId", "level", "xp", "rank", "currency", "skillPoints",
        "endurance", "tenacity", "velocity", "discipline", "synthesis", "updatedAt")
    VALUES (p_user_id, v_level, v_lifetime_xp, v_rank_db, v_total_sylph_earned, 0, 10, 10, 10, 10, 10, CURRENT_TIMESTAMP)
    ON CONFLICT ("userId") DO UPDATE SET
        xp = v_lifetime_xp,
        level = v_level,
        rank = v_rank_db,
        currency = "UserStats".currency + v_total_sylph_earned,
        "updatedAt" = CURRENT_TIMESTAMP;

    -- Audit Ledgers & Notifications
    IF v_xp_gained > 0 THEN
      INSERT INTO public."XpLedger" ("userId", amount, "balanceAfter", reason, source, metadata, "createdAt")
      VALUES (p_user_id, v_xp_gained, v_lifetime_xp, 'FOCUS_SESSION', 'TIMER',
              jsonb_build_object('sessionId', v_session_id), NOW());
    END IF;

    IF v_final_sylph > 0 THEN
      INSERT INTO public."SylphLedger" ("userId", amount, source, "createdAt")
      VALUES (p_user_id, v_final_sylph, 'TIMER', NOW());
    END IF;

    IF v_level_up_sylph > 0 THEN
      INSERT INTO public."SylphLedger" ("userId", amount, source, "createdAt")
      VALUES (p_user_id, v_level_up_sylph, 'LEVEL_UP', NOW());
    END IF;

    IF v_levels_gained > 0 THEN
      v_rank_up_text := CASE WHEN v_did_rank_up THEN E'\n\nRank Up! You are now a ' || v_rank || E'-Rank Hunter.' ELSE '' END;
      INSERT INTO public."SystemMessage" ("userId", content, type, read, "createdAt")
      VALUES (
        p_user_id,
        E'**Level Up**\n\nYou have reached Level ' || v_level || '.' || v_rank_up_text || E'\n\nStipend: +' || v_level_up_sylph || E' Sylph\n\nYou have grown stronger.',
        'LEVEL_UP',
        false,
        NOW()
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'sessionId', v_session_id,
    'userId', p_user_id,
    'durationMinutes', FLOOR(v_stored_seconds / 60.0),
    'durationSeconds', v_stored_seconds,
    'breakSeconds', v_break_seconds,
    'deltaSeconds', v_delta_seconds,
    'awarded', v_award_eligible AND v_actual_seconds >= 60,
    'xpGained', v_xp_gained,
    'sylphGained', v_final_sylph,
    'totalSylphEarned', v_total_sylph_earned,
    'level', v_level,
    'currentXP', v_current_xp,
    'xpToNextLevel', v_xp_threshold,
    'hunterRank', v_rank,
    'levelsGained', v_levels_gained,
    'didRankUp', v_did_rank_up
  );
END;
$$;

ALTER TABLE "StudySession" ADD COLUMN "executionContext" JSONB;

CREATE FUNCTION public.planner_v2_goal_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE owner_id int;
BEGIN
 owner_id:=COALESCE(NEW."userId",OLD."userId");
 IF TG_OP='DELETE' AND NOT EXISTS (SELECT 1 FROM "User" WHERE id=owner_id) THEN RETURN OLD; END IF;
 IF EXISTS (SELECT 1 FROM "PlannerPlan" WHERE "userId"=owner_id AND "contractVersion"=2) THEN
   PERFORM public.planner_v2_assert_coordinated(owner_id);
 END IF;
 IF TG_OP<>'INSERT' AND EXISTS (SELECT 1 FROM "PlannerPlan" WHERE "goalId"=OLD.id AND "contractVersion"=2) THEN
   IF TG_OP='DELETE' OR (to_jsonb(NEW)-'color') IS DISTINCT FROM (to_jsonb(OLD)-'color') THEN
     IF current_setting('sylf.planner_v2_apply_owner',true) IS DISTINCT FROM owner_id::text THEN RAISE EXCEPTION 'PLANNER_APPLY_REQUIRED' USING ERRCODE='23514'; END IF;
   END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER planner_v2_goal_guard BEFORE INSERT OR UPDATE OR DELETE ON "Goal" FOR EACH ROW EXECUTE FUNCTION public.planner_v2_goal_guard();
REVOKE ALL ON FUNCTION public.planner_v2_goal_guard() FROM PUBLIC,anon,authenticated,service_role;

-- Preserve the original legacy guard, with the canonical apply capability as
-- its one additional coordinated update path. Goal deletion remains protected.
CREATE OR REPLACE FUNCTION public.planner_goal_delete_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='DELETE' AND NOT EXISTS (SELECT 1 FROM "User" WHERE id=OLD."userId") THEN RETURN OLD; END IF;
 IF TG_OP='UPDATE' AND current_setting('sylf.planner_v2_apply_owner',true)=OLD."userId"::text THEN
   PERFORM public.planner_v2_assert_coordinated(OLD."userId");
   IF NEW.id<>OLD.id OR NEW."userId"<>OLD."userId" THEN RAISE EXCEPTION 'PLANNER_IDENTITY_IMMUTABLE' USING ERRCODE='23514'; END IF;
   RETURN NEW;
 END IF;
 IF EXISTS (SELECT 1 FROM "PlannerPlan" WHERE "goalId"=OLD.id) OR EXISTS
   (SELECT 1 FROM "PlannerQuestLink" l JOIN "Quest" q ON q.id=l."questId" WHERE q."goalId"=OLD.id) THEN
   IF TG_OP='DELETE' OR current_setting('sylf.planner_manual_goal',true) IS DISTINCT FROM OLD.id::text THEN
     RAISE EXCEPTION 'PLANNER_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;

-- Effective forge_apex_node_atomic: retain identity validation and economic ledgers; coordinate before row locks.
CREATE OR REPLACE FUNCTION public.forge_apex_node_atomic(
    p_user_id TEXT,
    p_subject_id TEXT,
    p_node_key TEXT
)
RETURNS TABLE (
    success BOOLEAN,
    already_forged BOOLEAN,
    xp_awarded INT,
    sylph_awarded INT,
    sp_awarded INT,
    new_level INT,
    new_xp_within_level INT,
    new_rank TEXT,
    new_total_xp INT,
    minted_sp INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id INT;
    v_subject_id INT;
    v_user RECORD;
    v_node_mastered BOOLEAN;
    v_minted_sp INT := 0;
    v_lifetime_xp INT;
    v_new_level INT;
    v_new_xp_within INT;
    v_new_next INT;
    v_new_rank TEXT;
    v_new_rank_db TEXT;
    v_synthesis INT;
    v_apex_extra_sp INT := 0;
    v_new_sylph INT;
BEGIN
    -- 1. Strict parameter validation (TEXT ids cast only after shape check)
    IF p_user_id IS NULL OR p_user_id !~ '^[0-9]+$' THEN
        RAISE EXCEPTION 'Invalid user id' USING ERRCODE = '22023';
    END IF;
    IF p_subject_id IS NULL OR p_subject_id !~ '^[0-9]+$' THEN
        RAISE EXCEPTION 'Invalid subject id' USING ERRCODE = '22023';
    END IF;
    IF p_node_key IS NULL OR p_node_key <> 'N10_1' THEN
        RAISE EXCEPTION 'Only the N10_1 Apex Keystone can be forged'
            USING ERRCODE = '22023';
    END IF;
    v_user_id := p_user_id::INT;
    PERFORM pg_advisory_xact_lock(73641,v_user_id);
    v_subject_id := p_subject_id::INT;

    -- 2. Acquire row locks in a fixed order: User → UserStats → SubjectNode
    --    (consistent ordering prevents deadlocks with other RPCs).
    SELECT * INTO v_user FROM "User" WHERE id = v_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found: %', v_user_id;
    END IF;

    INSERT INTO "UserStats" ("userId", "level", "xp", "rank", "currency", "skillPoints",
        "endurance", "tenacity", "velocity", "discipline", "synthesis", "updatedAt")
    VALUES (v_user_id, v_user.level, 0, 'RANK E', 0, 0, 10, 10, 10, 10, 10, CURRENT_TIMESTAMP)
    ON CONFLICT ("userId") DO NOTHING;

    PERFORM 1 FROM "UserStats" WHERE "userId" = v_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'UserStats record not found for user %', v_user_id;
    END IF;

    SELECT "isMastered" INTO v_node_mastered
    FROM "SubjectNode"
    WHERE "subjectId" = v_subject_id AND "nodeId" = p_node_key
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Subject node % not found for subject %', p_node_key, v_subject_id;
    END IF;

    -- 3. Idempotency guard — the mastery flag is the claim anchor.
    IF v_node_mastered THEN
        RAISE EXCEPTION 'ALREADY_FORGED: Apex node % for subject % has already been forged',
            p_node_key, v_subject_id
            USING ERRCODE = 'A0001';
    END IF;

    -- 4. Validate subject mastery requirement: >= 115 minted Subject SP
    --    (sum of spAward across all mastered nodes except the apex itself).
    SELECT COALESCE(SUM("spAward"), 0) INTO v_minted_sp
    FROM "SubjectNode"
    WHERE "subjectId" = v_subject_id
      AND "nodeId" <> 'N10_1'
      AND ("isMastered" OR "progress" >= 100);

    IF v_minted_sp < 115 THEN
        RAISE EXCEPTION 'INSUFFICIENT_SP: Requires 115 Subject SP, current %', v_minted_sp
            USING ERRCODE = 'A0002';
    END IF;

    -- 5. Canonical recomputation of lifetime XP, level, rank, next-level XP.
    v_lifetime_xp := public.canonical_required_xp(v_user.level) + v_user."currentXP" + 5000;

    v_new_level     := public.canonical_level_from_xp(v_lifetime_xp);
    v_new_xp_within := v_lifetime_xp - public.canonical_required_xp(v_new_level);
    v_new_next    := public.canonical_xp_for_next_level(v_new_level);
    v_new_rank    := public.canonical_rank_display(v_new_level);
    v_new_rank_db := public.canonical_rank_db(v_new_level);
    v_new_sylph   := v_user.sylph + 500;

    -- Synthesis (Insight): ability tier 4+ grants +1 bonus SP on Apex forge.
    v_synthesis := 10;
    SELECT COALESCE("synthesis", 10) INTO v_synthesis
    FROM public."UserStats" WHERE "userId" = v_user_id;
    v_apex_extra_sp := CASE WHEN v_synthesis >= 65 THEN 1 ELSE 0 END;

    -- 6. Atomic mutations.
    UPDATE "SubjectNode"
    SET progress = 100.0,
        "isMastered" = TRUE,
        "masteredAt" = NOW(),
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "subjectId" = v_subject_id AND "nodeId" = p_node_key;

    UPDATE "User"
    SET "currentXP" = v_new_xp_within,
        "xpToNextLevel" = v_new_next,
        level = v_new_level,
        "hunterRank" = v_new_rank,
        sylph = v_new_sylph
    WHERE id = v_user_id;

    UPDATE "UserStats"
    SET xp = v_lifetime_xp,
        level = v_new_level,
        rank = v_new_rank_db,
        currency = currency + 500,
        "skillPoints" = "skillPoints" + 1 + v_apex_extra_sp,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "userId" = v_user_id;

    -- 7. Audit compliance ledgers.
    INSERT INTO "XpLedger" ("userId", amount, "balanceAfter", reason, source, metadata, "createdAt")
    VALUES (v_user_id, 5000, v_lifetime_xp, 'APEX_FORGE', 'SYSTEM',
            jsonb_build_object('subjectId', v_subject_id, 'nodeKey', p_node_key), NOW());

    INSERT INTO "SylphLedger" ("userId", amount, delta, "balanceAfter", reason, source, metadata, "createdAt")
    VALUES (v_user_id, 500, 500, v_new_sylph, 'APEX_FORGE', 'SYSTEM',
            jsonb_build_object('subjectId', v_subject_id, 'nodeKey', p_node_key), NOW());

    RETURN QUERY SELECT TRUE, FALSE, 5000, 500, 1 + v_apex_extra_sp,
        v_new_level, v_new_xp_within, v_new_rank, v_lifetime_xp, v_minted_sp;
END;
$$;

-- Effective unlock_skill_node_atomic: retain identity validation and economic ledgers; coordinate before row locks.
CREATE OR REPLACE FUNCTION public.unlock_skill_node_atomic(
    p_user_id TEXT,
    p_node_key TEXT,
    p_sp_cost INT,
    p_required_prereqs TEXT[]
)
RETURNS TABLE (
    success BOOLEAN,
    remaining_sp INT,
    unlocked_node_key TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id INT;
    v_sp INT;
    v_unlocked_count INT;
    v_prereq_count INT;
BEGIN
  -- ══ S2 identity guard (20260827000000) — never trust caller-supplied p_user_id ══
  -- The app reaches this function as role postgres/supabase_admin. Any other
  -- role must prove its JWT subject equals p_user_id before anything runs.
  IF current_user NOT IN ('postgres', 'supabase_admin') THEN
    IF COALESCE((auth.jwt() ->> 'sub'), NULLIF(current_setting('request.jwt.claim.sub', true), ''), '') <> p_user_id::text THEN
      RAISE EXCEPTION 'S2 identity guard: caller identity does not match p_user_id' USING ERRCODE = '42501';
    END IF;
  END IF;
    -- 1. Validate inputs.
    IF p_user_id IS NULL OR p_user_id !~ '^[0-9]+$' THEN
        RAISE EXCEPTION 'Invalid user id' USING ERRCODE = '22023';
    END IF;
    IF p_node_key IS NULL OR LENGTH(TRIM(p_node_key)) = 0 THEN
        RAISE EXCEPTION 'Invalid node key' USING ERRCODE = '22023';
    END IF;
    IF p_sp_cost IS NULL OR p_sp_cost < 0 THEN
        RAISE EXCEPTION 'Invalid SP cost' USING ERRCODE = '22023';
    END IF;
    v_user_id := p_user_id::INT;
    PERFORM pg_advisory_xact_lock(73641,v_user_id);

    -- 2. Resilient UserStats initialization + row lock.
    INSERT INTO "UserStats" ("userId", "level", "xp", "rank", "currency", "skillPoints",
        "endurance", "tenacity", "velocity", "discipline", "synthesis", "updatedAt")
    VALUES (v_user_id, 1, 0, 'RANK E', 0, 0, 10, 10, 10, 10, 10, CURRENT_TIMESTAMP)
    ON CONFLICT ("userId") DO NOTHING;

    SELECT "skillPoints" INTO v_sp
    FROM "UserStats"
    WHERE "userId" = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'UserStats record not found for user %', v_user_id;
    END IF;

    -- 3. Already-unlocked guard (idempotency).
    IF EXISTS (
        SELECT 1 FROM "UserSkillNode"
        WHERE "userId" = v_user_id AND "nodeKey" = p_node_key
    ) THEN
        RAISE EXCEPTION 'ALREADY_UNLOCKED: Skill node % already unlocked', p_node_key
            USING ERRCODE = 'A0003';
    END IF;

    -- 4. Prerequisite validation — ALL parent keys must be unlocked.
    IF p_required_prereqs IS NOT NULL AND cardinality(p_required_prereqs) > 0 THEN
        v_prereq_count := cardinality(p_required_prereqs);

        SELECT COUNT(*) INTO v_unlocked_count
        FROM "UserSkillNode"
        WHERE "userId" = v_user_id AND "nodeKey" = ANY(p_required_prereqs);

        IF v_unlocked_count < v_prereq_count THEN
            RAISE EXCEPTION 'PREREQUISITES_UNMET: % of % prerequisite nodes missing',
                v_prereq_count - v_unlocked_count, v_prereq_count
                USING ERRCODE = 'A0004';
        END IF;
    END IF;

    -- 5. SP balance validation.
    IF v_sp < p_sp_cost THEN
        RAISE EXCEPTION 'INSUFFICIENT_SKILL_POINTS: Required %, Available %', p_sp_cost, v_sp
            USING ERRCODE = 'A0005';
    END IF;

    -- 6. Atomic deduction + durable persistence.
    UPDATE "UserStats"
    SET "skillPoints" = "skillPoints" - p_sp_cost,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "userId" = v_user_id;

    INSERT INTO "UserSkillNode" ("userId", "nodeKey", "unlockedAt")
    VALUES (v_user_id, p_node_key, NOW());

    RETURN QUERY SELECT TRUE, v_sp - p_sp_cost, p_node_key;
END;
$$;

-- Effective claim_achievement_reward_atomic: retain identity validation and economic ledgers; coordinate before row locks.
CREATE OR REPLACE FUNCTION public.claim_achievement_reward_atomic(
    p_user_id TEXT,
    p_achievement_id TEXT,
    p_xp_reward INT,
    p_sylph_reward INT,
    p_title TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id INT;
    v_xp INT;
    v_sylph INT;
    v_user RECORD;
    v_lifetime_xp INT;
    v_level INT;
    v_current_xp INT;
    v_xp_threshold INT;
    v_rank TEXT;
    v_rank_db TEXT;
    v_levels_gained INT := 0;
    v_did_rank_up BOOLEAN := FALSE;
    v_level_up_sylph INT := 0;
    v_level_up_sp INT := 0;
    v_rank_up_sp INT := 0;
    v_total_sylph INT;
BEGIN
    -- 1. Validate parameters.
    IF p_user_id IS NULL OR p_user_id !~ '^[0-9]+$' THEN
        RAISE EXCEPTION 'Invalid user id' USING ERRCODE = '22023';
    END IF;
    IF p_achievement_id IS NULL OR LENGTH(TRIM(p_achievement_id)) = 0 THEN
        RAISE EXCEPTION 'Invalid achievement id' USING ERRCODE = '22023';
    END IF;
    v_user_id := p_user_id::INT;
    PERFORM pg_advisory_xact_lock(73641,v_user_id);
    v_xp := GREATEST(0, COALESCE(p_xp_reward, 0));
    v_sylph := GREATEST(0, COALESCE(p_sylph_reward, 0));

    -- 2. Lock order: User → UserStats.
    SELECT * INTO v_user FROM "User" WHERE id = v_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found: %', v_user_id;
    END IF;

    INSERT INTO "UserStats" ("userId", "level", "xp", "rank", "currency", "skillPoints",
        "endurance", "tenacity", "velocity", "discipline", "synthesis", "updatedAt")
    VALUES (v_user_id, v_user.level, public.canonical_required_xp(v_user.level) + v_user."currentXP", 'RANK E', 0, 0, 10, 10, 10, 10, 10, CURRENT_TIMESTAMP)
    ON CONFLICT ("userId") DO NOTHING;

    PERFORM 1 FROM "UserStats" WHERE "userId" = v_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'UserStats record not found for user %', v_user_id;
    END IF;

    -- 3. Idempotency guard.
    IF EXISTS (
        SELECT 1 FROM "UserAchievement"
        WHERE "userId" = v_user_id AND "achievementId" = p_achievement_id
    ) THEN
        RAISE EXCEPTION 'ALREADY_CLAIMED: Achievement % already claimed', p_achievement_id
            USING ERRCODE = 'S0001';
    END IF;

    -- 4. Canonical recomputation.
    v_lifetime_xp := public.canonical_required_xp(v_user.level) + v_user."currentXP" + v_xp;

    v_level := v_user.level;
    v_current_xp := v_user."currentXP" + v_xp;
    v_xp_threshold := public.canonical_xp_for_next_level(v_level);

    WHILE v_current_xp >= v_xp_threshold LOOP
        v_current_xp := v_current_xp - v_xp_threshold;
        v_level := v_level + 1;
        v_levels_gained := v_levels_gained + 1;
        v_xp_threshold := public.canonical_xp_for_next_level(v_level);
    END LOOP;

    v_rank := public.canonical_rank_display(v_level);
    v_rank_db := public.canonical_rank_db(v_level);
    v_did_rank_up := (v_rank <> v_user."hunterRank");

    -- Level-up stipend preserved from the legacy flow.
    IF v_levels_gained > 0 THEN
        v_level_up_sylph := v_level * 300;
    END IF;

    -- SP stipend: +2 SP per level gained, +5 SP per rank up.
    v_level_up_sp := v_levels_gained * 2;
    v_rank_up_sp := CASE WHEN v_did_rank_up THEN 5 ELSE 0 END;
    v_total_sylph := v_sylph + v_level_up_sylph;

    -- 5. Claim record (unique constraint is the race backstop; the
    --    User row lock serializes concurrent claims first).
    BEGIN
        INSERT INTO "UserAchievement" ("userId", "achievementId", "claimedAt")
        VALUES (v_user_id, p_achievement_id, NOW());
    EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'ALREADY_CLAIMED: Achievement % already claimed', p_achievement_id
            USING ERRCODE = 'S0001';
    END;

    -- 6. Atomic mutations.
    UPDATE "User"
    SET "currentXP" = v_current_xp,
        "xpToNextLevel" = v_xp_threshold,
        level = v_level,
        "hunterRank" = v_rank,
        sylph = sylph + v_total_sylph
    WHERE id = v_user_id;

    UPDATE "UserStats"
    SET xp = v_lifetime_xp,
        level = v_level,
        rank = v_rank_db,
        currency = currency + v_total_sylph,
        "skillPoints" = "skillPoints" + v_level_up_sp + v_rank_up_sp,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "userId" = v_user_id;

    -- 7. Audit compliance ledgers.
    IF v_xp > 0 THEN
        INSERT INTO "XpLedger" ("userId", amount, "balanceAfter", reason, source, metadata, "createdAt")
        VALUES (v_user_id, v_xp, v_lifetime_xp, 'ACHIEVEMENT_CLAIM', 'ACHIEVEMENT',
                jsonb_build_object('achievementId', p_achievement_id), NOW());
    END IF;

    IF v_sylph > 0 THEN
        INSERT INTO "SylphLedger" ("userId", amount, delta, "balanceAfter", reason, source, metadata, "createdAt")
        VALUES (v_user_id, v_sylph, v_sylph, v_user.sylph + v_total_sylph,
                'ACHIEVEMENT_CLAIM: ' || COALESCE(p_title, p_achievement_id), 'ACHIEVEMENT',
                jsonb_build_object('achievementId', p_achievement_id), NOW());
    END IF;

    IF v_level_up_sylph > 0 THEN
        INSERT INTO "SylphLedger" ("userId", amount, delta, "balanceAfter", reason, source, metadata, "createdAt")
        VALUES (v_user_id, v_level_up_sylph, v_level_up_sylph, v_user.sylph + v_total_sylph,
                'ACHIEVEMENT_LEVEL_UP_STIPEND', 'LEVEL_UP',
                jsonb_build_object('achievementId', p_achievement_id), NOW());
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'achievementId', p_achievement_id,
        'xpGained', v_xp,
        'sylphGained', v_total_sylph,
        'level', v_level,
        'currentXP', v_current_xp,
        'xpToNextLevel', v_xp_threshold,
        'hunterRank', v_rank,
        'levelsGained', v_levels_gained,
        'didRankUp', v_did_rank_up
    );
END;
$$;


-- Effective commit_focus_progression: same authenticated economic body, user coordination before row locks.
CREATE OR REPLACE FUNCTION public.commit_focus_progression(
    p_gained_xp INT,
    p_gained_currency INT,
    p_endurance_inc INT DEFAULT 0,
    p_velocity_inc INT DEFAULT 0,
    p_discipline_inc INT DEFAULT 0,
    p_tenacity_inc INT DEFAULT 0,
    p_synthesis_inc INT DEFAULT 0
)
RETURNS TABLE (
    new_level INT,
    new_xp INT,
    new_rank TEXT,
    new_currency INT,
    new_sp INT,
    leveled_up BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id INT;
    v_old_xp INT;
    v_old_level INT;
    v_new_xp INT;
    v_new_level INT;
    v_new_rank TEXT;
    v_sp_diff INT;
    v_new_sp INT;
    v_new_currency INT;
    v_leveled_up BOOLEAN := FALSE;
BEGIN
    -- 1. Strict Scalar Subquery RLS check (Integer user ID extraction)
    v_user_id := (SELECT COALESCE(
        ((auth.jwt() ->> 'userId'::text))::integer,
        (NULLIF(current_setting('request.jwt.claim.userId', true), ''))::integer,
        0
    ));
    IF v_user_id = 0 OR v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Invalid session context';
    END IF;

    PERFORM pg_advisory_xact_lock(73641,v_user_id);

    -- 2. Resilient Initialization (Zero-Error Upsert)
    INSERT INTO "UserStats" ("userId", "level", "xp", "rank", "currency", "skillPoints", "endurance", "tenacity", "velocity", "discipline", "synthesis", "updatedAt")
    VALUES (v_user_id, 1, 0, 'RANK E', 0, 0, 10, 10, 10, 10, 10, CURRENT_TIMESTAMP)
    ON CONFLICT ("userId") DO NOTHING;

    -- 3. Lock Row for Atomic Mutation
    SELECT xp, level, "skillPoints", currency 
    INTO v_old_xp, v_old_level, v_new_sp, v_new_currency
    FROM "UserStats" 
    WHERE "userId" = v_user_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'UserStats record not found for authenticated user';
    END IF;

    -- 4. Calculate New Total XP & Level Curve: XP = 100 * L^1.5 => L = floor((XP / 100)^(2/3))
    v_new_xp := v_old_xp + GREATEST(0, p_gained_xp);
    v_new_currency := v_new_currency + GREATEST(0, p_gained_currency);

    IF v_new_xp < 282 THEN
        v_new_level := 1;
    ELSE
        v_new_level := GREATEST(1, FLOOR(POW(v_new_xp::FLOAT / 100.0, 2.0 / 3.0))::INT);
        -- Precision boundary guard to guarantee 100% parity with floor(100 * L^1.5)
        WHILE FLOOR(100.0 * POW((v_new_level + 1)::FLOAT, 1.5)) <= v_new_xp LOOP
            v_new_level := v_new_level + 1;
        END LOOP;
        WHILE v_new_level > 1 AND FLOOR(100.0 * POW(v_new_level::FLOAT, 1.5)) > v_new_xp LOOP
            v_new_level := v_new_level - 1;
        END LOOP;
    END IF;

    -- Level Up & Skill Point Allocation
    IF v_new_level > v_old_level THEN
        v_sp_diff := v_new_level - v_old_level;
        v_new_sp := v_new_sp + v_sp_diff;
        v_leveled_up := TRUE;
    END IF;

    -- 5. Calculate Rank Tier
    v_new_rank := CASE
        WHEN v_new_level >= 150 THEN 'MONARCH'
        WHEN v_new_level >= 125 THEN 'NATIONAL'
        WHEN v_new_level >= 100 THEN 'RANK S'
        WHEN v_new_level >= 75  THEN 'RANK A'
        WHEN v_new_level >= 50  THEN 'RANK B'
        WHEN v_new_level >= 25  THEN 'RANK C'
        WHEN v_new_level >= 10  THEN 'RANK D'
        ELSE 'RANK E'
    END;

    -- 6. Commit Cascade to Database
    UPDATE "UserStats"
    SET 
        xp = v_new_xp,
        level = v_new_level,
        rank = v_new_rank,
        currency = v_new_currency,
        "skillPoints" = v_new_sp,
        endurance = LEAST(100, endurance + GREATEST(0, p_endurance_inc)),
        velocity = LEAST(100, velocity + GREATEST(0, p_velocity_inc)),
        discipline = LEAST(100, discipline + GREATEST(0, p_discipline_inc)),
        tenacity = LEAST(100, tenacity + GREATEST(0, p_tenacity_inc)),
        synthesis = LEAST(100, synthesis + GREATEST(0, p_synthesis_inc)),
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "userId" = v_user_id;

    RETURN QUERY SELECT v_new_level, v_new_xp, v_new_rank, v_new_currency, v_new_sp, v_leveled_up;
END;
$$;


-- Effective commit_forge_progress: same authenticated economic body, user coordination before row locks.
CREATE OR REPLACE FUNCTION public.commit_forge_progress(
    p_topic_key TEXT,
    p_difficulty INT,
    p_session_minutes INT
)
RETURNS TABLE (
    success BOOLEAN,
    topic_progress INT,
    topic_completed BOOLEAN,
    core_completed BOOLEAN,
    awarded_xp INT,
    awarded_sylph INT,
    awarded_sp INT,
    unlocked_pedestal TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id INT;
    v_topic_id INT;
    v_core_id INT;
    v_target_progress INT;
    v_weight FLOAT;
    v_delta INT;
    v_new_progress INT;
    v_topic_completed BOOLEAN := FALSE;
    v_core_completed BOOLEAN := FALSE;
    v_incomplete_count INT;
    v_mastery_inserted_id INT := NULL;
    v_reward_xp INT := 0;
    v_reward_sylph INT := 0;
    v_reward_sp INT := 0;
    v_reward_pedestal TEXT := NULL;
    v_core_record RECORD;

    -- Leveling & Progression Variables
    v_old_xp INT;
    v_old_level INT;
    v_old_currency INT;
    v_old_sp INT;
    v_new_xp INT;
    v_new_level INT;
    v_new_rank TEXT;
    v_level_diff INT := 0;
    v_total_sp_awarded INT := 0;
BEGIN
    -- 1. Scalar JWT Integer Auth Extraction
    v_user_id := (SELECT COALESCE(
        ((auth.jwt() ->> 'userId'::text))::integer,
        (NULLIF(current_setting('request.jwt.claim.userId', true), ''))::integer,
        0
    ));
    IF v_user_id = 0 THEN
        RAISE EXCEPTION 'Unauthorized: Invalid session context';
    END IF;

    PERFORM pg_advisory_xact_lock(73641,v_user_id);

    -- 2. Fetch Topic & Parent Core Configuration
    SELECT id, "forgeCoreId", "targetProgress", "structuralWeight"
    INTO v_topic_id, v_core_id, v_target_progress, v_weight
    FROM "ForgeTopic"
    WHERE "topicKey" = p_topic_key;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Forge topic not found: %', p_topic_key;
    END IF;

    -- 3. Calculate Deterministic Progress Delta
    -- Delta = (Difficulty * 5 + floor(Minutes / 15)) * Weight (Clamped between 1 and 40)
    v_delta := GREATEST(1, LEAST(40, FLOOR((GREATEST(1, LEAST(5, p_difficulty)) * 5 + FLOOR(p_session_minutes / 15)) * v_weight))::INT);

    -- 4. Upsert UserForgeProgress
    INSERT INTO "UserForgeProgress" ("userId", "forgeTopicId", progress, "updatedAt")
    VALUES (v_user_id, v_topic_id, v_delta, NOW())
    ON CONFLICT ("userId", "forgeTopicId")
    DO UPDATE SET 
        progress = LEAST(v_target_progress, "UserForgeProgress".progress + v_delta),
        "updatedAt" = NOW()
    RETURNING progress INTO v_new_progress;

    -- Check Topic Completion
    IF v_new_progress >= v_target_progress THEN
        v_topic_completed := TRUE;
        UPDATE "UserForgeProgress"
        SET "completedAt" = COALESCE("completedAt", NOW())
        WHERE "userId" = v_user_id AND "forgeTopicId" = v_topic_id;
    END IF;

    -- 5. Check Complete Core Completion Status
    SELECT COUNT(*)
    INTO v_incomplete_count
    FROM "ForgeTopic" ft
    LEFT JOIN "UserForgeProgress" ufp 
        ON ufp."forgeTopicId" = ft.id AND ufp."userId" = v_user_id
    WHERE ft."forgeCoreId" = v_core_id 
      AND (ufp.progress IS NULL OR ufp.progress < ft."targetProgress");

    -- 6. If all topics for this core are 100% completed, attempt idempotent mastery claim
    IF v_incomplete_count = 0 THEN
        INSERT INTO "UserForgeCoreMastery" ("userId", "forgeCoreId", "completedAt", "prestigeTier")
        VALUES (v_user_id, v_core_id, NOW(), 1)
        ON CONFLICT ("userId", "forgeCoreId") DO NOTHING
        RETURNING id INTO v_mastery_inserted_id;

        -- Only execute reward payouts if this was a newly claimed mastery
        IF v_mastery_inserted_id IS NOT NULL THEN
            v_core_completed := TRUE;

            SELECT "rewardXp", "rewardSylph", "rewardSp", "rewardPedestalKey"
            INTO v_core_record
            FROM "ForgeCore"
            WHERE id = v_core_id;

            v_reward_xp := v_core_record."rewardXp";
            v_reward_sylph := v_core_record."rewardSylph";
            v_reward_sp := v_core_record."rewardSp";
            v_reward_pedestal := v_core_record."rewardPedestalKey";

            -- Auto-initialize UserStats if absent
            INSERT INTO "UserStats" ("userId", "updatedAt") 
            VALUES (v_user_id, CURRENT_TIMESTAMP) 
            ON CONFLICT ("userId") DO NOTHING;

            -- Lock UserStats FOR UPDATE
            SELECT xp, level, currency, "skillPoints"
            INTO v_old_xp, v_old_level, v_old_currency, v_old_sp
            FROM "UserStats"
            WHERE "userId" = v_user_id
            FOR UPDATE;

            v_new_xp := v_old_xp + v_reward_xp;

            -- Deterministic Level Recalculation
            IF v_new_xp < 282 THEN
                v_new_level := 1;
            ELSE
                v_new_level := GREATEST(1, FLOOR(POW(v_new_xp / 100.0, 2.0 / 3.0))::INT);
                WHILE FLOOR(100.0 * POW((v_new_level + 1)::FLOAT, 1.5)) <= v_new_xp LOOP
                    v_new_level := v_new_level + 1;
                END LOOP;
                WHILE v_new_level > 1 AND FLOOR(100.0 * POW(v_new_level::FLOAT, 1.5)) > v_new_xp LOOP
                    v_new_level := v_new_level - 1;
                END LOOP;
            END IF;

            v_level_diff := GREATEST(0, v_new_level - v_old_level);
            v_total_sp_awarded := v_reward_sp + v_level_diff;

            -- Rank Recalculation
            IF v_new_level >= 150 THEN
                v_new_rank := 'MONARCH';
            ELSIF v_new_level >= 125 THEN
                v_new_rank := 'NATIONAL';
            ELSIF v_new_level >= 100 THEN
                v_new_rank := 'RANK S';
            ELSIF v_new_level >= 75 THEN
                v_new_rank := 'RANK A';
            ELSIF v_new_level >= 50 THEN
                v_new_rank := 'RANK B';
            ELSIF v_new_level >= 25 THEN
                v_new_rank := 'RANK C';
            ELSIF v_new_level >= 10 THEN
                v_new_rank := 'RANK D';
            ELSE
                v_new_rank := 'RANK E';
            END IF;

            -- Atomic Commit to UserStats
            UPDATE "UserStats"
            SET xp = v_new_xp,
                level = v_new_level,
                rank = v_new_rank,
                currency = currency + v_reward_sylph,
                "skillPoints" = "skillPoints" + v_total_sp_awarded,
                "updatedAt" = CURRENT_TIMESTAMP
            WHERE "userId" = v_user_id;

            -- Record Sylph Ledger Entry
            INSERT INTO "SylphLedger" ("userId", delta, "balanceAfter", reason, metadata)
            SELECT 
                v_user_id, 
                v_reward_sylph, 
                currency, 
                'FORGE_CORE_MASTERY', 
                jsonb_build_object('coreId', v_core_id, 'coreKey', (SELECT "coreKey" FROM "ForgeCore" WHERE id = v_core_id))
            FROM "UserStats"
            WHERE "userId" = v_user_id;
        END IF;
    END IF;

    RETURN QUERY SELECT 
        TRUE, 
        v_new_progress, 
        v_topic_completed, 
        v_core_completed, 
        v_reward_xp, 
        v_reward_sylph, 
        v_total_sp_awarded, 
        v_reward_pedestal;
END;
$$;


-- Preserve effective shop/equipment math; coordinate direct SQL callers too.
CREATE OR REPLACE FUNCTION public.purchase_shop_item(
    p_item_id INT
)
RETURNS TABLE (
    success BOOLEAN,
    remaining_currency INT,
    inventory_id INT,
    new_quantity INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id INT;
    v_currency INT;
    v_user_rank TEXT;
    v_user_rank_weight INT;
    v_req_rank_weight INT;
    v_item_sku TEXT;
    v_item_name TEXT;
    v_item_category "ItemCategory";
    v_item_slot "ItemSlot";
    v_item_rarity "ItemRarity";
    v_item_req_rank TEXT;
    v_item_cost INT;
    v_item_set_key TEXT;
    v_remaining_currency INT;
    v_inv_id INT := 0;
    v_new_quantity INT := 1;
BEGIN
    -- 1. Extract and validate user ID from JWT claims
    v_user_id := (SELECT COALESCE(
        ((auth.jwt() ->> 'userId'::text))::integer,
        (NULLIF(current_setting('request.jwt.claim.userId', true), ''))::integer,
        0
    ));
    IF v_user_id = 0 OR v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Invalid session context';
    END IF;

    -- Shared execution/economic owner, before any inventory/stats row lock.
    PERFORM pg_advisory_xact_lock(73641,v_user_id);

    -- 2. Resilient UserStats initialization & row-level lock
    INSERT INTO "UserStats" ("userId", "level", "xp", "rank", "currency", "skillPoints", "endurance", "tenacity", "velocity", "discipline", "synthesis", "updatedAt")
    VALUES (v_user_id, 1, 0, 'RANK E', 0, 0, 10, 10, 10, 10, 10, CURRENT_TIMESTAMP)
    ON CONFLICT ("userId") DO NOTHING;

    SELECT currency, rank 
    INTO v_currency, v_user_rank 
    FROM "UserStats" 
    WHERE "userId" = v_user_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'UserStats record not found for user';
    END IF;

    -- 3. Fetch item metadata
    SELECT sku, name, category, slot, rarity, "rankRequirement", "costSylph", "setKey"
    INTO v_item_sku, v_item_name, v_item_category, v_item_slot, v_item_rarity, v_item_req_rank, v_item_cost, v_item_set_key
    FROM "Item"
    WHERE id = p_item_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Item not found';
    END IF;

    -- 4. Explicit Rank Weight Evaluation
    v_user_rank_weight := CASE v_user_rank
        WHEN 'MONARCH'  THEN 8
        WHEN 'NATIONAL' THEN 7
        WHEN 'RANK S'   THEN 6
        WHEN 'RANK A'   THEN 5
        WHEN 'RANK B'   THEN 4
        WHEN 'RANK C'   THEN 3
        WHEN 'RANK D'   THEN 2
        ELSE 1 -- 'RANK E'
    END;

    v_req_rank_weight := CASE v_item_req_rank
        WHEN 'MONARCH'  THEN 8
        WHEN 'NATIONAL' THEN 7
        WHEN 'RANK S'   THEN 6
        WHEN 'RANK A'   THEN 5
        WHEN 'RANK B'   THEN 4
        WHEN 'RANK C'   THEN 3
        WHEN 'RANK D'   THEN 2
        ELSE 1 -- 'RANK E'
    END;

    IF v_user_rank_weight < v_req_rank_weight THEN
        RAISE EXCEPTION 'Insufficient rank: Required %, User %', v_item_req_rank, v_user_rank;
    END IF;

    -- 5. Currency Check
    IF v_currency < v_item_cost THEN
        RAISE EXCEPTION 'Insufficient Sylph';
    END IF;

    -- 6. Currency Deduction & Balance Update
    v_remaining_currency := v_currency - v_item_cost;
    UPDATE "UserStats"
    SET currency = v_remaining_currency, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "userId" = v_user_id;

    UPDATE "User"
    SET sylph = v_remaining_currency
    WHERE id = v_user_id;

    -- 7. Audit Logging in SylphLedger
    INSERT INTO "SylphLedger" ("userId", amount, delta, "balanceAfter", reason, source, metadata, "createdAt")
    VALUES (
        v_user_id,
        -v_item_cost,
        -v_item_cost,
        v_remaining_currency,
        'SHOP_PURCHASE: ' || v_item_sku,
        'SHOP',
        jsonb_build_object('itemId', p_item_id, 'sku', v_item_sku, 'category', v_item_category::text),
        CURRENT_TIMESTAMP
    );

    -- 8. Inventory Mutation based on Category
    IF v_item_category = 'CONSUMABLE' THEN
        INSERT INTO "UserInventory" ("userId", "itemId", quantity, "isEquipped", "acquiredAt", "updatedAt")
        VALUES (v_user_id, p_item_id, 1, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT ("userId", "itemId") 
        DO UPDATE SET quantity = "UserInventory".quantity + 1, "updatedAt" = CURRENT_TIMESTAMP
        RETURNING id, quantity INTO v_inv_id, v_new_quantity;

    ELSIF v_item_category = 'SET_BUNDLE' THEN
        IF v_item_set_key IS NULL THEN
            RAISE EXCEPTION 'Invalid set bundle: Missing setKey';
        END IF;

        -- Check if user already owns any individual set piece
        IF EXISTS (
            SELECT 1 
            FROM "UserInventory" ui 
            JOIN "Item" i ON ui."itemId" = i.id 
            WHERE ui."userId" = v_user_id 
              AND i."setKey" = v_item_set_key 
              AND i.category = 'EQUIPMENT'
        ) THEN
            RAISE EXCEPTION 'Item already owned: Set component already in inventory';
        END IF;

        -- Atomically insert all 4 set pieces into UserInventory
        INSERT INTO "UserInventory" ("userId", "itemId", quantity, "isEquipped", "acquiredAt", "updatedAt")
        SELECT v_user_id, id, 1, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        FROM "Item"
        WHERE "setKey" = v_item_set_key AND category = 'EQUIPMENT';

        v_inv_id := p_item_id;
        v_new_quantity := 1;

    ELSIF v_item_category IN ('EQUIPMENT', 'WEAPON') THEN
        IF EXISTS (
            SELECT 1 FROM "UserInventory" WHERE "userId" = v_user_id AND "itemId" = p_item_id
        ) THEN
            RAISE EXCEPTION 'Item already owned';
        END IF;

        INSERT INTO "UserInventory" ("userId", "itemId", quantity, "isEquipped", "acquiredAt", "updatedAt")
        VALUES (v_user_id, p_item_id, 1, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id, quantity INTO v_inv_id, v_new_quantity;
    ELSE
        RAISE EXCEPTION 'Unsupported item category: %', v_item_category;
    END IF;

    RETURN QUERY SELECT TRUE, v_remaining_currency, v_inv_id, v_new_quantity;
END;
$$;


-- Preserve effective shop/equipment math; coordinate direct SQL callers too.
CREATE OR REPLACE FUNCTION public.toggle_equip_item(
    p_inventory_id INT
)
RETURNS TABLE (
    inventory_id INT,
    is_equipped BOOLEAN,
    slot TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id INT;
    v_inv_id INT;
    v_inv_user_id INT;
    v_item_id INT;
    v_is_equipped BOOLEAN;
    v_item_category "ItemCategory";
    v_item_slot "ItemSlot";
    v_new_is_equipped BOOLEAN;
BEGIN
    -- 1. Extract and validate user ID from JWT claims
    v_user_id := (SELECT COALESCE(
        ((auth.jwt() ->> 'userId'::text))::integer,
        (NULLIF(current_setting('request.jwt.claim.userId', true), ''))::integer,
        0
    ));
    IF v_user_id = 0 OR v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Invalid session context';
    END IF;

    -- Shared execution/economic owner, before any inventory/stats row lock.
    PERFORM pg_advisory_xact_lock(73641,v_user_id);

    -- 2. Lock target inventory record FOR UPDATE
    SELECT ui.id, ui."userId", ui."itemId", ui."isEquipped", i.category, i.slot
    INTO v_inv_id, v_inv_user_id, v_item_id, v_is_equipped, v_item_category, v_item_slot
    FROM "UserInventory" ui
    JOIN "Item" i ON ui."itemId" = i.id
    WHERE ui.id = p_inventory_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Inventory record not found';
    END IF;

    IF v_inv_user_id <> v_user_id THEN
        RAISE EXCEPTION 'Unauthorized: Inventory record does not belong to user';
    END IF;

    -- 3. Strict Category & Slot Guard
    IF v_item_category NOT IN ('EQUIPMENT', 'WEAPON') OR v_item_slot = 'NONE' THEN
        RAISE EXCEPTION 'Cannot equip non-equipment item';
    END IF;

    -- 4. State Transition
    IF v_is_equipped = FALSE THEN
        -- Equipping: Unequip any other item currently equipped in the same slot for this user
        UPDATE "UserInventory" ui
        SET "isEquipped" = FALSE, "updatedAt" = CURRENT_TIMESTAMP
        FROM "Item" i
        WHERE ui."itemId" = i.id
          AND ui."userId" = v_user_id
          AND i.slot = v_item_slot
          AND ui.id <> p_inventory_id
          AND ui."isEquipped" = TRUE;

        -- Equip target item
        UPDATE "UserInventory"
        SET "isEquipped" = TRUE, "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = p_inventory_id;

        v_new_is_equipped := TRUE;
    ELSE
        -- Unequipping
        UPDATE "UserInventory"
        SET "isEquipped" = FALSE, "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = p_inventory_id;

        v_new_is_equipped := FALSE;
    END IF;

    RETURN QUERY SELECT p_inventory_id, v_new_is_equipped, v_item_slot::text;
END;
$$;

-- No application/shared-client caller remains for these historical reward
-- bypasses. Keep the current atomic session, TEXT-id skill and Apex authorities.
-- Retiring signatures avoids a privileged direct caller reviving a second
-- economic execution path; historical migrations remain unchanged.
DROP FUNCTION IF EXISTS public.commit_focus_progression(integer,integer,integer,integer,integer,integer,integer);
DROP FUNCTION IF EXISTS public.commit_forge_progress(text,integer,integer);
DROP FUNCTION IF EXISTS public.unlock_skill_node(integer);

-- Strategy is canonical intent policy, not immutable Plan identity. Preserve
-- legacy mode immutability and every latest tombstone/ownership check.
CREATE OR REPLACE FUNCTION public.planner_ownership_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE owner_id integer;
BEGIN
  IF TG_TABLE_NAME = 'PlannerPlan' THEN
    IF TG_OP = 'UPDATE' AND (NEW."userId" <> OLD."userId" OR (NEW.mode <> OLD.mode AND NOT (
      NEW."contractVersion"=2 AND current_setting('sylf.planner_v2_core_owner',true)=NEW."userId"::text AND
      EXISTS (SELECT 1 FROM "PlannerIntentVersion" i WHERE i.id=NEW."workingIntentVersionId" AND i."planId"=NEW.id AND i."userId"=NEW."userId" AND i.artifact->'intent'->>'policy'=NEW.mode)
    )) OR NEW.version < OLD.version OR NEW."creationKey" <> OLD."creationKey" OR NEW."creationHash" <> OLD."creationHash") THEN
      RAISE EXCEPTION 'PLANNER_IDENTITY_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
    IF (NEW."subjectId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Subject" WHERE id = NEW."subjectId" AND "userId" = NEW."userId"))
      OR (NEW."goalId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Goal" WHERE id = NEW."goalId" AND "userId" = NEW."userId")) THEN
      RAISE EXCEPTION 'PLANNER_OWNERSHIP' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF TG_OP = 'UPDATE' AND (
      NEW."planId" <> OLD."planId" OR NEW."itemKey" <> OLD."itemKey" OR NEW."createdRevisionId" <> OLD."createdRevisionId" OR NEW.baseline <> OLD.baseline
      OR (OLD."questId" IS NOT NULL AND NEW."questId" IS NOT NULL AND NEW."questId" <> OLD."questId")
      -- A tombstone is frozen. The frozen set is named explicitly now, rather than being the
      -- whole row, so the re-offer bookkeeping columns can move without the decision moving.
      OR (
        OLD.disposition IN ('DELETED','USER_RELEASED')
        AND (
          NEW."planId", NEW."itemKey", NEW."questId", NEW."createdRevisionId", NEW."appliedRevisionId",
          NEW.disposition, NEW.baseline, NEW."removedAt", NEW."removalReason", NEW."createdAt"
        ) IS DISTINCT FROM (
          OLD."planId", OLD."itemKey", OLD."questId", OLD."createdRevisionId", OLD."appliedRevisionId",
          OLD.disposition, OLD.baseline, OLD."removedAt", OLD."removalReason", OLD."createdAt"
        )
      )
      -- …and only a USER_RELEASED tombstone has re-offer columns to move.
      OR (
        OLD.disposition <> 'USER_RELEASED'
        AND (NEW."reofferState" IS DISTINCT FROM OLD."reofferState" OR NEW."reofferedAt" IS DISTINCT FROM OLD."reofferedAt")
      )
    ) THEN
      RAISE EXCEPTION 'PLANNER_LINEAGE_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
    SELECT "userId" INTO owner_id FROM "PlannerPlan" WHERE id = NEW."planId";
    IF NEW."questId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Quest" WHERE id = NEW."questId" AND "userId" = owner_id) THEN
      RAISE EXCEPTION 'PLANNER_OWNERSHIP' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
