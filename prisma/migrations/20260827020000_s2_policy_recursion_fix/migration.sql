-- ============================================================================
-- S2c (20260827020000) — break policy recursion on ConversationParticipant
-- ----------------------------------------------------------------------------
-- convo_participant_select_policy previously contained a self-referencing
-- subquery over ConversationParticipant itself ("conversationId IN (SELECT
-- cp.conversationId FROM ConversationParticipant cp ...)"). Postgres rejects
-- that with 42P17 "infinite recursion detected in policy" the moment the
-- policy is actually evaluated (e.g. by any future grant, or by the
-- participant-EXISTS policies on Conversation/Message).
--
-- Fix: make the SELECT policy self-only. Membership checks elsewhere
-- (convo_select_policy, conversation_update/delete, message_select_policy)
-- all filter ConversationParticipant by cp."userId" = <caller>, which
-- satisfies this self-only policy, so those EXISTS subqueries now terminate
-- and remain correct. The app itself reads participant lists via Prisma as
-- postgres (RLS bypass) and is unaffected.
-- ============================================================================

DROP POLICY IF EXISTS "convo_participant_select_policy" ON "ConversationParticipant";
CREATE POLICY "convo_participant_select_policy" ON "ConversationParticipant"
  FOR SELECT TO public
  USING ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0));
