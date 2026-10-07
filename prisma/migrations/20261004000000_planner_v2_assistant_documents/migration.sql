-- Bounded artifacts on the existing owned Plan, not additional workflow entities.
ALTER TABLE "PlannerPlan" ADD COLUMN conversation JSONB, ADD COLUMN "researchDocuments" JSONB;
ALTER TABLE "PlannerPlan" ADD CONSTRAINT planner_v2_conversation_envelope CHECK (
  conversation IS NULL OR (jsonb_typeof(conversation)='object' AND octet_length(conversation::text)<=131072));
ALTER TABLE "PlannerPlan" ADD CONSTRAINT planner_v2_documents_envelope CHECK (
  "researchDocuments" IS NULL OR (jsonb_typeof("researchDocuments")='array' AND jsonb_array_length("researchDocuments")<=9 AND octet_length("researchDocuments"::text)<=32768));
CREATE FUNCTION public.planner_v2_conversation_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.conversation IS DISTINCT FROM OLD.conversation THEN
  IF NEW."contractVersion"<>2 OR NEW."conversationVersion"<>OLD."conversationVersion"+1 THEN
   RAISE EXCEPTION 'PLANNER_CONVERSATION_CAS_REQUIRED' USING ERRCODE='23514';
  END IF;
 END IF;
 IF NEW."researchDocuments" IS DISTINCT FROM OLD."researchDocuments" AND NEW."contractVersion"<>2 THEN
  RAISE EXCEPTION 'PLANNER_DOCUMENT_OWNER_REQUIRED' USING ERRCODE='23514';
 END IF;
 IF OLD."researchDocuments" IS NOT NULL AND NOT COALESCE(NEW."researchDocuments",'[]'::jsonb) @> OLD."researchDocuments" THEN
  RAISE EXCEPTION 'PLANNER_DOCUMENT_RECEIPT_IMMUTABLE' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER planner_v2_conversation_guard BEFORE UPDATE ON "PlannerPlan" FOR EACH ROW EXECUTE FUNCTION public.planner_v2_conversation_guard();
REVOKE ALL ON FUNCTION public.planner_v2_conversation_guard() FROM PUBLIC,anon,authenticated,service_role;
