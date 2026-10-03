-- AlterTable FocusBackground: Add timerPosition column with CHECK constraint
ALTER TABLE public."FocusBackground"
  ADD COLUMN IF NOT EXISTS "timerPosition" TEXT NOT NULL DEFAULT 'auto';

-- Add Check Constraint for validated values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FocusBackground_timerPosition_check'
  ) THEN
    ALTER TABLE public."FocusBackground"
      ADD CONSTRAINT "FocusBackground_timerPosition_check"
      CHECK ("timerPosition" IN ('auto', 'left', 'right', 'center'));
  END IF;
END $$;
