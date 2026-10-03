-- ============================================================================
-- Storage RLS Hardening: Restrictive Isolation for User Focus Backgrounds
-- ============================================================================
-- In PostgreSQL Row-Level Security, RESTRICTIVE policies are AND-combined with
-- all permissive policies. This mathematically guarantees that non-service roles
-- (public, anon, authenticated) can NEVER select, insert, update, or delete
-- objects in 'focus-backgrounds-user', regardless of any present or future
-- permissive policies on storage.objects.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage'
        AND tablename = 'objects'
        AND policyname = 'Restrictive Isolation for focus-backgrounds-user'
    ) THEN
      CREATE POLICY "Restrictive Isolation for focus-backgrounds-user"
      ON storage.objects AS RESTRICTIVE
      FOR ALL
      TO public, anon, authenticated
      USING (bucket_id <> 'focus-backgrounds-user')
      WITH CHECK (bucket_id <> 'focus-backgrounds-user');
    END IF;
  END IF;
END $$;
