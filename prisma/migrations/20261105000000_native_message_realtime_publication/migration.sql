-- Native Realtime for messages (Expansion Part 3 slice C; owner approved for local development).
--
-- The Message table joins the supabase_realtime publication so a client holding a minted token (GET /api/realtime/token) hears that a conversation
-- changed. No row-level security changes: Message already has RLS enabled with `message_select_policy`, which lets a subscriber see only rows of
-- conversations they take part in, judged from the token's `sub`. Native uses an event only as a signal to re-read through REST, which applies the
-- server's own block and membership checks, so an event never carries trusted content.
--
-- The publication exists on Supabase. A plain PostgreSQL database (a disposable test database) may not have one, and then there is nothing to add to.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public."Message";
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;
