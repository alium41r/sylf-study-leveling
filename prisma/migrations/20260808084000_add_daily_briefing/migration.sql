-- AlterEnum
ALTER TYPE "SystemMessageType" ADD VALUE 'DAILY_BRIEFING';

-- CreateEnum
CREATE TYPE "BriefingStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'UTC';

-- CreateTable
CREATE TABLE "DailyBriefingLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "dateKey" TEXT NOT NULL,
    "status" "BriefingStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyBriefingLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyBriefingLog_userId_dateKey_key" ON "DailyBriefingLog"("userId", "dateKey");

-- AddForeignKey
ALTER TABLE "DailyBriefingLog" ADD CONSTRAINT "DailyBriefingLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
