-- ============================================================
-- Migration: Atomic Daily Usage Quota Table
--
-- Replaces the fragile SystemMessage-prefix quota markers with a
-- dedicated UserQuota table. Consumption is enforced atomically in
-- Postgres (unique (userId, feature, dateKey) + guarded upsert),
-- which closes the parallel-request bypass that check-then-record
-- was vulnerable to.
-- ============================================================

CREATE TABLE IF NOT EXISTS "UserQuota" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "feature" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserQuota_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserQuota_userId_feature_dateKey_key" ON "UserQuota"("userId", "feature", "dateKey");
CREATE INDEX IF NOT EXISTS "UserQuota_userId_idx" ON "UserQuota"("userId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'UserQuota_userId_fkey'
    ) THEN
        ALTER TABLE "UserQuota" ADD CONSTRAINT "UserQuota_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
