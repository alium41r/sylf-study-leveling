-- ============================================================
-- Floating Rest Days & Automatic Quest Cascade
-- ============================================================
-- Ad-hoc rest days (events, sickness, family) with a strict quota
-- of 1 per ISO week. Named "Floating Rest Day" — a single concrete
-- token that can be designated/undesignated without rewriting the
-- fixed weekly `User.restDays` schedule.
-- ============================================================

-- CreateTable
CREATE TABLE "FloatingRestDay" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "dateKey" TEXT NOT NULL,
    "weekKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FloatingRestDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: one floating rest day per user per calendar date
CREATE UNIQUE INDEX "FloatingRestDay_userId_dateKey_key" ON "FloatingRestDay"("userId", "dateKey");

-- CreateIndex: O(1) weekly quota checks
CREATE INDEX "FloatingRestDay_userId_weekKey_idx" ON "FloatingRestDay"("userId", "weekKey");

-- AddForeignKey
ALTER TABLE "FloatingRestDay" ADD CONSTRAINT "FloatingRestDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
