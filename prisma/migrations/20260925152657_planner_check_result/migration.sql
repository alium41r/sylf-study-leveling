-- CreateTable
CREATE TABLE "PlannerCheckResult" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "userId" INTEGER NOT NULL,
    "revisionId" UUID NOT NULL,
    "itemKey" UUID NOT NULL,
    "result" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlannerCheckResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlannerCheckResult_planId_itemKey_key" ON "PlannerCheckResult"("planId", "itemKey");

-- CreateIndex
CREATE INDEX "PlannerCheckResult_userId_planId_idx" ON "PlannerCheckResult"("userId", "planId");

-- AddForeignKey
ALTER TABLE "PlannerCheckResult" ADD CONSTRAINT "PlannerCheckResult_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlannerPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannerCheckResult" ADD CONSTRAINT "PlannerCheckResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The reported result is a fixed, user-chosen vocabulary — never free text, never
-- a score — so the database rejects anything outside the three closed values.
ALTER TABLE "PlannerCheckResult" ADD CONSTRAINT planner_check_result_bounds CHECK (
  result IN ('NEEDS_MORE_WORK','FELT_OK','READY_TO_MOVE_ON'));

-- Private app-server storage: RLS enabled, no client policies/grants, no Realtime publication.
ALTER TABLE "PlannerCheckResult" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "PlannerCheckResult" FROM PUBLIC, anon, authenticated, service_role;
