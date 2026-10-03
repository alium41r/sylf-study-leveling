-- ============================================================================
-- Phase 5B: Focus Background Preference Source & Personal Backgrounds Selection
-- ============================================================================
-- 1. Adds focusBackgroundSource ('classic' | 'official' | 'custom') and
--    selectedCustomBackgroundId to User.
-- 2. Dynamically backfills existing users: non-null official selections become 'official',
--    null selections become 'classic'.
-- 3. Adds foreign key from User.selectedCustomBackgroundId to UserFocusBackground(id)
--    with ON DELETE SET NULL.
-- 4. Adds database CHECK constraints for valid source and mutual exclusivity.
-- 5. Installs atomic BEFORE DELETE triggers on FocusBackground and UserFocusBackground
--    to reset user preferences to Classic ('classic', null, null) and increment
--    focusBackgroundPreferenceVersion when a selected background is deleted.
-- ============================================================================

-- ── 1. Add Columns ────────────────────────────────────────────────────────────
ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "focusBackgroundSource" TEXT;
ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "selectedCustomBackgroundId" INTEGER;

-- ── 2. Data-Independent Backfill ─────────────────────────────────────────────
UPDATE public."User"
SET "focusBackgroundSource" = CASE
  WHEN "selectedFocusBackgroundId" IS NOT NULL THEN 'official'
  ELSE 'classic'
END
WHERE "focusBackgroundSource" IS NULL;

-- ── 3. Constraints & Defaults ────────────────────────────────────────────────
ALTER TABLE public."User" ALTER COLUMN "focusBackgroundSource" SET DEFAULT 'classic';
ALTER TABLE public."User" ALTER COLUMN "focusBackgroundSource" SET NOT NULL;

-- ── 4. Foreign Key for Custom Background Selection ───────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'User_selectedCustomBackgroundId_fkey'
  ) THEN
    ALTER TABLE public."User"
      ADD CONSTRAINT "User_selectedCustomBackgroundId_fkey"
      FOREIGN KEY ("selectedCustomBackgroundId")
      REFERENCES public."UserFocusBackground"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

-- ── 5. Indexes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "User_selectedCustomBackgroundId_idx" ON public."User"("selectedCustomBackgroundId");
CREATE INDEX IF NOT EXISTS "User_focusBackgroundSource_idx" ON public."User"("focusBackgroundSource");

-- ── 6. Check Constraints ─────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'User_focusBackgroundSource_check'
  ) THEN
    ALTER TABLE public."User"
      ADD CONSTRAINT "User_focusBackgroundSource_check"
      CHECK ("focusBackgroundSource" IN ('classic', 'official', 'custom'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'User_focusBackground_mutual_exclusivity_check'
  ) THEN
    ALTER TABLE public."User"
      ADD CONSTRAINT "User_focusBackground_mutual_exclusivity_check"
      CHECK (
        ("focusBackgroundSource" = 'classic' AND "selectedFocusBackgroundId" IS NULL AND "selectedCustomBackgroundId" IS NULL) OR
        ("focusBackgroundSource" = 'official' AND "selectedFocusBackgroundId" IS NOT NULL AND "selectedCustomBackgroundId" IS NULL) OR
        ("focusBackgroundSource" = 'custom' AND "selectedCustomBackgroundId" IS NOT NULL AND "selectedFocusBackgroundId" IS NULL)
      );
  END IF;
END $$;

-- ── 7. Self-Healing Deletion Triggers ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_focus_background_deletion()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'FocusBackground' THEN
    UPDATE public."User"
    SET "focusBackgroundSource" = 'classic',
        "selectedFocusBackgroundId" = NULL,
        "selectedCustomBackgroundId" = NULL,
        "focusBackgroundPreferenceVersion" = "focusBackgroundPreferenceVersion" + 1
    WHERE "selectedFocusBackgroundId" = OLD.id;
  ELSIF TG_TABLE_NAME = 'UserFocusBackground' THEN
    UPDATE public."User"
    SET "focusBackgroundSource" = 'classic',
        "selectedFocusBackgroundId" = NULL,
        "selectedCustomBackgroundId" = NULL,
        "focusBackgroundPreferenceVersion" = "focusBackgroundPreferenceVersion" + 1
    WHERE "selectedCustomBackgroundId" = OLD.id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_official_background_delete ON public."FocusBackground";
CREATE TRIGGER trg_official_background_delete
  BEFORE DELETE ON public."FocusBackground"
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_focus_background_deletion();

DROP TRIGGER IF EXISTS trg_custom_background_delete ON public."UserFocusBackground";
CREATE TRIGGER trg_custom_background_delete
  BEFORE DELETE ON public."UserFocusBackground"
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_focus_background_deletion();
