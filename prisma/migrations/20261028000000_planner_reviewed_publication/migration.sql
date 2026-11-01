BEGIN;

CREATE FUNCTION public.planner_reviewed_claim_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW."compilerVersion"=2 AND NEW.payload->'resourcePolicy'->>'journeyVersion'='1' AND NEW.state='RUNNING' AND
  (OLD.state<>'RUNNING' OR OLD."leaseOwner" IS DISTINCT FROM NEW."leaseOwner" OR OLD.fence IS DISTINCT FROM NEW.fence) AND
  current_setting('sylf.planner_reviewed_journey_version',true)='1' AND
  current_setting('sylf.planner_reviewed_publication_version',true) IS DISTINCT FROM '1' THEN
  RAISE EXCEPTION 'PLANNER_REVIEWED_PUBLICATION_COMPILER_REQUIRED' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER planner_reviewed_claim_guard BEFORE UPDATE ON "PlannerAttempt" FOR EACH ROW EXECUTE FUNCTION public.planner_reviewed_claim_guard();
REVOKE ALL ON FUNCTION public.planner_reviewed_claim_guard() FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE "PlannerRevision" DROP CONSTRAINT planner_intelligence_bundle_shape;
ALTER TABLE "PlannerRevision" ADD CONSTRAINT planner_intelligence_bundle_shape CHECK (
 "intelligenceBundle" IS NULL OR (
  jsonb_typeof("intelligenceBundle")='object' AND "intelligenceBundle"->>'schemaVersion' IN ('1','2') AND
  "intelligenceBundle"->>'compilerVersion'='2' AND "intelligenceBundle"->>'archiveAttemptId'="attemptId"::text AND
  "intelligenceBundle"->>'digest' ~ '^[a-f0-9]{64}$' AND octet_length("intelligenceBundle"::text)<=4194304 AND
  ("intelligenceBundle"->>'schemaVersion'='1' OR ("intelligenceBundle"->'binding'->>'schemaVersion'='2' AND jsonb_typeof("intelligenceBundle"->'binding'->'allocation')='object'))
 ) IS TRUE);

CREATE FUNCTION public.planner_reviewed_publication_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE a "PlannerAttempt"%ROWTYPE; bundle jsonb; assessment jsonb; allocation jsonb; compiled jsonb; blueprint jsonb;
BEGIN
 IF NEW."intelligenceBundle"->>'schemaVersion' IS DISTINCT FROM '2' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW."intelligenceBundle" IS NOT DISTINCT FROM OLD."intelligenceBundle" THEN RETURN NEW; END IF;
 bundle:=NEW."intelligenceBundle";SELECT * INTO a FROM "PlannerAttempt" WHERE id=NEW."attemptId";
 assessment:=a."intelligenceArtifacts"->'entries'->(bundle->'review'->>'id');
 allocation:=a."intelligenceArtifacts"->'entries'->(bundle->'binding'->'allocation'->>'id');
 SELECT value INTO compiled FROM jsonb_array_elements(allocation->'value'->'learning'->'allocated'->'compiled') WHERE value->>'planId'=NEW."planId"::text;
 SELECT value->'blueprint' INTO blueprint FROM jsonb_array_elements(allocation->'value'->'learning'->'allocated'->'blueprints'->'plans') WHERE value->>'planRef'=compiled->>'planRef';
 IF NOT (a."compilerVersion"=2 AND a.payload->'resourcePolicy'->>'journeyVersion'='1' AND a.state='RUNNING' AND
  a."leaseExpiresAt" AT TIME ZONE 'UTC'>clock_timestamp() AND a."executionDeadlineAt" AT TIME ZONE 'UTC'>clock_timestamp() AND
  current_setting('sylf.planner_role_fence',true)=a.fence::text AND current_setting('sylf.planner_reviewed_publication_version',true)='1' AND
  assessment->>'kind'='REVIEW' AND assessment->>'digest'=bundle->'review'->>'digest' AND assessment->'value'->>'schemaVersion'='2' AND
  assessment->'value'->>'verdict'='APPROVED' AND assessment->'value'->>'completeResultInspected'='true' AND assessment->'value'->'binding'=bundle->'binding' AND
  allocation->>'digest'=bundle->'binding'->'allocation'->>'digest' AND allocation->'value'->'learning'->'allocated'->'allocation'->>'status'='FEASIBLE' AND
  NEW."v2Artifact"->'blueprint'=blueprint AND NEW."v2Artifact"->'executable'=compiled->'specs' AND NEW."v2Artifact"->'context'=compiled->'context' AND
  EXISTS(SELECT 1 FROM jsonb_each(a."intelligenceArtifacts"->'entries') e WHERE e.value->>'kind'='CHECKPOINT' AND e.value->'value'->>'schemaVersion'='3' AND e.value->'value'->>'stage'='READY' AND
    e.value->'value'->'workflow'->'assessment'->>'digest'=bundle->'review'->>'digest' AND e.value->'value'->'workflow'->'candidate'->>'digest'=bundle->'binding'->'allocation'->>'digest') AND
  EXISTS(SELECT 1 FROM "AiUsageLog" l WHERE l."attemptId"=a.id AND l."userId"=a."userId" AND l."requestId"=(assessment->'value'->'producer'->>'callId')::uuid AND
    l."accountingState"='SETTLED' AND l.reservation->>'accepted'='true' AND l.reservation->'roleCall'->>'role'='REVIEWER' AND l.reservation->'result'->>'finishReason'='STOP' AND
    l.reservation->'roleCall'->>'inputDigest'=assessment->'value'->'producer'->>'inputDigest')) IS TRUE THEN
  RAISE EXCEPTION 'PLANNER_EXACT_REVIEWED_PUBLICATION_REQUIRED' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER planner_reviewed_publication_guard BEFORE INSERT OR UPDATE ON "PlannerRevision" FOR EACH ROW EXECUTE FUNCTION public.planner_reviewed_publication_guard();
REVOKE ALL ON FUNCTION public.planner_reviewed_publication_guard() FROM PUBLIC,anon,authenticated,service_role;

-- One SQL backstop extends the existing Calendar tables. It protects empty
-- ranges/catalogs too: a phantom insertion must serialize with confirmation.
CREATE FUNCTION public.calendar_planning_owners(table_name text, row_data jsonb) RETURNS SETOF integer LANGUAGE plpgsql SET search_path=public AS $$
DECLARE calendar_id text; event_id text; parent_row jsonb;
BEGIN
 IF table_name='User' THEN RETURN NEXT (row_data->>'id')::int;
 ELSIF table_name IN ('CalendarEvent','CalendarConnection','SharedCalendarMember') THEN
  RETURN NEXT (row_data->>'userId')::int;
 ELSIF table_name='SharedCalendar' THEN RETURN NEXT (row_data->>'ownerId')::int;
 END IF;
 IF table_name IN ('CalendarEvent','SharedCalendar','SharedCalendarMember') THEN
  calendar_id:=CASE table_name WHEN 'CalendarEvent' THEN row_data->>'sharedCalendarId' WHEN 'SharedCalendar' THEN row_data->>'id' ELSE row_data->>'calendarId' END;
  RETURN QUERY SELECT c."ownerId" FROM "SharedCalendar" c WHERE c.id=calendar_id
    UNION SELECT m."userId" FROM "SharedCalendarMember" m WHERE m."calendarId"=calendar_id;
 ELSIF table_name='CalendarEventException' THEN
  SELECT to_jsonb(e) INTO parent_row FROM "CalendarEvent" e WHERE e.id=row_data->>'eventId';
  IF parent_row IS NOT NULL THEN RETURN QUERY SELECT * FROM public.calendar_planning_owners('CalendarEvent',parent_row); END IF;
 ELSIF table_name='ConnectedCalendar' THEN
  RETURN QUERY SELECT c."userId" FROM "CalendarConnection" c WHERE c.id=row_data->>'connectionId';
 ELSIF table_name IN ('CalendarSyncWindow','ExternalCalendarEvent','ExternalCalendarMutation') THEN
  RETURN QUERY SELECT n."userId" FROM "ConnectedCalendar" c JOIN "CalendarConnection" n ON n.id=c."connectionId" WHERE c.id=row_data->>'calendarId';
 ELSIF table_name='CalendarSyncMember' THEN
  RETURN QUERY SELECT n."userId" FROM "CalendarSyncWindow" w JOIN "ConnectedCalendar" c ON c.id=w."calendarId" JOIN "CalendarConnection" n ON n.id=c."connectionId" WHERE w.id=row_data->>'windowId'
    UNION SELECT n."userId" FROM "ExternalCalendarEvent" e JOIN "ConnectedCalendar" c ON c.id=e."calendarId" JOIN "CalendarConnection" n ON n.id=c."connectionId" WHERE e.id=row_data->>'eventId';
 END IF;
END $$;
CREATE FUNCTION public.calendar_planning_lock() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE before_row jsonb:='{}'; after_row jsonb:='{}'; owner_id int;
BEGIN
 IF TG_OP IN ('UPDATE','DELETE') THEN before_row:=to_jsonb(OLD); END IF;
 IF TG_OP IN ('UPDATE','INSERT') THEN after_row:=to_jsonb(NEW); END IF;
 FOR owner_id IN SELECT DISTINCT value FROM (
  SELECT public.calendar_planning_owners(TG_TABLE_NAME,before_row) AS value
  UNION SELECT public.calendar_planning_owners(TG_TABLE_NAME,after_row) AS value
 ) owners WHERE value IS NOT NULL ORDER BY value LOOP
  -- Existing account tuple is a serialization witness, not another Calendar
  -- store. A final FOR UPDATE cannot confirm against an older MVCC snapshot.
  -- No accepted fact or application version changes. User updates already
  -- write this tuple themselves and must not recursively touch it.
  IF TG_TABLE_NAME<>'User' THEN
   -- Touch once per transaction/account. The tuple lock precedes the Calendar
   -- advisory lock, matching timezone/rest-day UPDATE ordering. Final Planner
   -- transactions use NOWAIT so they never form the reverse wait cycle.
   UPDATE "User" SET id=id WHERE id=owner_id AND xmin::text<>pg_current_xact_id()::text;
  END IF;
  PERFORM pg_advisory_xact_lock(73642,owner_id);
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE table_name text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['CalendarEvent','CalendarEventException','CalendarConnection','ConnectedCalendar','CalendarSyncWindow','ExternalCalendarEvent','CalendarSyncMember','ExternalCalendarMutation','SharedCalendar','SharedCalendarMember'] LOOP
  EXECUTE format('CREATE TRIGGER calendar_planning_lock BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION public.calendar_planning_lock()',table_name);
 END LOOP;
END $$;
CREATE TRIGGER calendar_planning_user_lock BEFORE UPDATE OF timezone,"restDays" ON "User" FOR EACH ROW EXECUTE FUNCTION public.calendar_planning_lock();
REVOKE ALL ON FUNCTION public.calendar_planning_owners(text,jsonb),public.calendar_planning_lock() FROM PUBLIC,anon,authenticated,service_role;


COMMIT;
