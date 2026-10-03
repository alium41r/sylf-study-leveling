-- CreateTable
CREATE TABLE "PlannerPlan" (
    "id" UUID NOT NULL,
    "userId" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'DRAFT',
    "subjectId" INTEGER,
    "goalId" INTEGER,
    "activeRevisionId" UUID,
    "latestDraftRevisionId" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,
    "creationKey" TEXT NOT NULL,
    "creationHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlannerPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlannerRevision" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "baseRevisionId" UUID,
    "baseVersion" INTEGER NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "inputSnapshot" JSONB NOT NULL,
    "availabilitySnapshot" JSONB NOT NULL,
    "outputSnapshot" JSONB,
    "digest" TEXT,
    "operationKey" TEXT NOT NULL,
    "operationHash" TEXT NOT NULL,
    "operationState" TEXT NOT NULL DEFAULT 'PREPARING',
    "leaseExpiresAt" TIMESTAMP(3),
    "quotaReceipt" JSONB,
    "confirmationKey" TEXT,
    "confirmationHash" TEXT,
    "confirmationReceipt" JSONB,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sealedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlannerRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlannerQuestLink" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "itemKey" UUID NOT NULL,
    "questId" INTEGER,
    "createdRevisionId" UUID NOT NULL,
    "appliedRevisionId" UUID NOT NULL,
    "disposition" TEXT NOT NULL DEFAULT 'LIVE',
    "baseline" JSONB NOT NULL,
    "changedAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "removalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlannerQuestLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlannerPlan_activeRevisionId_key" ON "PlannerPlan"("activeRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "PlannerPlan_latestDraftRevisionId_key" ON "PlannerPlan"("latestDraftRevisionId");

-- CreateIndex
CREATE INDEX "PlannerPlan_userId_state_createdAt_idx" ON "PlannerPlan"("userId", "state", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlannerPlan_userId_creationKey_key" ON "PlannerPlan"("userId", "creationKey");

-- CreateIndex
CREATE INDEX "PlannerRevision_operationState_leaseExpiresAt_idx" ON "PlannerRevision"("operationState", "leaseExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlannerRevision_planId_sequence_key" ON "PlannerRevision"("planId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "PlannerRevision_planId_operationKey_key" ON "PlannerRevision"("planId", "operationKey");

-- CreateIndex
CREATE UNIQUE INDEX "PlannerRevision_planId_confirmationKey_key" ON "PlannerRevision"("planId", "confirmationKey");

-- CreateIndex
CREATE UNIQUE INDEX "PlannerRevision_id_planId_key" ON "PlannerRevision"("id", "planId");

-- CreateIndex
CREATE UNIQUE INDEX "PlannerQuestLink_questId_key" ON "PlannerQuestLink"("questId");

-- CreateIndex
CREATE UNIQUE INDEX "PlannerQuestLink_planId_itemKey_key" ON "PlannerQuestLink"("planId", "itemKey");

-- AddForeignKey
ALTER TABLE "PlannerPlan" ADD CONSTRAINT "PlannerPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannerPlan" ADD CONSTRAINT "PlannerPlan_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannerPlan" ADD CONSTRAINT "PlannerPlan_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannerPlan" ADD CONSTRAINT "PlannerPlan_activeRevisionId_fkey" FOREIGN KEY ("activeRevisionId") REFERENCES "PlannerRevision"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannerPlan" ADD CONSTRAINT "PlannerPlan_latestDraftRevisionId_fkey" FOREIGN KEY ("latestDraftRevisionId") REFERENCES "PlannerRevision"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannerRevision" ADD CONSTRAINT "PlannerRevision_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlannerPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannerRevision" ADD CONSTRAINT "PlannerRevision_baseRevisionId_fkey" FOREIGN KEY ("baseRevisionId") REFERENCES "PlannerRevision"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannerQuestLink" ADD CONSTRAINT "PlannerQuestLink_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlannerPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannerQuestLink" ADD CONSTRAINT "PlannerQuestLink_questId_fkey" FOREIGN KEY ("questId") REFERENCES "Quest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannerQuestLink" ADD CONSTRAINT "PlannerQuestLink_createdRevisionId_fkey" FOREIGN KEY ("createdRevisionId") REFERENCES "PlannerRevision"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannerQuestLink" ADD CONSTRAINT "PlannerQuestLink_appliedRevisionId_fkey" FOREIGN KEY ("appliedRevisionId") REFERENCES "PlannerRevision"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- Membership constraints complement the single-column Prisma relations.
CREATE INDEX "PlannerPlan_goalId_idx" ON "PlannerPlan"("goalId");
CREATE INDEX "PlannerPlan_subjectId_idx" ON "PlannerPlan"("subjectId");
ALTER TABLE "PlannerPlan" ADD CONSTRAINT planner_active_membership FOREIGN KEY ("activeRevisionId", id) REFERENCES "PlannerRevision"(id, "planId") DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "PlannerPlan" ADD CONSTRAINT planner_draft_membership FOREIGN KEY ("latestDraftRevisionId", id) REFERENCES "PlannerRevision"(id, "planId") DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "PlannerRevision" ADD CONSTRAINT planner_base_membership FOREIGN KEY ("baseRevisionId", "planId") REFERENCES "PlannerRevision"(id, "planId");
ALTER TABLE "PlannerQuestLink" ADD CONSTRAINT planner_created_membership FOREIGN KEY ("createdRevisionId", "planId") REFERENCES "PlannerRevision"(id, "planId");
ALTER TABLE "PlannerQuestLink" ADD CONSTRAINT planner_applied_membership FOREIGN KEY ("appliedRevisionId", "planId") REFERENCES "PlannerRevision"(id, "planId");
ALTER TABLE "PlannerPlan" ADD CONSTRAINT planner_plan_bounds CHECK (
  mode IN ('EXAM','ROADMAP','MASTERY') AND state IN ('DRAFT','ACTIVE','ARCHIVED') AND version >= 0
  AND length(title) BETWEEN 1 AND 200 AND length("creationKey") BETWEEN 8 AND 100 AND "creationHash" ~ '^[a-f0-9]{64}$');
ALTER TABLE "PlannerRevision" ADD CONSTRAINT planner_revision_bounds CHECK (
  sequence > 0 AND "baseVersion" >= 0 AND "schemaVersion" = 1
  AND source IN ('GENERATE','EDIT','EXPAND','REBALANCE')
  AND "operationState" IN ('PREPARING','SEALED','FAILED','CANCELLED')
  AND length("operationKey") BETWEEN 8 AND 100 AND "operationHash" ~ '^[a-f0-9]{64}$'
  AND octet_length("inputSnapshot"::text) <= 65536 AND octet_length("availabilitySnapshot"::text) <= 1048576
  AND ("outputSnapshot" IS NULL OR octet_length("outputSnapshot"::text) <= 524288)
  AND ("operationState" <> 'PREPARING' OR "leaseExpiresAt" IS NOT NULL)
  AND jsonb_typeof("inputSnapshot") = 'object' AND jsonb_typeof("availabilitySnapshot") = 'object'
  AND (("operationState" = 'SEALED' AND "outputSnapshot" IS NOT NULL AND jsonb_typeof("outputSnapshot") = 'object' AND digest IS NOT NULL AND digest ~ '^[a-f0-9]{64}$' AND "sealedAt" IS NOT NULL)
       OR ("operationState" <> 'SEALED' AND "outputSnapshot" IS NULL AND digest IS NULL AND "sealedAt" IS NULL))
  AND (("confirmationKey" IS NULL AND "confirmationHash" IS NULL AND "confirmationReceipt" IS NULL AND "confirmedAt" IS NULL)
       OR ("operationState" = 'SEALED' AND "confirmationKey" IS NOT NULL AND length("confirmationKey") BETWEEN 8 AND 100 AND "confirmationHash" IS NOT NULL AND "confirmationHash" ~ '^[a-f0-9]{64}$' AND "confirmationReceipt" IS NOT NULL AND jsonb_typeof("confirmationReceipt") = 'object' AND "confirmedAt" IS NOT NULL)));
ALTER TABLE "PlannerQuestLink" ADD CONSTRAINT planner_link_bounds CHECK (
  disposition IN ('LIVE','DETACHED','DELETED') AND octet_length(baseline::text) <= 16384
  AND ((disposition = 'DELETED' AND "questId" IS NULL AND "removedAt" IS NOT NULL) OR (disposition <> 'DELETED' AND "questId" IS NOT NULL)));

CREATE FUNCTION public.planner_revision_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF ROW(NEW.id, NEW."planId", NEW.sequence, NEW.source, NEW."baseRevisionId", NEW."baseVersion", NEW."schemaVersion", NEW."operationKey", NEW."operationHash", NEW."createdAt")
      IS DISTINCT FROM ROW(OLD.id, OLD."planId", OLD.sequence, OLD.source, OLD."baseRevisionId", OLD."baseVersion", OLD."schemaVersion", OLD."operationKey", OLD."operationHash", OLD."createdAt") THEN
    RAISE EXCEPTION 'PLANNER_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  IF OLD."operationState" <> 'PREPARING' AND
     ROW(NEW."inputSnapshot", NEW."availabilitySnapshot", NEW."outputSnapshot", NEW.digest, NEW."sealedAt", NEW."operationState")
       IS DISTINCT FROM ROW(OLD."inputSnapshot", OLD."availabilitySnapshot", OLD."outputSnapshot", OLD.digest, OLD."sealedAt", OLD."operationState") THEN
    RAISE EXCEPTION 'PLANNER_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  IF OLD."confirmationReceipt" IS NOT NULL AND
     ROW(NEW."confirmationKey", NEW."confirmationHash", NEW."confirmationReceipt", NEW."confirmedAt")
       IS DISTINCT FROM ROW(OLD."confirmationKey", OLD."confirmationHash", OLD."confirmationReceipt", OLD."confirmedAt") THEN
    RAISE EXCEPTION 'PLANNER_RECEIPT_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  IF OLD."quotaReceipt" IS NOT NULL AND (
      (OLD."quotaReceipt" - 'state' - 'settledAt') IS DISTINCT FROM (NEW."quotaReceipt" - 'state' - 'settledAt')
      OR (OLD."quotaReceipt"->>'state' <> 'RESERVED' AND OLD."quotaReceipt" IS DISTINCT FROM NEW."quotaReceipt")
      OR NEW."quotaReceipt"->>'state' NOT IN ('RESERVED','SETTLED','RELEASED')) THEN
    RAISE EXCEPTION 'PLANNER_QUOTA_RECEIPT_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER planner_revision_guard BEFORE UPDATE ON "PlannerRevision" FOR EACH ROW EXECUTE FUNCTION public.planner_revision_guard();

CREATE FUNCTION public.planner_ownership_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE owner_id integer;
BEGIN
  IF TG_TABLE_NAME = 'PlannerPlan' THEN
    IF TG_OP = 'UPDATE' AND (NEW."userId" <> OLD."userId" OR NEW.mode <> OLD.mode OR NEW.version < OLD.version OR NEW."creationKey" <> OLD."creationKey" OR NEW."creationHash" <> OLD."creationHash") THEN
      RAISE EXCEPTION 'PLANNER_IDENTITY_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
    IF (NEW."subjectId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Subject" WHERE id = NEW."subjectId" AND "userId" = NEW."userId"))
      OR (NEW."goalId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Goal" WHERE id = NEW."goalId" AND "userId" = NEW."userId")) THEN
      RAISE EXCEPTION 'PLANNER_OWNERSHIP' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF TG_OP = 'UPDATE' AND (NEW."planId" <> OLD."planId" OR NEW."itemKey" <> OLD."itemKey" OR NEW."createdRevisionId" <> OLD."createdRevisionId" OR NEW.baseline <> OLD.baseline OR (OLD."questId" IS NOT NULL AND NEW."questId" IS NOT NULL AND NEW."questId" <> OLD."questId") OR (OLD.disposition = 'DELETED' AND NEW IS DISTINCT FROM OLD)) THEN
      RAISE EXCEPTION 'PLANNER_LINEAGE_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
    SELECT "userId" INTO owner_id FROM "PlannerPlan" WHERE id = NEW."planId";
    IF NEW."questId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Quest" WHERE id = NEW."questId" AND "userId" = owner_id) THEN
      RAISE EXCEPTION 'PLANNER_OWNERSHIP' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER planner_plan_ownership BEFORE INSERT OR UPDATE ON "PlannerPlan" FOR EACH ROW EXECUTE FUNCTION public.planner_ownership_guard();
CREATE TRIGGER planner_link_ownership BEFORE INSERT OR UPDATE ON "PlannerQuestLink" FOR EACH ROW EXECUTE FUNCTION public.planner_ownership_guard();

-- Backstop for every legacy writer, including a mutation racing a preflight.
-- A narrowly scoped transaction-local capability is set only by the intentional
-- manual edit/delete service. Execution status, timer and reward RPCs stay intact.
CREATE FUNCTION public.planner_quest_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE linked boolean; structural boolean; unsafe_change boolean;
BEGIN
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
CREATE TRIGGER planner_quest_guard BEFORE UPDATE OR DELETE ON "Quest" FOR EACH ROW EXECUTE FUNCTION public.planner_quest_guard();

CREATE FUNCTION public.planner_goal_delete_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM "User" WHERE id = OLD."userId") THEN RETURN OLD; END IF;
  IF EXISTS (SELECT 1 FROM "PlannerPlan" WHERE "goalId" = OLD.id) OR EXISTS (SELECT 1 FROM "PlannerQuestLink" l JOIN "Quest" q ON q.id = l."questId" WHERE q."goalId" = OLD.id) THEN
    IF TG_OP = 'DELETE' OR current_setting('sylf.planner_manual_goal', true) IS DISTINCT FROM OLD.id::text THEN
      RAISE EXCEPTION 'PLANNER_REVIEW_REQUIRED' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER planner_goal_delete_guard BEFORE UPDATE OR DELETE ON "Goal" FOR EACH ROW EXECUTE FUNCTION public.planner_goal_delete_guard();

-- Private app-server storage: RLS enabled, no client policies/grants, no Realtime publication.
ALTER TABLE "PlannerPlan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlannerRevision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlannerQuestLink" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "PlannerPlan", "PlannerRevision", "PlannerQuestLink" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.planner_revision_guard(), public.planner_ownership_guard(), public.planner_quest_guard(), public.planner_goal_delete_guard() FROM PUBLIC, anon, authenticated, service_role;
