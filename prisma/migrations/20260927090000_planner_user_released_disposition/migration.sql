-- UX Phase 4: releasing planner-generated work is not the same fact as deleting a Quest.
--
-- The student may explicitly stop being responsible for a specific, unstarted piece of
-- planner-generated work. The Quest goes away exactly as it would if they deleted it, but
-- the planner must *remember* that this was their decision — otherwise a later replan,
-- rebalance, refresh or regeneration could silently hand the same responsibility back.
--
-- Two additive changes, both backward compatible:
--
-- 1. `USER_RELEASED` becomes a recognised disposition. The existing `DELETED` shape rule
--    (no Quest, a removal timestamp) applies to it identically, and every existing row
--    keeps the disposition and the guarantee it already had.
-- 2. A released link is frozen like a tombstone: once recorded, it may not be rewritten,
--    so the record of the student's decision cannot be edited away by any later writer.
--
-- No column, index or table is added; no data is rewritten.

ALTER TABLE "PlannerQuestLink" DROP CONSTRAINT planner_link_bounds;
ALTER TABLE "PlannerQuestLink" ADD CONSTRAINT planner_link_bounds CHECK (
  disposition IN ('LIVE','DETACHED','DELETED','USER_RELEASED') AND octet_length(baseline::text) <= 16384
  AND (
    (disposition IN ('DELETED','USER_RELEASED') AND "questId" IS NULL AND "removedAt" IS NOT NULL)
    OR (disposition NOT IN ('DELETED','USER_RELEASED') AND "questId" IS NOT NULL)
  ));

-- The guard body is otherwise unchanged: ownership, plan/identity immutability and the
-- Quest ownership check all behave exactly as before.
CREATE OR REPLACE FUNCTION public.planner_ownership_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
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
    IF TG_OP = 'UPDATE' AND (NEW."planId" <> OLD."planId" OR NEW."itemKey" <> OLD."itemKey" OR NEW."createdRevisionId" <> OLD."createdRevisionId" OR NEW.baseline <> OLD.baseline OR (OLD."questId" IS NOT NULL AND NEW."questId" IS NOT NULL AND NEW."questId" <> OLD."questId") OR (OLD.disposition IN ('DELETED','USER_RELEASED') AND NEW IS DISTINCT FROM OLD)) THEN
      RAISE EXCEPTION 'PLANNER_LINEAGE_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
    SELECT "userId" INTO owner_id FROM "PlannerPlan" WHERE id = NEW."planId";
    IF NEW."questId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Quest" WHERE id = NEW."questId" AND "userId" = owner_id) THEN
      RAISE EXCEPTION 'PLANNER_OWNERSHIP' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
