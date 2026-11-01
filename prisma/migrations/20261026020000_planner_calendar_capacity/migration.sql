-- Additive worker capability fence. Historical archives/attempts are unchanged.
CREATE FUNCTION public.planner_calendar_capacity_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW."compilerVersion"=2 AND NEW.artifact->'budget'->'aiFirst' IS NOT NULL AND NEW.state='RUNNING' AND
  (OLD.state<>'RUNNING' OR OLD."leaseOwner" IS DISTINCT FROM NEW."leaseOwner") AND
  current_setting('sylf.planner_understanding_version',true)='1' AND
  current_setting('sylf.planner_calendar_capacity_version',true) IS DISTINCT FROM '1' THEN
  RAISE EXCEPTION 'PLANNER_CALENDAR_CAPACITY_COMPILER_REQUIRED' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER planner_calendar_capacity_guard BEFORE UPDATE ON "PlannerAttempt" FOR EACH ROW EXECUTE FUNCTION public.planner_calendar_capacity_guard();
REVOKE ALL ON FUNCTION public.planner_calendar_capacity_guard() FROM PUBLIC,anon,authenticated,service_role;
