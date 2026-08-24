-- ============================================================
-- Migration: SystemMessage.modelUsed
--
-- Store the engine/model that produced each AI reply as a real column
-- instead of an HTML comment embedded in the content. The content-based
-- `<!-- model: X -->` marker rendered visibly to users; keeping the
-- model identity out of the content fixes that and keeps history clean.
-- ============================================================

ALTER TABLE "SystemMessage" ADD COLUMN IF NOT EXISTS "modelUsed" TEXT;
