-- CreateTable
CREATE TABLE "PlannerPreference" (
    "id" UUID NOT NULL,
    "userId" INTEGER NOT NULL,
    "planId" UUID,
    "preferenceType" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "evidenceCount" INTEGER NOT NULL DEFAULT 0,
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "lastConfirmedAt" TIMESTAMP(3),
    "ignoredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlannerPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlannerFrictionEvent" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "revisionId" UUID,
    "itemKey" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlannerFrictionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlannerPreference_userId_planId_preferenceType_key" ON "PlannerPreference"("userId", "planId", "preferenceType");

-- CreateIndex
CREATE INDEX "PlannerPreference_userId_planId_idx" ON "PlannerPreference"("userId", "planId");

-- CreateIndex
CREATE INDEX "PlannerPreference_userId_preferenceType_idx" ON "PlannerPreference"("userId", "preferenceType");

-- CreateIndex
CREATE UNIQUE INDEX "PlannerFrictionEvent_userId_planId_revisionId_itemKey_reasonCode_key" ON "PlannerFrictionEvent"("userId", "planId", "revisionId", "itemKey", "reasonCode");

-- CreateIndex
CREATE INDEX "PlannerFrictionEvent_planId_idx" ON "PlannerFrictionEvent"("planId");

-- CreateIndex
CREATE INDEX "PlannerFrictionEvent_userId_createdAt_idx" ON "PlannerFrictionEvent"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "PlannerPreference" ADD CONSTRAINT "PlannerPreference_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlannerPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannerPreference" ADD CONSTRAINT "PlannerPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannerFrictionEvent" ADD CONSTRAINT "PlannerFrictionEvent_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlannerPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannerFrictionEvent" ADD CONSTRAINT "PlannerFrictionEvent_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "PlannerRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannerFrictionEvent" ADD CONSTRAINT "PlannerFrictionEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A learned planning preference is one bounded, canonical value per
-- (user, plan, type). A NULL planId means the preference applies to the user's
-- planning in general. `value` is a canonical token, never free text and never
-- academic content (no topic/quest titles):
--   SESSION_LENGTH       -> canonical integer minutes, "15".."240" (e.g. "45")
--   DAILY_DENSITY        -> canonical integer percent, "0".."100" (e.g. "80")
--   DEMANDING_PLACEMENT  -> EARLY | MIDDAY | LATE
--   TASK_DETAIL          -> LOW | MEDIUM | HIGH
--   BUFFER_STYLE         -> NONE | BETWEEN_SESSIONS | END_OF_WEEK
-- `confidence` is 0..100 (100 = explicitly confirmed). `evidenceCount` counts
-- independent candidate observations and never goes negative.
ALTER TABLE "PlannerPreference" ADD CONSTRAINT planner_preference_bounds CHECK (
  "preferenceType" IN ('SESSION_LENGTH','DAILY_DENSITY','DEMANDING_PLACEMENT','TASK_DETAIL','BUFFER_STYLE')
  AND length("value") BETWEEN 1 AND 64
  AND "value" ~ '^[A-Za-z0-9_]+$'
  AND "evidenceCount" >= 0
  AND "confidence" BETWEEN 0 AND 100);

-- Deterministic uniqueness. A UNIQUE constraint treats NULLs as distinct, so the
-- "one preference per (user, type) when planId IS NULL" case needs its own
-- partial unique index; without it a general preference could be duplicated.
CREATE UNIQUE INDEX "PlannerPreference_userId_preferenceType_planless_key"
  ON "PlannerPreference"("userId", "preferenceType") WHERE "planId" IS NULL;

-- A user-reported friction reason is one closed code per planner draft item.
-- Deliberately no free-text note column: the closed code is the whole signal.
-- `itemKey` is the planner draft item key — a canonical lowercase UUID — and is
-- deliberately NOT a Quest id, because friction is reported against a draft item
-- which may predate (or never become) a Quest.
ALTER TABLE "PlannerFrictionEvent" ADD CONSTRAINT planner_friction_bounds CHECK (
  "reasonCode" IN ('TOO_LONG','TOO_HARD','UNCLEAR','NO_MATERIAL','ALREADY_KNEW','LOW_VALUE')
  AND length("itemKey") = 36
  AND "itemKey" ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$');

-- The same user cannot record the same reason twice for the same item in the
-- same revision. When no revision is recorded (revisionId IS NULL) the reason is
-- still unique per item — a partial unique index, because a UNIQUE constraint
-- treats NULL revision ids as distinct.
CREATE UNIQUE INDEX "PlannerFrictionEvent_userId_planId_itemKey_reasonCode_planless_key"
  ON "PlannerFrictionEvent"("userId", "planId", "itemKey", "reasonCode") WHERE "revisionId" IS NULL;

-- Private app-server storage: RLS enabled, no client policies/grants, no Realtime publication.
ALTER TABLE "PlannerPreference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlannerFrictionEvent" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "PlannerPreference", "PlannerFrictionEvent" FROM PUBLIC, anon, authenticated, service_role;
