-- ============================================================================
-- Phase 5B+: Custom User Focus Background Layout Key Support
-- ============================================================================
-- Adds layoutKey ('classic' | 'anime' | 'landscape' | 'fantasy') to UserFocusBackground.
-- Defaults to 'classic' ensuring backward compatibility for existing personal libraries.
-- Adds a CHECK constraint to enforce valid layout keys.
-- ============================================================================

ALTER TABLE public."UserFocusBackground" ADD COLUMN IF NOT EXISTS "layoutKey" TEXT DEFAULT 'classic';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'UserFocusBackground_layoutKey_check'
  ) THEN
    ALTER TABLE public."UserFocusBackground"
      ADD CONSTRAINT "UserFocusBackground_layoutKey_check"
      CHECK ("layoutKey" IS NULL OR "layoutKey" IN ('classic', 'anime', 'landscape', 'fantasy'));
  END IF;
END $$;
