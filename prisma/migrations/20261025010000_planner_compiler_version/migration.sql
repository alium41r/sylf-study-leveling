-- Existing and in-flight attempts retain compiler v1, independently of flags,
-- checkpoints or later worker versions. No execution/history backfill.
ALTER TABLE "PlannerAttempt" ADD COLUMN "compilerVersion" integer NOT NULL DEFAULT 1;
ALTER TABLE "PlannerAttempt" ADD CONSTRAINT planner_compiler_version CHECK ("compilerVersion" IN (1,2));

CREATE FUNCTION public.planner_compiler_version_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW."compilerVersion" IS DISTINCT FROM OLD."compilerVersion" THEN
  RAISE EXCEPTION 'PLANNER_COMPILER_VERSION_IMMUTABLE' USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE' AND NEW."compilerVersion"=2 AND OLD.state='QUEUED' AND NEW.state='RUNNING' AND
   current_setting('sylf.planner_compiler_version',true) IS DISTINCT FROM '2' THEN
  RAISE EXCEPTION 'PLANNER_COMPILER_CLAIM_CAPABILITY_REQUIRED' USING ERRCODE='23514';
 END IF;
 IF NEW."compilerVersion"=2 AND (NEW.kind NOT IN ('PLAN','REPLAN','JOINT') OR
   NEW.payload->'checkpoint' IS NOT NULL AND NEW.payload->'checkpoint'<>'null'::jsonb) THEN
  RAISE EXCEPTION 'PLANNER_COMPILER_VERSION_MISMATCH' USING ERRCODE='23514';
 END IF;
 IF NEW."compilerVersion"=1 AND NEW."intelligenceArtifacts" IS NOT NULL AND
   (TG_OP='INSERT' OR NEW."intelligenceArtifacts" IS DISTINCT FROM OLD."intelligenceArtifacts") THEN
  RAISE EXCEPTION 'PLANNER_COMPILER_VERSION_MISMATCH' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER planner_compiler_version_guard BEFORE INSERT OR UPDATE ON "PlannerAttempt"
 FOR EACH ROW EXECUTE FUNCTION public.planner_compiler_version_guard();
REVOKE ALL ON FUNCTION public.planner_compiler_version_guard() FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.planner_revision_compiler_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE version integer;
BEGIN
 IF NEW."schemaVersion"=2 AND NEW."v2Artifact" IS NOT NULL THEN
  SELECT "compilerVersion" INTO version FROM "PlannerAttempt" WHERE id=NEW."attemptId";
  IF version IS NULL OR (version=2) IS DISTINCT FROM (NEW."intelligenceBundle" IS NOT NULL) THEN
   RAISE EXCEPTION 'PLANNER_REVISION_COMPILER_MISMATCH' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER planner_revision_compiler_guard BEFORE INSERT OR UPDATE ON "PlannerRevision"
 FOR EACH ROW EXECUTE FUNCTION public.planner_revision_compiler_guard();
REVOKE ALL ON FUNCTION public.planner_revision_compiler_guard() FROM PUBLIC, anon, authenticated, service_role;
