-- ============================================================
-- Migration: AI Usage Telemetry — cache-hit input split
--
-- DeepSeek's automatic context cache bills cache-hit input tokens
-- at ~10% of the normal input price. Track the split so cost
-- estimates reflect the REAL spend instead of over-estimating.
-- ============================================================

ALTER TABLE "AiUsageLog" ADD COLUMN IF NOT EXISTS "cacheHitTokens" INTEGER NOT NULL DEFAULT 0;
