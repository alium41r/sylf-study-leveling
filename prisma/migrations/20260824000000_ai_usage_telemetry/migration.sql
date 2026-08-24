-- ============================================================
-- Migration: AI Usage Telemetry Table
--
-- Request-level log of successful LLM generations (chat, planner,
-- syllabus) with token counts and an estimated USD cost, so the
-- owner can see where the DeepSeek balance actually goes.
-- Diagnostic-only: writing to this table never blocks a request.
-- ============================================================

CREATE TABLE IF NOT EXISTS "AiUsageLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "feature" TEXT NOT NULL,
    "workload" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AiUsageLog_userId_createdAt_idx" ON "AiUsageLog"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "AiUsageLog_feature_createdAt_idx" ON "AiUsageLog"("feature", "createdAt");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'AiUsageLog_userId_fkey'
    ) THEN
        ALTER TABLE "AiUsageLog" ADD CONSTRAINT "AiUsageLog_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
