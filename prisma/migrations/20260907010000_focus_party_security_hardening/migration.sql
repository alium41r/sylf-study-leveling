-- ============================================================================
-- Focus Party: Security Hardening & Data Integrity Remediation
-- ============================================================================
-- Security Hardening:
--   1. Revoke direct INSERT, UPDATE, DELETE from authenticated and anon on all
--      four Focus Party tables to prevent client-side field tampering (e.g.
--      accumulatedSeconds = 999999 or unauthorized membership injection).
--      Keep SELECT grant with RLS for read queries and Realtime.
--   2. Drop permissive write policies (defense-in-depth).
--   3. Enforce invitation authorization in join_focus_party: an uninvited user
--      cannot join another user's party without an active PENDING SessionInvite.
--   4. Add disbandedAt to FocusParty so that when all members leave, the party
--      is marked disbanded rather than hard-deleted, preserving historical
--      FocusSession and FocusSessionMember records permanently.
--   5. Strict Finite State Automaton (DFA) transitions on timers:
--      - start_focus_timer: NOT_STARTED -> FOCUSING (rejects if PAUSED or LEFT)
--      - pause_focus_timer: FOCUSING -> PAUSED (rejects if NOT_STARTED or LEFT)
--      - resume_focus_timer: PAUSED -> FOCUSING (rejects if NOT_STARTED or LEFT)
--      - leave_focus_session: ANY active -> LEFT (idempotent if already LEFT)
--   6. Upper-bound clamp on single focus intervals (LEAST(43200, ...)) to
--      prevent massive timestamp inflation if a browser disconnects for days.
--   7. Name length clamp (50 chars) on create_focus_party.
--   8. Add delete protection trigger on ended session members to prevent
--      historical audit log deletion.
--   9. Explicit search_path = public on all triggers and functions.
-- ============================================================================

-- 1. Schema alteration: Add disbandedAt to FocusParty
ALTER TABLE public."FocusParty" ADD COLUMN IF NOT EXISTS "disbandedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "FocusParty_disbandedAt_idx" ON public."FocusParty" ("disbandedAt");

-- 2. Revoke direct write grants from external roles
REVOKE INSERT, UPDATE, DELETE ON public."FocusParty" FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public."FocusPartyMember" FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public."FocusSession" FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public."FocusSessionMember" FROM authenticated, anon;

-- Ensure SELECT is granted to authenticated for RLS / Realtime
GRANT SELECT ON public."FocusParty" TO authenticated;
GRANT SELECT ON public."FocusPartyMember" TO authenticated;
GRANT SELECT ON public."FocusSession" TO authenticated;
GRANT SELECT ON public."FocusSessionMember" TO authenticated;

-- 3. Drop legacy write policies (defense-in-depth)
DROP POLICY IF EXISTS "focus_party_insert_policy" ON public."FocusParty";
DROP POLICY IF EXISTS "focus_party_update_leader" ON public."FocusParty";
DROP POLICY IF EXISTS "focus_party_delete_leader" ON public."FocusParty";
DROP POLICY IF EXISTS "focus_party_member_insert" ON public."FocusPartyMember";
DROP POLICY IF EXISTS "focus_party_member_delete" ON public."FocusPartyMember";
DROP POLICY IF EXISTS "focus_session_insert" ON public."FocusSession";
DROP POLICY IF EXISTS "focus_session_update" ON public."FocusSession";
DROP POLICY IF EXISTS "focus_session_member_insert" ON public."FocusSessionMember";
DROP POLICY IF EXISTS "focus_session_member_update" ON public."FocusSessionMember";
DROP POLICY IF EXISTS "focus_session_member_delete" ON public."FocusSessionMember";

-- 4. Hardened Trigger Functions (Explicit search_path = public)
CREATE OR REPLACE FUNCTION public.check_focus_party_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  PERFORM 1 FROM public."FocusParty" WHERE id = NEW."partyId" FOR UPDATE;

  SELECT count(*) INTO v_count
  FROM public."FocusPartyMember"
  WHERE "partyId" = NEW."partyId";

  IF v_count >= 4 THEN
    RAISE EXCEPTION 'Party is full (maximum 4 members)' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_focus_session_member_party()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_party_id INT;
  v_ended_at TIMESTAMP;
BEGIN
  SELECT "partyId", "endedAt" INTO v_party_id, v_ended_at
  FROM public."FocusSession"
  WHERE id = NEW."sessionId";

  IF v_party_id IS NULL THEN
    RAISE EXCEPTION 'FocusSession not found' USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot join or modify an ended focus session' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public."FocusPartyMember"
    WHERE "partyId" = v_party_id AND "userId" = NEW."userId"
  ) THEN
    RAISE EXCEPTION 'User must be a member of the party to join its focus session' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_focus_session_ended_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_ended_at TIMESTAMP;
BEGIN
  SELECT "endedAt" INTO v_ended_at
  FROM public."FocusSession"
  WHERE id = NEW."sessionId";

  IF v_ended_at IS NOT NULL AND OLD."timerState" = NEW."timerState" AND OLD."accumulatedSeconds" = NEW."accumulatedSeconds" THEN
    RETURN NEW;
  ELSIF v_ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot modify timer state for an ended focus session' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- Invariant: Prevent deleting participant records from ended sessions
CREATE OR REPLACE FUNCTION public.check_focus_session_member_delete_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_ended_at TIMESTAMP;
BEGIN
  SELECT "endedAt" INTO v_ended_at
  FROM public."FocusSession"
  WHERE id = OLD."sessionId";

  IF v_ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot delete participant records from an ended focus session' USING ERRCODE = 'check_violation';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_focus_session_member_delete_guard ON public."FocusSessionMember";
CREATE TRIGGER trg_check_focus_session_member_delete_guard
BEFORE DELETE ON public."FocusSessionMember"
FOR EACH ROW
EXECUTE FUNCTION public.check_focus_session_member_delete_guard();

-- 5. Hardened RPC 1: create_focus_party (sanitized name clamp)
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

  IF NOT EXISTS (SELECT 1 FROM public."User" WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User does not exist' USING ERRCODE = '23503';
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

-- 6. Hardened RPC 2: join_focus_party (enforces invite authorization)
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

  SELECT * INTO v_party FROM public."FocusParty" WHERE id = p_party_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FocusParty % not found', p_party_id USING ERRCODE = '23503';
  END IF;

  IF v_party."disbandedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'FocusParty % is disbanded', p_party_id USING ERRCODE = 'check_violation';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public."FocusPartyMember"
    WHERE "partyId" = p_party_id AND "userId" = p_user_id
  ) INTO v_already;

  IF v_already THEN
    RETURN jsonb_build_object('success', true, 'partyId', p_party_id, 'alreadyMember', true);
  END IF;

  -- Verify user has an active PENDING invitation or is the creator
  SELECT EXISTS (
    SELECT 1 FROM public."SessionInvite"
    WHERE "partyId" = p_party_id AND "receiverId" = p_user_id AND "status" = 'PENDING'
  ) INTO v_has_invite;

  IF NOT v_has_invite AND v_party."leaderId" <> p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: user has no pending invitation to party %', p_party_id USING ERRCODE = '42501';
  END IF;

  -- Insert will trigger trg_check_focus_party_capacity, ensuring max 4 invariant
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

-- 7. Hardened RPC 3: leave_focus_party (preserves party row with disbandedAt when empty)
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

-- 8. Hardened RPC 4: remove_focus_party_member
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
    RAISE EXCEPTION 'Target user % is not a member of party %', p_target_user_id, p_party_id USING ERRCODE = 'check_violation';
  END IF;

  -- Cleanly remove target from any active session
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
    'removedUserId', p_target_user_id,
    'partyId', p_party_id
  );
END;
$$;

-- 9. Hardened RPC 5: enter_focus_session (atomic create-or-join, checks disbandedAt)
CREATE OR REPLACE FUNCTION public.enter_focus_session(
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
  v_session_id INT;
  v_member RECORD;
BEGIN
  -- S2 identity guard
  IF NULLIF(current_setting('request.jwt.claims', true), '') IS NOT NULL OR NULLIF(current_setting('request.jwt.claim.sub', true), '') IS NOT NULL THEN
    IF COALESCE((auth.jwt() ->> 'sub'), NULLIF(current_setting('request.jwt.claim.sub', true), ''), '') <> p_user_id::text THEN
      RAISE EXCEPTION 'S2 identity guard: caller identity does not match p_user_id' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO v_party FROM public."FocusParty" WHERE id = p_party_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FocusParty % not found', p_party_id USING ERRCODE = '23503';
  END IF;

  IF v_party."disbandedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot enter session of a disbanded party' USING ERRCODE = 'check_violation';
  END IF;

  -- Verify user is an active party member
  IF NOT EXISTS (
    SELECT 1 FROM public."FocusPartyMember"
    WHERE "partyId" = p_party_id AND "userId" = p_user_id
  ) THEN
    RAISE EXCEPTION 'User % is not a member of party %', p_user_id, p_party_id USING ERRCODE = 'check_violation';
  END IF;

  -- Locate or create active FocusSession atomically
  SELECT id INTO v_session_id
  FROM public."FocusSession"
  WHERE "partyId" = p_party_id AND "endedAt" IS NULL
  FOR UPDATE;

  IF v_session_id IS NULL THEN
    -- Attempt insert guarded by partial unique index
    INSERT INTO public."FocusSession" ("partyId", "startedAt")
    VALUES (p_party_id, CURRENT_TIMESTAMP)
    ON CONFLICT ("partyId") WHERE "endedAt" IS NULL DO NOTHING
    RETURNING id INTO v_session_id;

    IF v_session_id IS NULL THEN
      -- Another transaction created it concurrently: fetch and lock it
      SELECT id INTO v_session_id
      FROM public."FocusSession"
      WHERE "partyId" = p_party_id AND "endedAt" IS NULL
      FOR UPDATE;
    END IF;
  END IF;

  -- Find or initialize user's FocusSessionMember participation
  SELECT * INTO v_member
  FROM public."FocusSessionMember"
  WHERE "sessionId" = v_session_id AND "userId" = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public."FocusSessionMember" (
      "sessionId", "userId", "timerState", "accumulatedSeconds", "currentStartedAt", "joinedAt", "lastHeartbeatAt"
    ) VALUES (
      v_session_id, p_user_id, 'NOT_STARTED', 0, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    RETURNING * INTO v_member;
  ELSE
    -- User previously left this active session: REJOIN
    -- Cumulative focus duration in accumulatedSeconds is strictly PRESERVED
    IF v_member."timerState" = 'LEFT' THEN
      UPDATE public."FocusSessionMember"
      SET "timerState" = CASE WHEN v_member."accumulatedSeconds" > 0 THEN 'PAUSED'::public."FocusTimerState" ELSE 'NOT_STARTED'::public."FocusTimerState" END,
          "currentStartedAt" = NULL,
          "leftAt" = NULL,
          "lastHeartbeatAt" = CURRENT_TIMESTAMP
      WHERE id = v_member.id
      RETURNING * INTO v_member;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'sessionId', v_session_id,
    'partyId', p_party_id,
    'userId', p_user_id,
    'timerState', v_member."timerState",
    'accumulatedSeconds', v_member."accumulatedSeconds",
    'currentStartedAt', v_member."currentStartedAt"
  );
END;
$$;

-- 10. Hardened RPC 6: start_focus_timer (validates state machine)
CREATE OR REPLACE FUNCTION public.start_focus_timer(
  p_session_id INT,
  p_user_id INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session RECORD;
  v_member RECORD;
BEGIN
  -- S2 identity guard
  IF NULLIF(current_setting('request.jwt.claims', true), '') IS NOT NULL OR NULLIF(current_setting('request.jwt.claim.sub', true), '') IS NOT NULL THEN
    IF COALESCE((auth.jwt() ->> 'sub'), NULLIF(current_setting('request.jwt.claim.sub', true), ''), '') <> p_user_id::text THEN
      RAISE EXCEPTION 'S2 identity guard: caller identity does not match p_user_id' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO v_session FROM public."FocusSession" WHERE id = p_session_id;
  IF NOT FOUND OR v_session."endedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'Focus session is not active' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_member
  FROM public."FocusSessionMember"
  WHERE "sessionId" = p_session_id AND "userId" = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User is not in this focus session' USING ERRCODE = 'check_violation';
  END IF;

  IF v_member."timerState" = 'LEFT' THEN
    RAISE EXCEPTION 'User has left the focus session. Re-enter focus room first' USING ERRCODE = 'check_violation';
  END IF;

  IF v_member."timerState" = 'PAUSED' THEN
    RAISE EXCEPTION 'Timer is currently paused. Use resume_focus_timer instead' USING ERRCODE = 'check_violation';
  END IF;

  IF v_member."timerState" = 'FOCUSING' THEN
    -- Idempotent
    RETURN jsonb_build_object(
      'success', true,
      'timerState', v_member."timerState",
      'accumulatedSeconds', v_member."accumulatedSeconds",
      'currentStartedAt', v_member."currentStartedAt"
    );
  END IF;

  UPDATE public."FocusSessionMember"
  SET "timerState" = 'FOCUSING',
      "currentStartedAt" = CURRENT_TIMESTAMP,
      "lastHeartbeatAt" = CURRENT_TIMESTAMP
  WHERE id = v_member.id
  RETURNING * INTO v_member;

  RETURN jsonb_build_object(
    'success', true,
    'sessionId', p_session_id,
    'userId', p_user_id,
    'timerState', v_member."timerState",
    'accumulatedSeconds', v_member."accumulatedSeconds",
    'currentStartedAt', v_member."currentStartedAt"
  );
END;
$$;

-- 11. Hardened RPC 7: pause_focus_timer (validates state machine & clamps interval)
CREATE OR REPLACE FUNCTION public.pause_focus_timer(
  p_session_id INT,
  p_user_id INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session RECORD;
  v_member RECORD;
  v_elapsed INT := 0;
BEGIN
  -- S2 identity guard
  IF NULLIF(current_setting('request.jwt.claims', true), '') IS NOT NULL OR NULLIF(current_setting('request.jwt.claim.sub', true), '') IS NOT NULL THEN
    IF COALESCE((auth.jwt() ->> 'sub'), NULLIF(current_setting('request.jwt.claim.sub', true), ''), '') <> p_user_id::text THEN
      RAISE EXCEPTION 'S2 identity guard: caller identity does not match p_user_id' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO v_session FROM public."FocusSession" WHERE id = p_session_id;
  IF NOT FOUND OR v_session."endedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'Focus session is not active' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_member
  FROM public."FocusSessionMember"
  WHERE "sessionId" = p_session_id AND "userId" = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User is not in this focus session' USING ERRCODE = 'check_violation';
  END IF;

  IF v_member."timerState" = 'LEFT' THEN
    RAISE EXCEPTION 'User has left the focus session' USING ERRCODE = 'check_violation';
  END IF;

  IF v_member."timerState" = 'NOT_STARTED' THEN
    RAISE EXCEPTION 'Cannot pause a timer that has not been started' USING ERRCODE = 'check_violation';
  END IF;

  IF v_member."timerState" = 'PAUSED' THEN
    -- Idempotent
    RETURN jsonb_build_object(
      'success', true,
      'timerState', v_member."timerState",
      'accumulatedSeconds', v_member."accumulatedSeconds",
      'currentStartedAt', v_member."currentStartedAt"
    );
  END IF;

  IF v_member."timerState" = 'FOCUSING' AND v_member."currentStartedAt" IS NOT NULL THEN
    -- Hard clamp single stretch to 12 hours (43200s) to prevent runaway inflation
    v_elapsed := LEAST(43200, GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - v_member."currentStartedAt"))))::int);
  END IF;

  UPDATE public."FocusSessionMember"
  SET "timerState" = 'PAUSED',
      "accumulatedSeconds" = v_member."accumulatedSeconds" + v_elapsed,
      "currentStartedAt" = NULL,
      "lastHeartbeatAt" = CURRENT_TIMESTAMP
  WHERE id = v_member.id
  RETURNING * INTO v_member;

  RETURN jsonb_build_object(
    'success', true,
    'sessionId', p_session_id,
    'userId', p_user_id,
    'timerState', v_member."timerState",
    'accumulatedSeconds', v_member."accumulatedSeconds",
    'currentStartedAt', v_member."currentStartedAt"
  );
END;
$$;

-- 12. Hardened RPC 8: resume_focus_timer (validates state machine)
CREATE OR REPLACE FUNCTION public.resume_focus_timer(
  p_session_id INT,
  p_user_id INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session RECORD;
  v_member RECORD;
BEGIN
  -- S2 identity guard
  IF NULLIF(current_setting('request.jwt.claims', true), '') IS NOT NULL OR NULLIF(current_setting('request.jwt.claim.sub', true), '') IS NOT NULL THEN
    IF COALESCE((auth.jwt() ->> 'sub'), NULLIF(current_setting('request.jwt.claim.sub', true), ''), '') <> p_user_id::text THEN
      RAISE EXCEPTION 'S2 identity guard: caller identity does not match p_user_id' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO v_session FROM public."FocusSession" WHERE id = p_session_id;
  IF NOT FOUND OR v_session."endedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'Focus session is not active' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_member
  FROM public."FocusSessionMember"
  WHERE "sessionId" = p_session_id AND "userId" = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User is not in this focus session' USING ERRCODE = 'check_violation';
  END IF;

  IF v_member."timerState" = 'LEFT' THEN
    RAISE EXCEPTION 'User has left the focus session. Re-enter focus room first' USING ERRCODE = 'check_violation';
  END IF;

  IF v_member."timerState" = 'NOT_STARTED' THEN
    RAISE EXCEPTION 'Cannot resume a timer that has not been started. Use start_focus_timer instead' USING ERRCODE = 'check_violation';
  END IF;

  IF v_member."timerState" = 'FOCUSING' THEN
    -- Idempotent
    RETURN jsonb_build_object(
      'success', true,
      'timerState', v_member."timerState",
      'accumulatedSeconds', v_member."accumulatedSeconds",
      'currentStartedAt', v_member."currentStartedAt"
    );
  END IF;

  UPDATE public."FocusSessionMember"
  SET "timerState" = 'FOCUSING',
      "currentStartedAt" = CURRENT_TIMESTAMP,
      "lastHeartbeatAt" = CURRENT_TIMESTAMP
  WHERE id = v_member.id
  RETURNING * INTO v_member;

  RETURN jsonb_build_object(
    'success', true,
    'sessionId', p_session_id,
    'userId', p_user_id,
    'timerState', v_member."timerState",
    'accumulatedSeconds', v_member."accumulatedSeconds",
    'currentStartedAt', v_member."currentStartedAt"
  );
END;
$$;

-- 13. Hardened RPC 9: leave_focus_session (clamps interval & safely ends session)
CREATE OR REPLACE FUNCTION public.leave_focus_session(
  p_session_id INT,
  p_user_id INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member RECORD;
  v_elapsed INT := 0;
  v_new_accumulated INT;
  v_remaining_participants INT;
BEGIN
  -- S2 identity guard
  IF NULLIF(current_setting('request.jwt.claims', true), '') IS NOT NULL OR NULLIF(current_setting('request.jwt.claim.sub', true), '') IS NOT NULL THEN
    IF COALESCE((auth.jwt() ->> 'sub'), NULLIF(current_setting('request.jwt.claim.sub', true), ''), '') <> p_user_id::text THEN
      RAISE EXCEPTION 'S2 identity guard: caller identity does not match p_user_id' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO v_member
  FROM public."FocusSessionMember"
  WHERE "sessionId" = p_session_id AND "userId" = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'notFound', true);
  END IF;

  IF v_member."timerState" = 'LEFT' THEN
    -- Idempotent
    RETURN jsonb_build_object(
      'success', true,
      'sessionId', p_session_id,
      'userId', p_user_id,
      'accumulatedSeconds', v_member."accumulatedSeconds",
      'alreadyLeft', true
    );
  END IF;

  -- If currently focusing, bank the running interval with 12h clamp
  IF v_member."timerState" = 'FOCUSING' AND v_member."currentStartedAt" IS NOT NULL THEN
    v_elapsed := LEAST(43200, GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - v_member."currentStartedAt"))))::int);
  END IF;

  v_new_accumulated := v_member."accumulatedSeconds" + v_elapsed;

  UPDATE public."FocusSessionMember"
  SET "timerState" = 'LEFT',
      "accumulatedSeconds" = v_new_accumulated,
      "currentStartedAt" = NULL,
      "leftAt" = CURRENT_TIMESTAMP,
      "lastHeartbeatAt" = CURRENT_TIMESTAMP
  WHERE id = v_member.id;

  -- Check if ANY participants remain in the session (paused users still count as participants)
  SELECT count(*) INTO v_remaining_participants
  FROM public."FocusSessionMember"
  WHERE "sessionId" = p_session_id AND "timerState" <> 'LEFT';

  IF v_remaining_participants = 0 THEN
    -- Finalize and close the session
    UPDATE public."FocusSession"
    SET "endedAt" = CURRENT_TIMESTAMP
    WHERE id = p_session_id AND "endedAt" IS NULL;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'sessionId', p_session_id,
    'userId', p_user_id,
    'accumulatedSeconds', v_new_accumulated,
    'remainingParticipants', v_remaining_participants,
    'sessionEnded', (v_remaining_participants = 0)
  );
END;
$$;

-- 14. Hardened RPC 10: get_focus_party_state
CREATE OR REPLACE FUNCTION public.get_focus_party_state(
  p_party_id INT,
  p_user_id INT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_party RECORD;
  v_members JSONB;
  v_session RECORD;
  v_session_members JSONB := '[]'::jsonb;
  v_collective_seconds INT := 0;
BEGIN
  -- S2 identity guard
  IF NULLIF(current_setting('request.jwt.claims', true), '') IS NOT NULL OR NULLIF(current_setting('request.jwt.claim.sub', true), '') IS NOT NULL THEN
    IF COALESCE((auth.jwt() ->> 'sub'), NULLIF(current_setting('request.jwt.claim.sub', true), ''), '') <> p_user_id::text THEN
      RAISE EXCEPTION 'S2 identity guard: caller identity does not match p_user_id' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO v_party FROM public."FocusParty" WHERE id = p_party_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FocusParty % not found', p_party_id USING ERRCODE = '23503';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public."FocusPartyMember"
    WHERE "partyId" = p_party_id AND "userId" = p_user_id
  ) THEN
    RAISE EXCEPTION 'User does not belong to party' USING ERRCODE = '42501';
  END IF;

  -- Aggregate members
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'userId', u.id,
      'username', u.username,
      'name', u.name,
      'hunterRank', u."hunterRank",
      'avatarUrl', u."avatarUrl",
      'characterConfig', u."characterConfig",
      'joinedAt', fpm."joinedAt",
      'isLeader', (u.id = v_party."leaderId")
    ) ORDER BY fpm."joinedAt" ASC
  ), '[]'::jsonb)
  INTO v_members
  FROM public."FocusPartyMember" fpm
  JOIN public."User" u ON u.id = fpm."userId"
  WHERE fpm."partyId" = p_party_id;

  -- Active session if any
  SELECT * INTO v_session
  FROM public."FocusSession"
  WHERE "partyId" = p_party_id AND "endedAt" IS NULL;

  IF v_session.id IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'userId', fsm."userId",
        'timerState', fsm."timerState",
        'accumulatedSeconds', fsm."accumulatedSeconds",
        'currentStartedAt', fsm."currentStartedAt",
        'joinedAt', fsm."joinedAt",
        'leftAt', fsm."leftAt",
        'liveSeconds', (
          fsm."accumulatedSeconds" +
          CASE
            WHEN fsm."timerState" = 'FOCUSING' AND fsm."currentStartedAt" IS NOT NULL
            THEN LEAST(43200, GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - fsm."currentStartedAt"))))::int)
            ELSE 0
          END
        )
      )
    ), '[]'::jsonb),
    COALESCE(SUM(
      fsm."accumulatedSeconds" +
      CASE
        WHEN fsm."timerState" = 'FOCUSING' AND fsm."currentStartedAt" IS NOT NULL
        THEN LEAST(43200, GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - fsm."currentStartedAt"))))::int)
        ELSE 0
      END
    ), 0)::int
    INTO v_session_members, v_collective_seconds
    FROM public."FocusSessionMember" fsm
    WHERE fsm."sessionId" = v_session.id;
  END IF;

  RETURN jsonb_build_object(
    'party', jsonb_build_object(
      'id', v_party.id,
      'name', v_party.name,
      'leaderId', v_party."leaderId",
      'createdAt', v_party."createdAt",
      'updatedAt', v_party."updatedAt",
      'disbandedAt', v_party."disbandedAt"
    ),
    'members', v_members,
    'activeSession', CASE WHEN v_session.id IS NOT NULL THEN jsonb_build_object(
      'id', v_session.id,
      'startedAt', v_session."startedAt",
      'collectiveSeconds', v_collective_seconds,
      'members', v_session_members
    ) ELSE NULL END
  );
END;
$$;

-- 15. Invariant: Only active party members can create Focus Party invites
CREATE OR REPLACE FUNCTION public.check_focus_party_invite_sender()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW."partyId" IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public."FocusPartyMember"
      WHERE "partyId" = NEW."partyId" AND "userId" = NEW."senderId"
    ) THEN
      RAISE EXCEPTION 'Sender must be a member of the party to create an invite' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_focus_party_invite_sender ON public."SessionInvite";
CREATE TRIGGER trg_check_focus_party_invite_sender
BEFORE INSERT ON public."SessionInvite"
FOR EACH ROW
EXECUTE FUNCTION public.check_focus_party_invite_sender();
