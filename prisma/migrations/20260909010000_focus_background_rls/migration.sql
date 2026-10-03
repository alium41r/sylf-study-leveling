-- ============================================================================
-- Focus Background Catalog: Row-Level Security & Grants Hardening
-- ============================================================================
-- Secures FocusBackgroundCategory and FocusBackground:
--   1. Enables Row-Level Security (RLS) on both tables
--   2. Explicitly grants SELECT to anon and authenticated roles
--   3. Explicitly revokes INSERT, UPDATE, DELETE, TRUNCATE from anon and authenticated
--   4. Configures SELECT policies restricted strictly to active catalog entries
--   5. Disallows all client-side mutations (writes reserved for service_role / Prisma)
-- ============================================================================

-- 1. Enable Row-Level Security
ALTER TABLE public."FocusBackgroundCategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."FocusBackground" ENABLE ROW LEVEL SECURITY;

-- 2. Restrict PostgREST table-level privileges (defense-in-depth)
REVOKE ALL ON TABLE public."FocusBackgroundCategory" FROM public;
REVOKE ALL ON TABLE public."FocusBackground" FROM public;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public."FocusBackgroundCategory" FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public."FocusBackground" FROM anon, authenticated;

GRANT SELECT ON TABLE public."FocusBackgroundCategory" TO anon, authenticated;
GRANT SELECT ON TABLE public."FocusBackground" TO anon, authenticated;

-- Service role retains full management access
GRANT ALL ON TABLE public."FocusBackgroundCategory" TO service_role;
GRANT ALL ON TABLE public."FocusBackground" TO service_role;

-- 3. RLS Policies: Public & Authenticated Read Access for Active Records Only
DROP POLICY IF EXISTS "Public Read Active Categories" ON public."FocusBackgroundCategory";
CREATE POLICY "Public Read Active Categories"
  ON public."FocusBackgroundCategory"
  FOR SELECT
  TO anon, authenticated
  USING ("isActive" = true);

DROP POLICY IF EXISTS "Public Read Active Backgrounds" ON public."FocusBackground";
CREATE POLICY "Public Read Active Backgrounds"
  ON public."FocusBackground"
  FOR SELECT
  TO anon, authenticated
  USING (
    "isActive" = true
    AND EXISTS (
      SELECT 1 FROM public."FocusBackgroundCategory" c
      WHERE c.id = "FocusBackground"."categoryId"
        AND c."isActive" = true
    )
  );
