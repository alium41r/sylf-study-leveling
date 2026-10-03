-- AlterTable
ALTER TABLE "Subject" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Subject_userId_archivedAt_idx" ON "Subject"("userId", "archivedAt");
