BEGIN;

-- Supporting intelligence artifacts, not a new Plan/Attempt/execution lifecycle.
ALTER TABLE "PlannerAttempt" ADD COLUMN "intelligenceArtifacts" jsonb;
ALTER TABLE "PlannerRevision" ADD COLUMN "intelligenceBundle" jsonb;
ALTER TABLE "PlannerAttempt" ADD CONSTRAINT planner_intelligence_archive_shape CHECK (
 "intelligenceArtifacts" IS NULL OR (
  jsonb_typeof("intelligenceArtifacts")='object' AND
  "intelligenceArtifacts"->>'schemaVersion'='1' AND "intelligenceArtifacts"->>'compilerVersion'='2' AND
  jsonb_typeof("intelligenceArtifacts"->'entries')='object' AND
  -- JSONB adds whitespace; leave storage headroom above the 16 MiB wire bound.
  octet_length("intelligenceArtifacts"::text)<=33554432
 ) IS TRUE);
ALTER TABLE "PlannerRevision" ADD CONSTRAINT planner_intelligence_bundle_shape CHECK (
 "intelligenceBundle" IS NULL OR (
  jsonb_typeof("intelligenceBundle")='object' AND "intelligenceBundle"->>'schemaVersion'='1' AND
  "intelligenceBundle"->>'compilerVersion'='2' AND
  "intelligenceBundle"->>'archiveAttemptId'="attemptId"::text AND
  "intelligenceBundle"->>'digest' ~ '^[a-f0-9]{64}$' AND
  octet_length("intelligenceBundle"::text)<=4194304
 ) IS TRUE);

CREATE FUNCTION public.planner_intelligence_retention_guard() RETURNS trigger
 LANGUAGE plpgsql SET search_path=public AS $$
DECLARE owner_id int; entry record; selected_ids jsonb;
BEGIN
 IF TG_TABLE_NAME='PlannerAttempt' THEN
  IF TG_OP='UPDATE' AND NEW."intelligenceArtifacts" IS NOT DISTINCT FROM OLD."intelligenceArtifacts" THEN RETURN NEW; END IF;
  IF NEW."intelligenceArtifacts" IS NULL THEN
   IF TG_OP='UPDATE' AND OLD."intelligenceArtifacts" IS NOT NULL THEN RAISE EXCEPTION 'PLANNER_INTELLIGENCE_IMMUTABLE' USING ERRCODE='23514'; END IF;
   RETURN NEW;
  END IF;
  PERFORM public.planner_v2_assert_coordinated(NEW."userId");
  IF TG_OP<>'UPDATE' OR OLD.state<>'RUNNING' OR NEW.state<>'RUNNING' OR NEW.kind='RESEARCH_ADVICE' OR
   OLD."leaseExpiresAt" AT TIME ZONE 'UTC' <= clock_timestamp() OR
   OLD."executionDeadlineAt" AT TIME ZONE 'UTC' <= clock_timestamp() OR
   current_setting('sylf.planner_foundation_fence',true) IS DISTINCT FROM OLD.fence::text THEN
   RAISE EXCEPTION 'PLANNER_INTELLIGENCE_FENCE_REQUIRED' USING ERRCODE='23514';
  END IF;
  IF OLD."intelligenceArtifacts" IS NOT NULL THEN
   FOR entry IN SELECT key,value FROM jsonb_each(OLD."intelligenceArtifacts"->'entries') LOOP
    IF NEW."intelligenceArtifacts"->'entries'->entry.key IS DISTINCT FROM entry.value THEN RAISE EXCEPTION 'PLANNER_INTELLIGENCE_IMMUTABLE' USING ERRCODE='23514'; END IF;
   END LOOP;
  END IF;
  SELECT jsonb_agg(value->>'planId') INTO selected_ids FROM jsonb_array_elements(NEW.artifact->'targets');
  FOR entry IN SELECT key,value FROM jsonb_each(NEW."intelligenceArtifacts"->'entries') LOOP
   IF entry.value->>'id' IS DISTINCT FROM entry.key OR entry.value->>'ownerId' IS DISTINCT FROM NEW."userId"::text OR
    entry.value->>'attemptId' IS DISTINCT FROM NEW.id::text OR entry.value->'planIds' IS DISTINCT FROM selected_ids OR
    entry.value->>'kind' IS NULL OR entry.value->>'kind' NOT IN ('CAPACITY','DOSSIER','STRATEGY','TRANSLATION','ISSUE','REVIEW','CHECKPOINT') OR
    NOT COALESCE(entry.value->>'digest' ~ '^[a-f0-9]{64}$',false) THEN
    RAISE EXCEPTION 'PLANNER_INTELLIGENCE_OWNERSHIP' USING ERRCODE='23514';
   END IF;
  END LOOP;
 ELSE
  IF TG_OP='UPDATE' AND NEW."intelligenceBundle" IS DISTINCT FROM OLD."intelligenceBundle" THEN
   RAISE EXCEPTION 'PLANNER_INTELLIGENCE_REVISION_IMMUTABLE' USING ERRCODE='23514';
  END IF;
  IF NEW."intelligenceBundle" IS NOT NULL THEN
   SELECT "userId" INTO owner_id FROM "PlannerPlan" WHERE id=NEW."planId";
   PERFORM public.planner_v2_assert_coordinated(owner_id);
   IF NOT EXISTS (SELECT 1 FROM "PlannerAttempt" a WHERE a.id=NEW."attemptId" AND a."userId"=owner_id AND a."intelligenceArtifacts" IS NOT NULL) THEN
    RAISE EXCEPTION 'PLANNER_INTELLIGENCE_OWNERSHIP' USING ERRCODE='23514';
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER planner_intelligence_attempt BEFORE INSERT OR UPDATE ON "PlannerAttempt" FOR EACH ROW EXECUTE FUNCTION public.planner_intelligence_retention_guard();
CREATE TRIGGER planner_intelligence_revision BEFORE INSERT OR UPDATE ON "PlannerRevision" FOR EACH ROW EXECUTE FUNCTION public.planner_intelligence_retention_guard();
REVOKE ALL ON FUNCTION public.planner_intelligence_retention_guard() FROM PUBLIC,anon,authenticated,service_role;
-- Existing backend-only RLS/grants, erasure cascades and execution guards remain.
COMMIT;
