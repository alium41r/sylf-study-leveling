-- ============================================================================
-- Phase 5A: Custom User Focus Backgrounds
-- ============================================================================
-- 1. Provisions private Storage bucket 'focus-backgrounds-user'
-- 2. Creates UserFocusBackground table with foreign key to User (ON DELETE CASCADE)
-- 3. Adds database CHECK constraints for coordinates, timerPosition, and dimensions
-- 4. Configures Row-Level Security (RLS) & PostgREST privilege hardening
-- ============================================================================

-- ── 1. Storage Bucket Provisioning (Private, 10MB limit, strict MIME) ─────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'focus-backgrounds-user',
      'focus-backgrounds-user',
      false, -- Strictly PRIVATE
      10485760, -- 10MB
      ARRAY['image/jpeg', 'image/png', 'image/webp']
    )
    ON CONFLICT (id) DO UPDATE SET
      public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
  END IF;
END $$;

-- ── 2. Create Table UserFocusBackground ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public."UserFocusBackground" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "aspectRatio" DOUBLE PRECISION NOT NULL,
    "focalX" DOUBLE PRECISION DEFAULT 0.5,
    "focalY" DOUBLE PRECISION DEFAULT 0.5,
    "timerPosition" TEXT DEFAULT 'auto',
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserFocusBackground_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "UserFocusBackground_focalX_check" CHECK ("focalX" >= 0.0 AND "focalX" <= 1.0),
    CONSTRAINT "UserFocusBackground_focalY_check" CHECK ("focalY" >= 0.0 AND "focalY" <= 1.0),
    CONSTRAINT "UserFocusBackground_timerPosition_check" CHECK ("timerPosition" IN ('auto', 'left', 'right', 'center')),
    CONSTRAINT "UserFocusBackground_dimensions_check" CHECK ("width" > 0 AND "height" > 0),
    CONSTRAINT "UserFocusBackground_fileSize_check" CHECK ("fileSize" IS NULL OR "fileSize" > 0)
);

-- ── 3. Add Foreign Key with ON DELETE CASCADE ────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'UserFocusBackground_userId_fkey'
  ) THEN
    ALTER TABLE public."UserFocusBackground"
      ADD CONSTRAINT "UserFocusBackground_userId_fkey"
      FOREIGN KEY ("userId")
      REFERENCES public."User"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

-- ── 4. Indexes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "UserFocusBackground_userId_idx" ON public."UserFocusBackground"("userId");
CREATE INDEX IF NOT EXISTS "UserFocusBackground_userId_createdAt_idx" ON public."UserFocusBackground"("userId", "createdAt");

-- ── 5. Row-Level Security (RLS) & PostgREST Grants Hardening ──────────────────
ALTER TABLE public."UserFocusBackground" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."UserFocusBackground" FROM public;
REVOKE ALL ON TABLE public."UserFocusBackground" FROM anon, authenticated;

-- Direct mutations (INSERT, UPDATE, DELETE, TRUNCATE) remain completely revoked from external roles.
-- External writes must go exclusively through authenticated Next.js route handlers using Prisma.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public."UserFocusBackground" FROM anon, authenticated;

-- Grant SELECT to authenticated strictly locked to owned rows via RLS
GRANT SELECT ON TABLE public."UserFocusBackground" TO authenticated;
GRANT ALL ON TABLE public."UserFocusBackground" TO service_role;

DROP POLICY IF EXISTS "user_focus_background_select_own" ON public."UserFocusBackground";
CREATE POLICY "user_focus_background_select_own"
  ON public."UserFocusBackground"
  FOR SELECT
  TO authenticated
  USING ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0));
