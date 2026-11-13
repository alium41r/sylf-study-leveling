-- Shared syllabus library and plan feedback for the Planning Studio. Additive only.

-- CreateTable
CREATE TABLE "SyllabusOutline" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "altKey" TEXT,
    "name" TEXT NOT NULL,
    "preset" TEXT NOT NULL,
    "outline" JSONB NOT NULL,
    "sources" JSONB NOT NULL,
    "edition" TEXT,
    "trust" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "confirmations" INTEGER NOT NULL DEFAULT 0,
    "reports" INTEGER NOT NULL DEFAULT 0,
    "checkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyllabusOutline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanFeedback" (
    "id" UUID NOT NULL,
    "userId" INTEGER NOT NULL,
    "goalKey" TEXT NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 0,
    "outlineId" UUID,
    "verdict" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SyllabusOutline_key_key" ON "SyllabusOutline"("key");
CREATE UNIQUE INDEX "SyllabusOutline_altKey_key" ON "SyllabusOutline"("altKey");
CREATE UNIQUE INDEX "PlanFeedback_userId_goalKey_round_key" ON "PlanFeedback"("userId", "goalKey", "round");
CREATE INDEX "PlanFeedback_outlineId_idx" ON "PlanFeedback"("outlineId");

-- AddForeignKey
ALTER TABLE "PlanFeedback" ADD CONSTRAINT "PlanFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanFeedback" ADD CONSTRAINT "PlanFeedback_outlineId_fkey" FOREIGN KEY ("outlineId") REFERENCES "SyllabusOutline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Closed vocabularies and sane bounds.
ALTER TABLE "SyllabusOutline" ADD CONSTRAINT syllabus_outline_bounds CHECK (
  "trust" IN ('CHECKED','UNVERIFIED')
  AND "preset" IN ('exam','course','mastery','skill','assignment','reading')
  AND "version" >= 1 AND "confirmations" >= 0 AND "reports" >= 0
  AND char_length("key") BETWEEN 3 AND 240
);
ALTER TABLE "PlanFeedback" ADD CONSTRAINT plan_feedback_bounds CHECK (
  "verdict" IN ('ACCURATE','INACCURATE','DISMISSED')
  AND "round" >= 0
  AND ("note" IS NULL OR char_length("note") <= 600)
);

-- Server-only storage: the server reaches it through Prisma; clients never do.
ALTER TABLE "SyllabusOutline" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlanFeedback" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "SyllabusOutline", "PlanFeedback" FROM PUBLIC, anon, authenticated, service_role;
