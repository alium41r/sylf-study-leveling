-- CreateTable
CREATE TABLE "PlannerIntakeSession" (
    "id" UUID NOT NULL,
    "userId" INTEGER NOT NULL,
    "clientKey" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "brief" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "planId" UUID,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlannerIntakeSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlannerIntakeSession_userId_clientKey_key" ON "PlannerIntakeSession"("userId", "clientKey");

-- CreateIndex
CREATE INDEX "PlannerIntakeSession_userId_updatedAt_idx" ON "PlannerIntakeSession"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "PlannerIntakeSession_expiresAt_idx" ON "PlannerIntakeSession"("expiresAt");

-- AddForeignKey
ALTER TABLE "PlannerIntakeSession" ADD CONSTRAINT "PlannerIntakeSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannerIntakeSession" ADD CONSTRAINT "PlannerIntakeSession_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlannerPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The mode is the closed planner vocabulary. The client-minted `clientKey` is
-- bounded exactly like the existing operation/creation keys (8..100 URL-safe
-- characters), which is what makes (userId, clientKey) a safe idempotency key.
-- `version` is an optimistic-concurrency counter and never goes negative. The
-- brief itself is deliberately NOT bounded here: its 64 KiB envelope is enforced
-- by the server module on write (a JSONB size CHECK would add no protection and
-- would churn the column's byte layout without a length to compare against).
ALTER TABLE "PlannerIntakeSession" ADD CONSTRAINT planner_intake_session_bounds CHECK (
  "mode" IN ('EXAM','ROADMAP','MASTERY')
  AND "version" >= 0
  AND length("clientKey") BETWEEN 8 AND 100
  AND "clientKey" ~ '^[A-Za-z0-9_-]+$');

-- Private app-server storage: RLS enabled, no client policies/grants, no Realtime publication.
ALTER TABLE "PlannerIntakeSession" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "PlannerIntakeSession" FROM PUBLIC, anon, authenticated, service_role;
