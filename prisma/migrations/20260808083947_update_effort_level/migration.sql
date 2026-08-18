/*
  Warnings:

  - The values [EASY,HARD] on the enum `EffortLevel` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "EffortLevel_new" AS ENUM ('RELAXED', 'NORMAL', 'INTENSE', 'EXTREME');

ALTER TABLE "public"."Goal" ALTER COLUMN "effortLevel" DROP DEFAULT;

-- Safely cast old values to the new enum
ALTER TABLE "Goal" ALTER COLUMN "effortLevel" TYPE "EffortLevel_new" USING 
  CASE 
    WHEN "effortLevel"::text = 'EASY' THEN 'RELAXED'::"EffortLevel_new"
    WHEN "effortLevel"::text = 'HARD' THEN 'INTENSE'::"EffortLevel_new"
    ELSE "effortLevel"::text::"EffortLevel_new"
  END;

ALTER TYPE "EffortLevel" RENAME TO "EffortLevel_old";
ALTER TYPE "EffortLevel_new" RENAME TO "EffortLevel";
DROP TYPE "public"."EffortLevel_old";

ALTER TABLE "Goal" ALTER COLUMN "effortLevel" SET DEFAULT 'NORMAL';
COMMIT;
