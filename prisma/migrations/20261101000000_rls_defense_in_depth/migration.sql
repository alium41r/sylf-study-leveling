-- ============================================================================
-- Phase 11: finish what S2 started. Additive and idempotent; no data changes.
-- ----------------------------------------------------------------------------
-- 1. S2 wrote owner policies for the private tables and revoked anon and
--    authenticated from them, but the history enables RLS on only some. On the
--    rest the policies do nothing, and the revoke is the only barrier: one stray
--    GRANT would expose the table. Hosted RLS state was not inspected, and
--    enabling RLS where it is already on changes nothing.
-- 2. The 20261014 revoke loop named a function that no longer exists
--    (kick_focus_member) and so missed remove_focus_party_member.
-- 3. S2 removed default EXECUTE from PUBLIC. Supabase also grants it to anon and
--    authenticated by default, so functions made since then inherited it.
--
-- The application connects as the owner, which bypasses RLS, so nothing here
-- changes the Prisma path. Realtime reads only the four FocusParty tables and
-- SessionInvite, which already have RLS.
--
-- Rollback: ALTER TABLE ... DISABLE ROW LEVEL SECURITY for the tables below, and
-- GRANT EXECUTE back. Nothing is dropped, so there is no data to restore.
-- ============================================================================

ALTER TABLE public."AcousticTrack" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AiInsight" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AiMemory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AuthSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."BlockedUser" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ChatSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ConnectedAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Conversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ConversationParticipant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."DailyBriefingLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."FriendRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Friendship" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Goal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."HpLedger" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."InventoryItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Quest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."StatInvestLedger" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."StudySession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Subject" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SubjectNode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SylphLedger" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SystemMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."UserAchievement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."UserCosmetic" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."UserPrivacy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."VerificationToken" ENABLE ROW LEVEL SECURITY;

-- Application-only RPC. Its in-function guard stays as the second layer.
REVOKE ALL ON FUNCTION public.remove_focus_party_member(INT, INT, INT) FROM PUBLIC, anon, authenticated, service_role;

-- Trigger functions run with the table's privileges and are never called directly.
DO $$ DECLARE fn regprocedure;
BEGIN
  FOR fn IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prorettype = 'trigger'::regtype
  LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn); END LOOP;
END $$;

-- RLS helpers stay callable by authenticated, because policies on the Realtime tables call them. Anonymous callers have no use for them.
REVOKE ALL ON FUNCTION public.is_focus_party_member(INT, INT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_focus_session_participant(INT, INT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_pending_party_invite(INT, INT) FROM PUBLIC, anon;

-- Future functions start closed for these roles, not only for PUBLIC.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
