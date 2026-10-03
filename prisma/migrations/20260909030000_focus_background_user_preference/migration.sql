-- ============================================================================
-- Focus Background: Server-Side User Preference Persistence (Phase 4)
-- ============================================================================
-- 1. Adds selectedFocusBackgroundId and focusBackgroundPreferenceVersion to User
-- 2. Configures foreign key to FocusBackground with ON DELETE SET NULL
-- 3. Creates index on User(selectedFocusBackgroundId)
-- ============================================================================

-- 1. AlterTable User: add preference fields
ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "selectedFocusBackgroundId" INTEGER;
ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "focusBackgroundPreferenceVersion" INTEGER NOT NULL DEFAULT 0;

-- 2. AddForeignKey with ON DELETE SET NULL
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'User_selectedFocusBackgroundId_fkey'
  ) THEN
    ALTER TABLE public."User"
      ADD CONSTRAINT "User_selectedFocusBackgroundId_fkey"
      FOREIGN KEY ("selectedFocusBackgroundId")
      REFERENCES public."FocusBackground"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

-- 3. CreateIndex
CREATE INDEX IF NOT EXISTS "User_selectedFocusBackgroundId_idx" ON public."User"("selectedFocusBackgroundId");
