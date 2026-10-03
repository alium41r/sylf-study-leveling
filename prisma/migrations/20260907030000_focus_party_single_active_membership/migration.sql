-- ============================================================================
-- Focus Party: Single Active Party Invariant & Concurrency Hardening
-- ============================================================================
-- Product UX Invariant:
--   A user may belong to at most ONE FocusParty where disbandedAt IS NULL.
--   A user may have unlimited historical memberships in disbanded parties.
--
-- Concurrency Strategy:
--   Row lock on public."User"(id = p_user_id) FOR UPDATE is acquired first in
--   all party membership mutations (create_focus_party, join_focus_party,
--   leave_focus_party, remove_focus_party_member, and the BEFORE INSERT trigger).
--   This strictly serializes concurrent join/create attempts for the same user,
--   preventing race conditions from creating duplicate active memberships.
-- ============================================================================

-- 1. Invariant Trigger: check_user_single_active_party
CREATE OR REPLACE FUNCTION public.check_user_single_active_party()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_party_disbanded_at TIMESTAMP;
BEGIN
  -- Check if the target party is already disbanded (allow historical/archival inserts)
  SELECT "disbandedAt" INTO v_party_disbanded_at
  FROM public."FocusParty"
  WHERE id = NEW."partyId";

  IF v_party_disbanded_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Row lock on User to prevent race conditions during concurrent inserts
  PERFORM 1 FROM public."User" WHERE id = NEW."userId" FOR UPDATE;

  -- Enforce that the user is not an active member of any other party
  IF EXISTS (
    SELECT 1
    FROM public."FocusPartyMember" fpm
    JOIN public."FocusParty" fp ON fp.id = fpm."partyId"
    WHERE fpm."userId" = NEW."userId"
      AND fp."disbandedAt" IS NULL
      AND fpm."partyId" <> NEW."partyId"
  ) THEN
    RAISE EXCEPTION 'User already belongs to an active Focus Party' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_user_single_active_party ON public."FocusPartyMember";
CREATE TRIGGER trg_check_user_single_active_party
BEFORE INSERT ON public."FocusPartyMember"
FOR EACH ROW
EXECUTE FUNCTION public.check_user_single_active_party();

-- 2. Hardened RPC: create_focus_party (User row lock & active party check)
CREATE OR REPLACE FUNCTION public.create_focus_party(
  p_user_id INT,
  p_name TEXT DEFAULT 'Focus Party'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_party_id INT;
  v_clean_name TEXT;
BEGIN
  -- S2 identity guard
  IF NULLIF(current_setting('request.jwt.claims', true), '') IS NOT NULL OR NULLIF(current_setting('request.jwt.claim.sub', true), '') IS NOT NULL THEN
    IF COALESCE((auth.jwt() ->> 'sub'), NULLIF(current_setting('request.jwt.claim.sub', true), ''), '') <> p_user_id::text THEN
      RAISE EXCEPTION 'S2 identity guard: caller identity does not match p_user_id' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Row lock on user to serialize concurrent party creations / joins
  PERFORM 1 FROM public."User" WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User does not exist' USING ERRCODE = '23503';
  END IF;

  -- Enforce single active party invariant
  IF EXISTS (
    SELECT 1
    FROM public."FocusPartyMember" fpm
    JOIN public."FocusParty" fp ON fp.id = fpm."partyId"
    WHERE fpm."userId" = p_user_id
      AND fp."disbandedAt" IS NULL
  ) THEN
    RAISE EXCEPTION 'User already belongs to an active Focus Party' USING ERRCODE = 'check_violation';
  END IF;

  v_clean_name := SUBSTRING(COALESCE(NULLIF(TRIM(p_name), ''), 'Focus Party') FROM 1 FOR 50);

  INSERT INTO public."FocusParty" ("name", "leaderId", "createdAt", "updatedAt")
  VALUES (v_clean_name, p_user_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  RETURNING id INTO v_party_id;

  INSERT INTO public."FocusPartyMember" ("partyId", "userId", "joinedAt")
  VALUES (v_party_id, p_user_id, CURRENT_TIMESTAMP);

  RETURN jsonb_build_object(
    'success', true,
    'partyId', v_party_id,
    'name', v_clean_name,
    'leaderId', p_user_id
  );
END;
$$;

-- 3. Hardened RPC: join_focus_party (User row lock & active party check)
CREATE OR REPLACE FUNCTION public.join_focus_party(
  p_party_id INT,
  p_user_id INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_party RECORD;
  v_already BOOLEAN;
  v_has_invite BOOLEAN;
BEGIN
  -- S2 identity guard
  IF NULLIF(current_setting('request.jwt.claims', true), '') IS NOT NULL OR NULLIF(current_setting('request.jwt.claim.sub', true), '') IS NOT NULL THEN
    IF COALESCE((auth.jwt() ->> 'sub'), NULLIF(current_setting('request.jwt.claim.sub', true), ''), '') <> p_user_id::text THEN
      RAISE EXCEPTION 'S2 identity guard: caller identity does not match p_user_id' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Row lock on user to serialize concurrent join/create requests
  PERFORM 1 FROM public."User" WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User % not found', p_user_id USING ERRCODE = '23503';
  END IF;

  -- Row lock on party
  SELECT * INTO v_party FROM public."FocusParty" WHERE id = p_party_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FocusParty % not found', p_party_id USING ERRCODE = '23503';
  END IF;

  IF v_party."disbandedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'FocusParty % is disbanded', p_party_id USING ERRCODE = 'check_violation';
  END IF;

  -- If user is already a member of this party, return idempotent success
  SELECT EXISTS (
    SELECT 1 FROM public."FocusPartyMember"
    WHERE "partyId" = p_party_id AND "userId" = p_user_id
  ) INTO v_already;

  IF v_already THEN
    RETURN jsonb_build_object('success', true, 'partyId', p_party_id, 'alreadyMember', true);
  END IF;

  -- Enforce single active party invariant: user cannot be in another active party
  IF EXISTS (
    SELECT 1
    FROM public."FocusPartyMember" fpm
    JOIN public."FocusParty" fp ON fp.id = fpm."partyId"
    WHERE fpm."userId" = p_user_id
      AND fp."disbandedAt" IS NULL
      AND fpm."partyId" <> p_party_id
  ) THEN
    RAISE EXCEPTION 'User already belongs to an active Focus Party' USING ERRCODE = 'check_violation';
  END IF;

  -- Verify user has an active PENDING invitation or is the party leader/creator
  SELECT EXISTS (
    SELECT 1 FROM public."SessionInvite"
    WHERE "partyId" = p_party_id AND "receiverId" = p_user_id AND "status" = 'PENDING'
  ) INTO v_has_invite;

  IF NOT v_has_invite AND v_party."leaderId" <> p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: user has no pending invitation to party %', p_party_id USING ERRCODE = '42501';
  END IF;

  -- Insert member (will also trigger capacity and single active checks)
  INSERT INTO public."FocusPartyMember" ("partyId", "userId", "joinedAt")
  VALUES (p_party_id, p_user_id, CURRENT_TIMESTAMP);

  -- Mark any pending invite as ACCEPTED
  UPDATE public."SessionInvite"
  SET "status" = 'ACCEPTED'
  WHERE "partyId" = p_party_id AND "receiverId" = p_user_id AND "status" = 'PENDING';

  RETURN jsonb_build_object(
    'success', true,
    'partyId', p_party_id,
    'userId', p_user_id
  );
END;
$$;

-- 4. Hardened RPC: leave_focus_party (User row lock)
CREATE OR REPLACE FUNCTION public.leave_focus_party(
  p_party_id INT,
  p_user_id INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_party RECORD;
  v_active_session_id INT;
  v_remaining_members INT;
  v_new_leader_id INT := NULL;
BEGIN
  -- S2 identity guard
  IF NULLIF(current_setting('request.jwt.claims', true), '') IS NOT NULL OR NULLIF(current_setting('request.jwt.claim.sub', true), '') IS NOT NULL THEN
    IF COALESCE((auth.jwt() ->> 'sub'), NULLIF(current_setting('request.jwt.claim.sub', true), ''), '') <> p_user_id::text THEN
      RAISE EXCEPTION 'S2 identity guard: caller identity does not match p_user_id' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Row lock on user to serialize concurrent actions
  PERFORM 1 FROM public."User" WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User % not found', p_user_id USING ERRCODE = '23503';
  END IF;

  SELECT * INTO v_party FROM public."FocusParty" WHERE id = p_party_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FocusParty % not found', p_party_id USING ERRCODE = '23503';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public."FocusPartyMember"
    WHERE "partyId" = p_party_id AND "userId" = p_user_id
  ) THEN
    RAISE EXCEPTION 'User % is not a member of party %', p_user_id, p_party_id USING ERRCODE = 'check_violation';
  END IF;

  -- If user is in an active session, cleanly leave the session first
  SELECT fs.id INTO v_active_session_id
  FROM public."FocusSession" fs
  JOIN public."FocusSessionMember" fsm ON fsm."sessionId" = fs.id
  WHERE fs."partyId" = p_party_id AND fs."endedAt" IS NULL AND fsm."userId" = p_user_id AND fsm."timerState" <> 'LEFT';

  IF v_active_session_id IS NOT NULL THEN
    PERFORM public.leave_focus_session(v_active_session_id, p_user_id);
  END IF;

  DELETE FROM public."FocusPartyMember"
  WHERE "partyId" = p_party_id AND "userId" = p_user_id;

  SELECT count(*) INTO v_remaining_members
  FROM public."FocusPartyMember"
  WHERE "partyId" = p_party_id;

  IF v_remaining_members = 0 THEN
    -- Mark disbanded instead of deleting so historical sessions remain intact
    UPDATE public."FocusParty"
    SET "disbandedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
    WHERE id = p_party_id;

    RETURN jsonb_build_object('success', true, 'partyDisbanded', true, 'remainingMembers', 0);
  END IF;

  -- If the leader left, transfer leadership to the longest-tenured member (oldest joinedAt)
  IF v_party."leaderId" = p_user_id THEN
    SELECT "userId" INTO v_new_leader_id
    FROM public."FocusPartyMember"
    WHERE "partyId" = p_party_id
    ORDER BY "joinedAt" ASC, id ASC
    LIMIT 1;

    UPDATE public."FocusParty"
    SET "leaderId" = v_new_leader_id, "updatedAt" = CURRENT_TIMESTAMP
    WHERE id = p_party_id;
  ELSE
    v_new_leader_id := v_party."leaderId";
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'partyDisbanded', false,
    'remainingMembers', v_remaining_members,
    'leaderId', v_new_leader_id,
    'transferred', (v_party."leaderId" = p_user_id)
  );
END;
$$;

-- 5. Hardened RPC: remove_focus_party_member (User row lock on target)
CREATE OR REPLACE FUNCTION public.remove_focus_party_member(
  p_party_id INT,
  p_leader_id INT,
  p_target_user_id INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_party RECORD;
  v_active_session_id INT;
BEGIN
  -- S2 identity guard: caller must be leader
  IF NULLIF(current_setting('request.jwt.claims', true), '') IS NOT NULL OR NULLIF(current_setting('request.jwt.claim.sub', true), '') IS NOT NULL THEN
    IF COALESCE((auth.jwt() ->> 'sub'), NULLIF(current_setting('request.jwt.claim.sub', true), ''), '') <> p_leader_id::text THEN
      RAISE EXCEPTION 'S2 identity guard: caller identity does not match p_leader_id' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Row lock on target user
  PERFORM 1 FROM public."User" WHERE id = p_target_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User % not found', p_target_user_id USING ERRCODE = '23503';
  END IF;

  SELECT * INTO v_party FROM public."FocusParty" WHERE id = p_party_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FocusParty % not found', p_party_id USING ERRCODE = '23503';
  END IF;

  IF v_party."leaderId" <> p_leader_id THEN
    RAISE EXCEPTION 'Only the party leader can remove members' USING ERRCODE = '42501';
  END IF;

  IF p_leader_id = p_target_user_id THEN
    RAISE EXCEPTION 'Leader cannot remove self. Use leave_focus_party instead' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public."FocusPartyMember"
    WHERE "partyId" = p_party_id AND "userId" = p_target_user_id
  ) THEN
    RAISE EXCEPTION 'User % is not a member of party %', p_target_user_id, p_party_id USING ERRCODE = 'check_violation';
  END IF;

  -- Cleanly leave session if target user is in one
  SELECT fs.id INTO v_active_session_id
  FROM public."FocusSession" fs
  JOIN public."FocusSessionMember" fsm ON fsm."sessionId" = fs.id
  WHERE fs."partyId" = p_party_id AND fs."endedAt" IS NULL AND fsm."userId" = p_target_user_id AND fsm."timerState" <> 'LEFT';

  IF v_active_session_id IS NOT NULL THEN
    PERFORM public.leave_focus_session(v_active_session_id, p_target_user_id);
  END IF;

  DELETE FROM public."FocusPartyMember"
  WHERE "partyId" = p_party_id AND "userId" = p_target_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'partyId', p_party_id,
    'removedUserId', p_target_user_id
  );
END;
$$;
