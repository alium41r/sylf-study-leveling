-- UX Phase 5: the released-work re-offer needs one bounded piece of bookkeeping.
--
-- Phase 4 made a release durable: `disposition = 'USER_RELEASED'` freezes the record of the
-- student's decision, so no later replan can hand the same responsibility back. Phase 5 adds
-- the other half — Sylf may *explicitly offer* a replacement, and the student may decline it —
-- and that needs somewhere to remember the answer, or the same offer would return on every
-- refresh and replan.
--
-- Two additive columns, both NULL for every existing row and for every release that has never
-- been re-offered. They are bookkeeping about an *offer*, never about the decision:
-- `disposition`, `itemKey`, `baseline`, `removedAt` and `removalReason` stay immutable.
--
-- The guard is amended for exactly that reason, and only that far: a `USER_RELEASED` row may
-- now change its re-offer columns and nothing else. Every other column stays frozen, `DELETED`
-- rows are untouched by the relaxation, and no other write path gains anything.

ALTER TABLE "PlannerQuestLink"
  ADD COLUMN "reofferState" TEXT,
  ADD COLUMN "reofferedAt" TIMESTAMP(3);

-- A closed vocabulary, or NULL. Enforced in the database as well as in the contract, because
-- a value outside it would be a state no reader knows how to interpret.
ALTER TABLE "PlannerQuestLink" ADD CONSTRAINT planner_reoffer_state_bounds CHECK (
  "reofferState" IS NULL OR "reofferState" IN ('OFFERED','ACCEPTED','DECLINED')
);

-- The guard body is otherwise unchanged: ownership, plan/identity immutability and the Quest
-- ownership check all behave exactly as before.
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
    IF TG_OP = 'UPDATE' AND (
      NEW."planId" <> OLD."planId" OR NEW."itemKey" <> OLD."itemKey" OR NEW."createdRevisionId" <> OLD."createdRevisionId" OR NEW.baseline <> OLD.baseline
      OR (OLD."questId" IS NOT NULL AND NEW."questId" IS NOT NULL AND NEW."questId" <> OLD."questId")
      -- A tombstone is frozen. The frozen set is named explicitly now, rather than being the
      -- whole row, so the re-offer bookkeeping columns can move without the decision moving.
      OR (
        OLD.disposition IN ('DELETED','USER_RELEASED')
        AND (
          NEW."planId", NEW."itemKey", NEW."questId", NEW."createdRevisionId", NEW."appliedRevisionId",
          NEW.disposition, NEW.baseline, NEW."removedAt", NEW."removalReason", NEW."createdAt"
        ) IS DISTINCT FROM (
          OLD."planId", OLD."itemKey", OLD."questId", OLD."createdRevisionId", OLD."appliedRevisionId",
          OLD.disposition, OLD.baseline, OLD."removedAt", OLD."removalReason", OLD."createdAt"
        )
      )
      -- …and only a USER_RELEASED tombstone has re-offer columns to move.
      OR (
        OLD.disposition <> 'USER_RELEASED'
        AND (NEW."reofferState" IS DISTINCT FROM OLD."reofferState" OR NEW."reofferedAt" IS DISTINCT FROM OLD."reofferedAt")
      )
    ) THEN
      RAISE EXCEPTION 'PLANNER_LINEAGE_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
    SELECT "userId" INTO owner_id FROM "PlannerPlan" WHERE id = NEW."planId";
    IF NEW."questId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Quest" WHERE id = NEW."questId" AND "userId" = owner_id) THEN
      RAISE EXCEPTION 'PLANNER_OWNERSHIP' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
