-- Version the existing root interpretation; legacy roots remain unique.
ALTER TABLE "AiUsageLog" DROP CONSTRAINT "AiUsageLog_accountingState_check";
ALTER TABLE "AiUsageLog" ADD CONSTRAINT "AiUsageLog_accountingState_check" CHECK (
 "accountingState" IN ('DISPATCHED','UNKNOWN_SPEND','SETTLED') OR
 (reservation->>'schemaVersion'='2' AND "accountingState" IN ('RESERVED','CANCELLED_BEFORE_DISPATCH')) IS TRUE);
DROP INDEX "PlannerAttempt_rootRequestId_key";
CREATE UNIQUE INDEX "PlannerAttempt_rootRequestId_key" ON "PlannerAttempt"((artifact->'budget'->>'rootRequestId'))
 WHERE artifact->'budget'->'aiFirst' IS NULL;
CREATE UNIQUE INDEX planner_role_root_unique ON "PlannerAttempt"((artifact->'budget'->>'rootRequestId'))
 WHERE artifact->'budget'->'aiFirst' IS NOT NULL AND artifact->>'parentAttemptId' IS NULL;
CREATE UNIQUE INDEX planner_role_child_unique ON "PlannerAttempt"((artifact->>'parentAttemptId'))
 WHERE artifact->'budget'->'aiFirst' IS NOT NULL AND artifact->>'parentAttemptId' IS NOT NULL;
CREATE UNIQUE INDEX planner_role_call_key_unique ON "AiUsageLog"("rootRequestId",(reservation->'roleCall'->>'key'))
 WHERE reservation->>'schemaVersion'='2';

CREATE FUNCTION public.planner_role_attempt_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE b jsonb; p jsonb; parent_row "PlannerAttempt"%ROWTYPE;
BEGIN
 b:=NEW.artifact->'budget'->'aiFirst'; p:=NEW.payload->'resourcePolicy';
 IF TG_OP='UPDATE' AND (OLD.artifact->'budget'->'aiFirst' IS DISTINCT FROM b OR OLD.payload->'resourcePolicy' IS DISTINCT FROM p) THEN
  RAISE EXCEPTION 'PLANNER_RESOURCE_POLICY_IMMUTABLE' USING ERRCODE='23514';
 END IF;
 IF b IS NULL THEN
  IF p IS NOT NULL THEN RAISE EXCEPTION 'PLANNER_RESOURCE_POLICY_MISMATCH' USING ERRCODE='23514'; END IF;
  IF TG_OP='INSERT' AND EXISTS (SELECT 1 FROM "PlannerAttempt" a WHERE a.artifact->'budget'->>'rootRequestId'=NEW.artifact->'budget'->>'rootRequestId' AND a.artifact->'budget'->'aiFirst' IS NOT NULL) THEN
   RAISE EXCEPTION 'PLANNER_RESOURCE_ROOT_REUSED' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='UPDATE' AND (OLD.artifact->'budget'->>'profile' IS DISTINCT FROM NEW.artifact->'budget'->>'profile' OR
   OLD."executionDeadlineAt" IS NOT NULL AND OLD."executionDeadlineAt" IS DISTINCT FROM NEW."executionDeadlineAt") THEN
  RAISE EXCEPTION 'PLANNER_RESOURCE_DEADLINE_IMMUTABLE' USING ERRCODE='23514';
 END IF;
 PERFORM public.planner_v2_assert_coordinated(NEW."userId");
 IF NOT (NEW."compilerVersion"=2 AND b->>'schemaVersion'='1' AND p->>'schemaVersion'='1' AND
  b->>'policyDigest' ~ '^[a-f0-9]{64}$' AND b->'limits'=p->'root' AND b->'processingMs'=p->'processingMs' AND
  (b->>'processingMs')::bigint BETWEEN 1 AND 86400000 AND (b->'limits'->>'calls')::bigint BETWEEN 1 AND 10000 AND
  (b->'limits'->>'inputUnits')::bigint BETWEEN 1 AND 100000000 AND (b->'limits'->>'completionTokens')::bigint BETWEEN 1 AND 100000000 AND
  p->>'authorizationDigest'=NEW.artifact->'acceptedRequest'->>'targetAuthorizationDigest') IS TRUE THEN
  RAISE EXCEPTION 'PLANNER_RESOURCE_POLICY_MISMATCH' USING ERRCODE='23514';
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.artifact->>'parentAttemptId' IS NULL THEN
   IF NEW."executionDeadlineAt" IS NOT NULL OR EXISTS (SELECT 1 FROM "PlannerAttempt" a WHERE a.artifact->'budget'->>'rootRequestId'=NEW.artifact->'budget'->>'rootRequestId') THEN
    RAISE EXCEPTION 'PLANNER_RESOURCE_ROOT_REUSED' USING ERRCODE='23514';
   END IF;
  ELSE
   SELECT * INTO parent_row FROM "PlannerAttempt" WHERE id=(NEW.artifact->>'parentAttemptId')::uuid AND "userId"=NEW."userId" FOR UPDATE;
   IF parent_row.id IS NULL OR parent_row."compilerVersion"<>2 OR parent_row.state NOT IN ('FAILED','CANCELLED','SUPERSEDED','NEEDS_DECISION') OR
    parent_row.payload->'resourcePolicy' IS DISTINCT FROM p OR parent_row.artifact->'budget'->'aiFirst' IS DISTINCT FROM b OR
    parent_row.artifact->'budget'->>'rootRequestId' IS DISTINCT FROM NEW.artifact->'budget'->>'rootRequestId' OR
    parent_row.artifact->'budget'->>'processingStartedAt' IS DISTINCT FROM NEW.artifact->'budget'->>'processingStartedAt' OR
    parent_row."executionDeadlineAt" IS NULL OR parent_row."executionDeadlineAt" IS DISTINCT FROM NEW."executionDeadlineAt" OR
    parent_row."executionDeadlineAt" AT TIME ZONE 'UTC'<=clock_timestamp() OR parent_row.artifact->'acceptedRequest' IS DISTINCT FROM NEW.artifact->'acceptedRequest' OR
    EXISTS (SELECT 1 FROM "AiUsageLog" l WHERE l."rootRequestId"=(NEW.artifact->'budget'->>'rootRequestId')::uuid AND l."accountingState" IN ('UNKNOWN_SPEND','DISPATCHED')) THEN
     RAISE EXCEPTION 'PLANNER_RESOURCE_CONTINUATION_INVALID' USING ERRCODE='23514';
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER planner_role_attempt_guard BEFORE INSERT OR UPDATE ON "PlannerAttempt" FOR EACH ROW EXECUTE FUNCTION public.planner_role_attempt_guard();
REVOKE ALL ON FUNCTION public.planner_role_attempt_guard() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.planner_role_receipt_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE a "PlannerAttempt"%ROWTYPE; c jsonb; r jsonb; grant_role jsonb; held jsonb; limits jsonb; used_calls bigint; used_input bigint; used_output bigint; next_state text;
BEGIN
 IF NEW.reservation->>'schemaVersion' IS DISTINCT FROM '2' AND (TG_OP='INSERT' OR OLD.reservation->>'schemaVersion' IS DISTINCT FROM '2') THEN RETURN NEW; END IF;
 SELECT * INTO a FROM "PlannerAttempt" WHERE id=NEW."attemptId" AND "userId"=NEW."userId";
 PERFORM public.planner_v2_assert_coordinated(NEW."userId");
 c:=NEW.reservation->'call'; r:=NEW.reservation->'roleCall'; next_state:=NEW."accountingState";
 IF NOT (a."compilerVersion"=2 AND a.artifact->'budget'->'aiFirst' IS NOT NULL AND NEW."rootRequestId"::text=a.artifact->'budget'->>'rootRequestId' AND
  NEW.reservation->>'schemaVersion'='2' AND c->>'callId'=NEW."requestId"::text AND c->>'attemptId'=a.id::text AND c->>'rootRequestId'=NEW."rootRequestId"::text AND
  c->>'provider'=NEW.provider AND c->>'model'=NEW.model AND r->>'policyDigest'=a.artifact->'budget'->'aiFirst'->>'policyDigest') IS TRUE THEN
  RAISE EXCEPTION 'PLANNER_ROLE_RECEIPT_OWNERSHIP' USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW."requestId",NEW."rootRequestId",NEW."attemptId",NEW."userId",NEW.provider,NEW.model) IS DISTINCT FROM ROW(OLD."requestId",OLD."rootRequestId",OLD."attemptId",OLD."userId",OLD.provider,OLD.model) OR
   NEW.reservation-'result'-'usage'-'accepted'-'responseOverflow' IS DISTINCT FROM OLD.reservation-'result'-'usage'-'accepted'-'responseOverflow' OR
   OLD.reservation->'result' IS NOT NULL AND NEW.reservation->'result' IS DISTINCT FROM OLD.reservation->'result' OR
   OLD.reservation->'usage' IS NOT NULL AND NEW.reservation->'usage' IS DISTINCT FROM OLD.reservation->'usage' OR
   OLD."accountingState"='SETTLED' AND ROW(NEW."promptTokens",NEW."completionTokens",NEW."estimatedCostUsd") IS DISTINCT FROM ROW(OLD."promptTokens",OLD."completionTokens",OLD."estimatedCostUsd") OR
   NOT (CASE OLD."accountingState" WHEN 'RESERVED' THEN next_state IN ('RESERVED','DISPATCHED','CANCELLED_BEFORE_DISPATCH') WHEN 'DISPATCHED' THEN next_state IN ('DISPATCHED','UNKNOWN_SPEND','SETTLED') WHEN 'UNKNOWN_SPEND' THEN next_state IN ('UNKNOWN_SPEND','SETTLED') ELSE next_state=OLD."accountingState" END) THEN
    RAISE EXCEPTION 'PLANNER_ROLE_RECEIPT_IMMUTABLE' USING ERRCODE='23514';
  END IF;
 END IF;
 IF NEW.reservation->>'accepted'='true' AND ((next_state='SETTLED' AND NEW.reservation->'result'->>'finishReason'='STOP' AND
   length(btrim(NEW.reservation->'result'->>'text'))>0) IS NOT TRUE) THEN
  RAISE EXCEPTION 'PLANNER_ROLE_COMPLETE_RESPONSE_REQUIRED' USING ERRCODE='23514';
 END IF;
 IF TG_OP='INSERT' OR next_state='DISPATCHED' AND OLD."accountingState"='RESERVED' OR NEW.reservation->>'accepted'='true' AND OLD.reservation->>'accepted' IS DISTINCT FROM 'true' THEN
  IF a.state<>'RUNNING' OR a."leaseExpiresAt" AT TIME ZONE 'UTC'<=clock_timestamp() OR a."executionDeadlineAt" AT TIME ZONE 'UTC'<=clock_timestamp() OR
   current_setting('sylf.planner_role_fence',true) IS DISTINCT FROM a.fence::text THEN
    RAISE EXCEPTION 'PLANNER_ROLE_FENCE_REQUIRED' USING ERRCODE='23514';
  END IF;
 END IF;
 IF TG_OP='INSERT' THEN
  grant_role:=a.payload->'resourcePolicy'->'roles'->(r->>'role'); limits:=a.payload->'resourcePolicy'->'root';
  IF NOT (next_state='RESERVED' AND c->>'fence'=a.fence::text AND grant_role->>'provider'=NEW.provider AND grant_role->>'model'=NEW.model AND
   grant_role->>'format'=r->>'format' AND grant_role->>'effort'=r->>'effort' AND (c->>'reservedInputTokens')::bigint BETWEEN 1 AND (grant_role->'call'->>'inputUnits')::bigint AND
   (c->>'reservedOutputTokens')::bigint BETWEEN 1 AND (grant_role->'call'->>'completionTokens')::bigint) IS TRUE THEN RAISE EXCEPTION 'PLANNER_ROLE_ADMISSION_INVALID' USING ERRCODE='23514'; END IF;
  IF EXISTS (SELECT 1 FROM "AiUsageLog" l WHERE l."rootRequestId"=NEW."rootRequestId" AND l."accountingState"='UNKNOWN_SPEND') THEN RAISE EXCEPTION 'PLANNER_ROLE_UNKNOWN_SPEND' USING ERRCODE='23514'; END IF;
  SELECT count(*),COALESCE(sum(CASE WHEN "accountingState"='SETTLED' THEN "promptTokens" ELSE (reservation->'call'->>'reservedInputTokens')::bigint END),0),
   COALESCE(sum(CASE WHEN "accountingState"='SETTLED' THEN "completionTokens" ELSE (reservation->'call'->>'reservedOutputTokens')::bigint END),0)
   INTO used_calls,used_input,used_output FROM "AiUsageLog" WHERE "rootRequestId"=NEW."rootRequestId" AND "accountingState"<>'CANCELLED_BEFORE_DISPATCH';
  used_calls:=used_calls+1; used_input:=used_input+(c->>'reservedInputTokens')::bigint; used_output:=used_output+(c->>'reservedOutputTokens')::bigint;
  FOR held IN SELECT value->'holdback' FROM jsonb_each(a.payload->'resourcePolicy'->'roles') WHERE key IN
   (SELECT unnest(CASE r->>'role' WHEN 'RESEARCH' THEN ARRAY['TRANSLATOR','REVIEWER'] WHEN 'STRATEGIST' THEN ARRAY['TRANSLATOR','REVIEWER'] WHEN 'TRANSLATOR' THEN ARRAY['REVIEWER'] ELSE ARRAY[]::text[] END)) LOOP
    used_calls:=used_calls+(held->>'calls')::bigint; used_input:=used_input+(held->>'inputUnits')::bigint; used_output:=used_output+(held->>'completionTokens')::bigint;
  END LOOP;
  IF used_calls>(limits->>'calls')::bigint OR used_input>(limits->>'inputUnits')::bigint OR used_output>(limits->>'completionTokens')::bigint THEN RAISE EXCEPTION 'PLANNER_ROLE_RESOURCES_EXHAUSTED' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER planner_role_receipt_guard BEFORE INSERT OR UPDATE ON "AiUsageLog" FOR EACH ROW EXECUTE FUNCTION public.planner_role_receipt_guard();
REVOKE ALL ON FUNCTION public.planner_role_receipt_guard() FROM PUBLIC,anon,authenticated,service_role;
