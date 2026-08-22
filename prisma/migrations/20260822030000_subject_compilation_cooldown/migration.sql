-- ============================================================
-- Migration: Subject Compilation Cooldown
--
-- Adds Subject.lastCompiledAt, set when the AI 48-node syllabus
-- compilation commits. Recompiles are rejected for 30 days after
-- the last successful compilation.
-- ============================================================

ALTER TABLE "Subject"
    ADD COLUMN IF NOT EXISTS "lastCompiledAt" TIMESTAMP(3);
