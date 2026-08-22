-- ============================================================
-- Add Objective Accent Color Preset & Exact Deadline Support
-- ============================================================
-- 1. Goal.color: curated cyber/neon accent preset token stored
--    on the Goal model (EMERALD | CYAN | BLUE | VIOLET | ROSE | AMBER).
ALTER TABLE "Goal" ADD COLUMN "color" TEXT NOT NULL DEFAULT 'EMERALD';

-- 2. Goal.targetDate: exact objective deadline stored as UTC
--    (representational midnight of the user-chosen calendar date)
--    so countdown labels can render exact day-level granularity.
ALTER TABLE "Goal" ADD COLUMN "targetDate" TIMESTAMP(3);

-- 3. Quest.goalId -> Goal.id is fully mapped in Prisma; add an index
--    for calendar milestone lookups and color-inheritance joins.
CREATE INDEX "Goal_userId_targetDate_idx" ON "Goal"("userId", "targetDate");
CREATE INDEX "Quest_goalId_idx" ON "Quest"("goalId");
