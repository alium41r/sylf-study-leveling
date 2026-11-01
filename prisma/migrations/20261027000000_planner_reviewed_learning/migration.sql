-- Additive mixed-worker fence for explicitly admitted complete journeys.
-- Unprofiled/v1 and earlier profiled compiler-v2 Attempts retain their meaning.
CREATE FUNCTION public.planner_reviewed_journey_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW."compilerVersion"=2 AND NEW.payload->'resourcePolicy'->>'journeyVersion'='1' AND NEW.state='RUNNING' AND
  (OLD.state<>'RUNNING' OR OLD."leaseOwner" IS DISTINCT FROM NEW."leaseOwner" OR OLD.fence IS DISTINCT FROM NEW.fence) AND
  current_setting('sylf.planner_reviewed_journey_version',true) IS DISTINCT FROM '1' THEN
  RAISE EXCEPTION 'PLANNER_REVIEWED_JOURNEY_COMPILER_REQUIRED' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER planner_reviewed_journey_guard BEFORE UPDATE ON "PlannerAttempt" FOR EACH ROW EXECUTE FUNCTION public.planner_reviewed_journey_guard();
REVOKE ALL ON FUNCTION public.planner_reviewed_journey_guard() FROM PUBLIC,anon,authenticated,service_role;

-- Completed Research stays immutable. Later actual review questions/feedback
-- are a separate one-time handoff, never student answers or new permission.
CREATE FUNCTION public.planner_reviewed_research_handoff_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE handoff jsonb; assessment jsonb; receipt jsonb; response jsonb;
BEGIN
 IF NEW.payload->'reviewResearch' IS NOT DISTINCT FROM OLD.payload->'reviewResearch' THEN RETURN NEW; END IF;
 IF OLD.payload->'reviewResearch' IS NOT NULL THEN RAISE EXCEPTION 'PLANNER_REVIEWED_RESEARCH_HANDOFF_IMMUTABLE' USING ERRCODE='23514'; END IF;
 handoff:=NEW.payload->'reviewResearch';
 IF handoff IS NULL THEN RETURN NEW; END IF;
 assessment:=NEW."intelligenceArtifacts"->'entries'->(handoff->'assessment'->>'id');
 SELECT reservation INTO receipt FROM "AiUsageLog" WHERE "attemptId"=NEW.id AND "userId"=NEW."userId" AND
  "requestId"=(assessment->'value'->'producer'->>'callId')::uuid AND "accountingState"='SETTLED' AND reservation->>'accepted'='true';
 IF receipt IS NOT NULL THEN response:=(receipt->'result'->>'text')::jsonb; END IF;
 IF NOT (NEW."compilerVersion"=2 AND NEW.payload->'resourcePolicy'->>'journeyVersion'='1' AND OLD.state='RUNNING' AND
  OLD."leaseExpiresAt" AT TIME ZONE 'UTC'>clock_timestamp() AND OLD."executionDeadlineAt" AT TIME ZONE 'UTC'>clock_timestamp() AND
  current_setting('sylf.planner_role_fence',true)=OLD.fence::text AND handoff->>'schemaVersion'='1' AND
  assessment->>'kind'='REVIEW' AND assessment->'value'->>'schemaVersion'='2' AND assessment->>'digest'=handoff->'assessment'->>'digest' AND
  receipt->'roleCall'->>'role'='REVIEWER' AND receipt->'result'->>'finishReason'='STOP' AND
  receipt->'roleCall'->>'inputDigest'=assessment->'value'->'producer'->>'inputDigest' AND
  response->>'verdict'=assessment->'value'->>'verdict' AND handoff->'questions'=response->'questions' AND
  ((handoff->>'kind'='CLARIFICATION' AND response->>'verdict'='NEEDS_DECISION' AND jsonb_array_length(handoff->'questions')>0) OR
   (handoff->>'kind'='REINVESTIGATION' AND response->>'verdict'='REVISE' AND response->'next'->>'route'='RESEARCH' AND handoff->'questions'='[]'::jsonb))) IS TRUE THEN
  RAISE EXCEPTION 'PLANNER_ACTUAL_REVIEW_RESEARCH_HANDOFF_REQUIRED' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER planner_reviewed_research_handoff_guard BEFORE UPDATE ON "PlannerAttempt" FOR EACH ROW EXECUTE FUNCTION public.planner_reviewed_research_handoff_guard();
REVOKE ALL ON FUNCTION public.planner_reviewed_research_handoff_guard() FROM PUBLIC,anon,authenticated,service_role;
