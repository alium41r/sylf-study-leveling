-- Private AI chat images use backend access and short-lived provider signatures.
-- Restrictive isolation protects this bucket even if another permissive Storage
-- policy permits broad client access. Other buckets retain their existing rules.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'storage' AND c.relname = 'objects' AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'Storage RLS must be enabled before provisioning private chat images';
    END IF;

    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('ai-chat-attachments', 'ai-chat-attachments', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
    ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'Restrictive isolation for AI chat attachments'
    ) THEN
      CREATE POLICY "Restrictive isolation for AI chat attachments"
      ON storage.objects AS RESTRICTIVE FOR ALL TO public, anon, authenticated
      USING (bucket_id <> 'ai-chat-attachments')
      WITH CHECK (bucket_id <> 'ai-chat-attachments');
    END IF;
  END IF;
END $$;
