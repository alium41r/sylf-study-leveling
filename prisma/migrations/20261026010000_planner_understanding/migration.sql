-- Research stays within the existing Attempt/archive and financial owners.
CREATE FUNCTION public.planner_understanding_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE r jsonb; previous jsonb; item jsonb; parent_budget jsonb;
BEGIN
 IF TG_OP='UPDATE' AND NEW."compilerVersion"=2 AND NEW.artifact->'budget'->'aiFirst' IS NOT NULL AND NEW.state='RUNNING' AND
  (OLD.state<>'RUNNING' OR OLD."leaseOwner" IS DISTINCT FROM NEW."leaseOwner") AND current_setting('sylf.planner_understanding_version',true) IS DISTINCT FROM '1' THEN
  RAISE EXCEPTION 'PLANNER_RESEARCH_COMPILER_REQUIRED' USING ERRCODE='23514';
 END IF;
 IF NEW.artifact->'budget'->'aiFirst' IS NOT NULL THEN
  FOR item IN SELECT jsonb_build_object('key',key,'value',value) FROM jsonb_each(coalesce(NEW.payload->'resourcePolicy'->'researchTools','{}'::jsonb)) LOOP
   IF (NEW.artifact->'budget'->'consumed'->>(item->>'key'))::bigint>(item->>'value')::bigint THEN
    RAISE EXCEPTION 'PLANNER_RESEARCH_TOOL_BOUND' USING ERRCODE='23514';
   END IF;
  END LOOP;
  IF TG_OP='INSERT' AND NEW.artifact->>'parentAttemptId' IS NOT NULL THEN
   SELECT artifact->'budget' INTO parent_budget FROM "PlannerAttempt" WHERE id=(NEW.artifact->>'parentAttemptId')::uuid AND "userId"=NEW."userId";
   FOR item IN SELECT jsonb_build_object('key',key,'value',value) FROM jsonb_each(parent_budget->'consumed') LOOP
    IF item->>'key' IN ('researchQueries','fetchAttempts','selectedSourceCharacters','extractedPages','ocrPages','followUps') AND
     (NEW.artifact->'budget'->'consumed'->>(item->>'key'))::bigint<(item->>'value')::bigint THEN
     RAISE EXCEPTION 'PLANNER_RESEARCH_TOOL_RESET' USING ERRCODE='23514';
    END IF;
   END LOOP;
  END IF;
 END IF;
 IF TG_OP='UPDATE' AND NEW.payload->'researchContinuation' IS DISTINCT FROM OLD.payload->'researchContinuation' THEN
  RAISE EXCEPTION 'PLANNER_RESEARCH_DECISION_IMMUTABLE' USING ERRCODE='23514';
 END IF;
 r:=NEW.payload->'researchContinuation';
 IF TG_OP='INSERT' AND r IS NOT NULL THEN
  IF NEW."compilerVersion"<>2 OR current_setting('sylf.planner_research_continuation',true) IS DISTINCT FROM r->>'decisionDigest' OR
   NOT EXISTS (SELECT 1 FROM "PlannerAttempt" a WHERE a.id=(NEW.artifact->>'parentAttemptId')::uuid AND a."userId"=NEW."userId" AND
     a.payload->'understanding' IS NOT NULL AND a.artifact->'acceptedRequest'=NEW.artifact->'acceptedRequest' AND
     (SELECT jsonb_agg(value->>'planId' ORDER BY value->>'planId') FROM jsonb_array_elements(a.artifact->'targets'))=
     (SELECT jsonb_agg(value->>'planId' ORDER BY value->>'planId') FROM jsonb_array_elements(NEW.artifact->'targets'))) THEN
    RAISE EXCEPTION 'PLANNER_RESEARCH_DECISION_REQUIRED' USING ERRCODE='23514';
  END IF;
 END IF;
 r:=NEW.payload->'understanding';
 IF r IS NULL THEN RETURN NEW; END IF;
 IF NEW."compilerVersion"<>2 OR NEW.artifact->'budget'->'aiFirst' IS NULL THEN
  RAISE EXCEPTION 'PLANNER_RESEARCH_VERSION_REQUIRED' USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE' AND r IS DISTINCT FROM OLD.payload->'understanding' THEN
  IF NEW.state<>'RUNNING' OR current_setting('sylf.planner_role_fence',true) IS DISTINCT FROM NEW.fence::text THEN
   RAISE EXCEPTION 'PLANNER_RESEARCH_FENCE_REQUIRED' USING ERRCODE='23514';
  END IF;
  previous:=OLD.payload->'understanding';
  IF previous IS NOT NULL THEN
   IF r->'input' IS DISTINCT FROM previous->'input' OR r->'inputDigest' IS DISTINCT FROM previous->'inputDigest' OR
    (r->>'step')::bigint<(previous->>'step')::bigint OR previous->>'phase'='COMPLETE' THEN
    RAISE EXCEPTION 'PLANNER_RESEARCH_INPUT_IMMUTABLE' USING ERRCODE='23514';
   END IF;
   FOR item IN SELECT jsonb_build_object('key',key,'value',value) FROM jsonb_each(previous) WHERE key IN ('sources','candidates','actions','calls','answers','gaps') LOOP
    IF (SELECT coalesce(jsonb_agg(value ORDER BY ord),'[]'::jsonb) FROM jsonb_array_elements(r->(item->>'key')) WITH ORDINALITY AS e(value,ord) WHERE ord<=jsonb_array_length(item->'value')) IS DISTINCT FROM item->'value' THEN
     RAISE EXCEPTION 'PLANNER_RESEARCH_HISTORY_IMMUTABLE' USING ERRCODE='23514';
    END IF;
   END LOOP;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER planner_understanding_guard BEFORE INSERT OR UPDATE ON "PlannerAttempt" FOR EACH ROW EXECUTE FUNCTION public.planner_understanding_guard();
REVOKE ALL ON FUNCTION public.planner_understanding_guard() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.planner_research_tool_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE a "PlannerAttempt"%ROWTYPE;
BEGIN
 IF NEW.reservation->>'schemaVersion' IS DISTINCT FROM '3' AND (TG_OP='INSERT' OR OLD.reservation->>'schemaVersion' IS DISTINCT FROM '3') THEN RETURN NEW; END IF;
 PERFORM public.planner_v2_assert_coordinated(NEW."userId");
 SELECT * INTO a FROM "PlannerAttempt" WHERE id=NEW."attemptId" AND "userId"=NEW."userId";
 IF NOT (a."compilerVersion"=2 AND a.artifact->'budget'->'aiFirst' IS NOT NULL AND a.payload->'resourcePolicy'->'researchTools' IS NOT NULL AND
   a.artifact->'acceptedRequest'->>'researchRequested'='true' AND NEW."rootRequestId"::text=a.artifact->'budget'->>'rootRequestId' AND NEW.reservation->>'schemaVersion'='3' AND
   NEW.reservation->>'kind'='SEARCH' AND NEW."promptTokens"=0 AND NEW."completionTokens"=0) IS TRUE THEN
  RAISE EXCEPTION 'PLANNER_RESEARCH_TOOL_OWNERSHIP' USING ERRCODE='23514';
 END IF;
 IF TG_OP='INSERT' THEN
  IF a.state<>'RUNNING' OR a."leaseExpiresAt" AT TIME ZONE 'UTC'<=clock_timestamp() OR a."executionDeadlineAt" AT TIME ZONE 'UTC'<=clock_timestamp() OR
   current_setting('sylf.planner_role_fence',true) IS DISTINCT FROM a.fence::text OR NEW.reservation->>'fence' IS DISTINCT FROM a.fence::text OR NEW."accountingState"<>'DISPATCHED' THEN
   RAISE EXCEPTION 'PLANNER_RESEARCH_TOOL_FENCE_REQUIRED' USING ERRCODE='23514';
  END IF;
  IF (SELECT count(*) FROM "AiUsageLog" WHERE "rootRequestId"=NEW."rootRequestId" AND reservation->>'schemaVersion'='3') >= (a.payload->'resourcePolicy'->'researchTools'->>'researchQueries')::bigint THEN
   RAISE EXCEPTION 'PLANNER_RESEARCH_TOOL_BOUND' USING ERRCODE='23514';
  END IF;
 ELSE
  IF ROW(NEW."requestId",NEW."rootRequestId",NEW."attemptId",NEW."userId",NEW.provider,NEW.model) IS DISTINCT FROM ROW(OLD."requestId",OLD."rootRequestId",OLD."attemptId",OLD."userId",OLD.provider,OLD.model) OR
   NEW.reservation-'outcome' IS DISTINCT FROM OLD.reservation-'outcome' OR
   OLD."accountingState"='SETTLED' AND ROW(NEW.reservation,NEW."estimatedCostUsd",NEW."accountingState") IS DISTINCT FROM ROW(OLD.reservation,OLD."estimatedCostUsd",OLD."accountingState") OR
   OLD."accountingState"='UNKNOWN_SPEND' AND NEW."accountingState"='DISPATCHED' OR
   NEW."accountingState" NOT IN ('DISPATCHED','UNKNOWN_SPEND','SETTLED') THEN
    RAISE EXCEPTION 'PLANNER_RESEARCH_TOOL_IMMUTABLE' USING ERRCODE='23514';
  END IF;
 END IF;
 IF NEW."accountingState" IN ('DISPATCHED','UNKNOWN_SPEND') AND NEW."estimatedCostUsd" IS NOT NULL THEN RAISE EXCEPTION 'PLANNER_RESEARCH_SPEND_UNKNOWN' USING ERRCODE='23514'; END IF;
 IF NEW."accountingState"='SETTLED' AND (NEW.reservation->>'outcome' IN ('RESULT','EMPTY','REJECTED')) IS NOT TRUE THEN RAISE EXCEPTION 'PLANNER_RESEARCH_OUTCOME_REQUIRED' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER planner_research_tool_guard BEFORE INSERT OR UPDATE ON "AiUsageLog" FOR EACH ROW EXECUTE FUNCTION public.planner_research_tool_guard();
REVOKE ALL ON FUNCTION public.planner_research_tool_guard() FROM PUBLIC,anon,authenticated,service_role;
