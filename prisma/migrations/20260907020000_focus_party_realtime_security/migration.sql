-- ============================================================================
-- Migration: Focus Party Realtime Security & RLS Hardening
-- ============================================================================
-- 1. Create STABLE SECURITY DEFINER function `has_pending_party_invite`
--    to prevent permission denial when authenticated users / Supabase Realtime
--    evaluate FocusParty RLS policies.
-- 2. Update `focus_party_select_policy` to use `has_pending_party_invite`.
-- 3. Enable RLS on `SessionInvite` and grant SELECT to `authenticated` for
--    sender or receiver only.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.has_pending_party_invite(p_party_id INT, p_user_id INT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."SessionInvite" si
    WHERE si."partyId" = p_party_id
      AND si."receiverId" = p_user_id
      AND si.status = 'PENDING'
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_pending_party_invite(INT, INT) TO authenticated;

-- Update FocusParty select policy to use SECURITY DEFINER helper
DROP POLICY IF EXISTS "focus_party_select_policy" ON public."FocusParty";
CREATE POLICY "focus_party_select_policy" ON public."FocusParty"
  FOR SELECT TO public
  USING (
    public.is_focus_party_member(id, COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0)::int)
    OR public.has_pending_party_invite(id, COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0)::int)
  );

-- Enable RLS and grant scoped SELECT on SessionInvite for authenticated role
GRANT SELECT ON public."SessionInvite" TO authenticated;
ALTER TABLE public."SessionInvite" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "session_invite_select" ON public."SessionInvite";
CREATE POLICY "session_invite_select" ON public."SessionInvite"
  FOR SELECT TO authenticated
  USING (
    "senderId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0)::int
    OR "receiverId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0)::int
  );
