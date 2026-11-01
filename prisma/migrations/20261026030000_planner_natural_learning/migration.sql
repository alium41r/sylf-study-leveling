-- Existing Attempt/archive lifecycle, with an additive mixed-worker fence.
CREATE FUNCTION public.planner_natural_learning_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW."compilerVersion"=2 AND NEW.artifact->'budget'->'aiFirst' IS NOT NULL AND NEW.state='RUNNING' AND
  (OLD.state<>'RUNNING' OR OLD."leaseOwner" IS DISTINCT FROM NEW."leaseOwner" OR OLD.fence IS DISTINCT FROM NEW.fence) AND
  current_setting('sylf.planner_understanding_version',true)='1' AND current_setting('sylf.planner_calendar_capacity_version',true)='1' AND
  current_setting('sylf.planner_natural_learning_version',true) IS DISTINCT FROM '1' THEN
  RAISE EXCEPTION 'PLANNER_NATURAL_LEARNING_COMPILER_REQUIRED' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER planner_natural_learning_guard BEFORE UPDATE ON "PlannerAttempt" FOR EACH ROW EXECUTE FUNCTION public.planner_natural_learning_guard();
REVOKE ALL ON FUNCTION public.planner_natural_learning_guard() FROM PUBLIC,anon,authenticated,service_role;
