-- ============================================================================
-- Focus Party: Multiplayer Study System — Phase 1 Backend Data Foundation
-- ============================================================================
-- Implements:
--   1. FocusTimerState enum
--   2. FocusParty (persistent group of up to 4 users)
--   3. FocusPartyMember (party membership)
--   4. FocusSession (ephemeral study session within a party)
--   5. FocusSessionMember (per-user session participation & timer state)
--   6. SessionInvite extension (partyId foreign key)
--   7. Partial unique index: at most ONE active FocusSession per party
--   8. Triggers: max 4 members capacity, session-party consistency, ended session guard
--   9. Helper functions & RLS policies with custom JWT semantics
--  10. Atomic SECURITY DEFINER RPCs with S2 identity guards:
--        - create_focus_party
--        - join_focus_party
--        - leave_focus_party (with auto-leadership transfer to longest-tenured member)
--        - remove_focus_party_member (leader-only protection)
--        - enter_focus_session (atomic create-or-join, concurrency safe)
--        - start_focus_timer
--        - pause_focus_timer
--        - resume_focus_timer
--        - leave_focus_session (auto-ends session when 0 participants remain)
--        - get_focus_party_state
--  11. Realtime publication setup with REPLICA IDENTITY FULL
-- ============================================================================

-- 1. Create FocusTimerState Enum
DO $$ BEGIN
  CREATE TYPE public."FocusTimerState" AS ENUM ('NOT_STARTED', 'FOCUSING', 'PAUSED', 'LEFT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Create FocusParty Table
CREATE TABLE IF NOT EXISTS public."FocusParty" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL DEFAULT 'Focus Party',
  "leaderId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FocusParty_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FocusParty_leaderId_fkey" FOREIGN KEY ("leaderId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 3. Create FocusPartyMember Table
CREATE TABLE IF NOT EXISTS public."FocusPartyMember" (
  "id" SERIAL NOT NULL,
  "partyId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FocusPartyMember_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FocusPartyMember_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES public."FocusParty"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FocusPartyMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FocusPartyMember_partyId_userId_key" UNIQUE ("partyId", "userId")
);

-- 4. Create FocusSession Table
CREATE TABLE IF NOT EXISTS public."FocusSession" (
  "id" SERIAL NOT NULL,
  "partyId" INTEGER NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  CONSTRAINT "FocusSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FocusSession_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES public."FocusParty"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 5. Create FocusSessionMember Table
CREATE TABLE IF NOT EXISTS public."FocusSessionMember" (
  "id" SERIAL NOT NULL,
  "sessionId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "timerState" public."FocusTimerState" NOT NULL DEFAULT 'NOT_STARTED',
  "accumulatedSeconds" INTEGER NOT NULL DEFAULT 0,
  "currentStartedAt" TIMESTAMP(3),
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leftAt" TIMESTAMP(3),
  "lastHeartbeatAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FocusSessionMember_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FocusSessionMember_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES public."FocusSession"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FocusSessionMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FocusSessionMember_sessionId_userId_key" UNIQUE ("sessionId", "userId"),
  CONSTRAINT "FocusSessionMember_accumulated_non_negative" CHECK ("accumulatedSeconds" >= 0)
);

-- 6. Extend SessionInvite with partyId
ALTER TABLE public."SessionInvite" ADD COLUMN IF NOT EXISTS "partyId" INTEGER;

DO $$ BEGIN
  ALTER TABLE public."SessionInvite" ADD CONSTRAINT "SessionInvite_partyId_fkey"
  FOREIGN KEY ("partyId") REFERENCES public."FocusParty"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 7. Indexes & Constraints
-- INVARIANT: At most ONE active Focus Session per party
CREATE UNIQUE INDEX IF NOT EXISTS "focus_session_single_active_per_party"
ON public."FocusSession" ("partyId")
WHERE "endedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "FocusParty_leaderId_idx" ON public."FocusParty" ("leaderId");
CREATE INDEX IF NOT EXISTS "FocusPartyMember_userId_idx" ON public."FocusPartyMember" ("userId");
CREATE INDEX IF NOT EXISTS "FocusPartyMember_party_joined_idx" ON public."FocusPartyMember" ("partyId", "joinedAt" ASC);
CREATE INDEX IF NOT EXISTS "FocusSession_party_started_idx" ON public."FocusSession" ("partyId", "startedAt" DESC);
CREATE INDEX IF NOT EXISTS "FocusSessionMember_userId_idx" ON public."FocusSessionMember" ("userId");
CREATE INDEX IF NOT EXISTS "FocusSessionMember_session_state_idx" ON public."FocusSessionMember" ("sessionId", "timerState");
CREATE INDEX IF NOT EXISTS "SessionInvite_partyId_status_idx" ON public."SessionInvite" ("partyId", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "SessionInvite_party_receiver_pending_idx"
ON public."SessionInvite" ("partyId", "receiverId")
WHERE "status" = 'PENDING' AND "partyId" IS NOT NULL;

-- 8. Invariant Triggers

-- INVARIANT: Max 4 members per party (serializes on parent party row to eliminate race conditions)
CREATE OR REPLACE FUNCTION public.check_focus_party_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
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

DROP TRIGGER IF EXISTS trg_check_focus_party_capacity ON public."FocusPartyMember";
CREATE TRIGGER trg_check_focus_party_capacity
BEFORE INSERT ON public."FocusPartyMember"
FOR EACH ROW
EXECUTE FUNCTION public.check_focus_party_capacity();

-- INVARIANT: Session participants must belong to the party, and session cannot be ended
CREATE OR REPLACE FUNCTION public.check_focus_session_member_party()
RETURNS TRIGGER
LANGUAGE plpgsql
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

DROP TRIGGER IF EXISTS trg_check_focus_session_member_party ON public."FocusSessionMember";
CREATE TRIGGER trg_check_focus_session_member_party
BEFORE INSERT ON public."FocusSessionMember"
FOR EACH ROW
EXECUTE FUNCTION public.check_focus_session_member_party();

-- INVARIANT: Closed sessions cannot be modified
CREATE OR REPLACE FUNCTION public.check_focus_session_ended_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
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

DROP TRIGGER IF EXISTS trg_check_focus_session_ended_guard ON public."FocusSessionMember";
CREATE TRIGGER trg_check_focus_session_ended_guard
BEFORE UPDATE ON public."FocusSessionMember"
FOR EACH ROW
EXECUTE FUNCTION public.check_focus_session_ended_guard();

-- 9. STABLE SECURITY DEFINER Helpers to Prevent 42P17 RLS Policy Recursion
CREATE OR REPLACE FUNCTION public.is_focus_party_member(p_party_id INT, p_user_id INT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."FocusPartyMember"
    WHERE "partyId" = p_party_id AND "userId" = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_focus_session_participant(p_session_id INT, p_user_id INT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."FocusPartyMember" fpm
    JOIN public."FocusSession" fs ON fs."partyId" = fpm."partyId"
    WHERE fs.id = p_session_id AND fpm."userId" = p_user_id
  );
$$;

-- 10. Row Level Security (RLS)
ALTER TABLE public."FocusParty" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."FocusPartyMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."FocusSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."FocusSessionMember" ENABLE ROW LEVEL SECURITY;

-- FocusParty policies
DROP POLICY IF EXISTS "focus_party_select_policy" ON public."FocusParty";
CREATE POLICY "focus_party_select_policy" ON public."FocusParty"
  FOR SELECT TO public
  USING (
    public.is_focus_party_member(id, COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0)::int)
    OR EXISTS (
      SELECT 1 FROM public."SessionInvite" si
      WHERE si."partyId" = "FocusParty".id
        AND si."receiverId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0)::int
        AND si.status = 'PENDING'
    )
  );

DROP POLICY IF EXISTS "focus_party_insert_policy" ON public."FocusParty";
CREATE POLICY "focus_party_insert_policy" ON public."FocusParty"
  FOR INSERT TO public
  WITH CHECK ("leaderId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0)::int);

DROP POLICY IF EXISTS "focus_party_update_leader" ON public."FocusParty";
CREATE POLICY "focus_party_update_leader" ON public."FocusParty"
  FOR UPDATE TO public
  USING ("leaderId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0)::int)
  WITH CHECK ("leaderId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0)::int);

DROP POLICY IF EXISTS "focus_party_delete_leader" ON public."FocusParty";
CREATE POLICY "focus_party_delete_leader" ON public."FocusParty"
  FOR DELETE TO public
  USING ("leaderId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0)::int);

-- FocusPartyMember policies
DROP POLICY IF EXISTS "focus_party_member_select" ON public."FocusPartyMember";
CREATE POLICY "focus_party_member_select" ON public."FocusPartyMember"
  FOR SELECT TO public
  USING (
    public.is_focus_party_member("partyId", COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0)::int)
  );

DROP POLICY IF EXISTS "focus_party_member_insert" ON public."FocusPartyMember";
CREATE POLICY "focus_party_member_insert" ON public."FocusPartyMember"
  FOR INSERT TO public
  WITH CHECK ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0)::int);

DROP POLICY IF EXISTS "focus_party_member_delete" ON public."FocusPartyMember";
CREATE POLICY "focus_party_member_delete" ON public."FocusPartyMember"
  FOR DELETE TO public
  USING (
    "userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0)::int
    OR EXISTS (
      SELECT 1 FROM public."FocusParty" p
      WHERE p.id = "FocusPartyMember"."partyId"
        AND p."leaderId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0)::int
    )
  );

-- FocusSession policies
DROP POLICY IF EXISTS "focus_session_select" ON public."FocusSession";
CREATE POLICY "focus_session_select" ON public."FocusSession"
  FOR SELECT TO public
  USING (
    public.is_focus_party_member("partyId", COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0)::int)
  );

DROP POLICY IF EXISTS "focus_session_insert" ON public."FocusSession";
CREATE POLICY "focus_session_insert" ON public."FocusSession"
  FOR INSERT TO public
  WITH CHECK (
    public.is_focus_party_member("partyId", COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0)::int)
  );

DROP POLICY IF EXISTS "focus_session_update" ON public."FocusSession";
CREATE POLICY "focus_session_update" ON public."FocusSession"
  FOR UPDATE TO public
  USING (
    public.is_focus_party_member("partyId", COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0)::int)
  );

-- FocusSessionMember policies
DROP POLICY IF EXISTS "focus_session_member_select" ON public."FocusSessionMember";
CREATE POLICY "focus_session_member_select" ON public."FocusSessionMember"
  FOR SELECT TO public
  USING (
    public.is_focus_session_participant("sessionId", COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0)::int)
  );

DROP POLICY IF EXISTS "focus_session_member_insert" ON public."FocusSessionMember";
CREATE POLICY "focus_session_member_insert" ON public."FocusSessionMember"
  FOR INSERT TO public
  WITH CHECK ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0)::int);

-- A user may modify ONLY their own timer state. No user can alter another's timer.
DROP POLICY IF EXISTS "focus_session_member_update" ON public."FocusSessionMember";
CREATE POLICY "focus_session_member_update" ON public."FocusSessionMember"
  FOR UPDATE TO public
  USING ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0)::int)
  WITH CHECK ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0)::int);

DROP POLICY IF EXISTS "focus_session_member_delete" ON public."FocusSessionMember";
CREATE POLICY "focus_session_member_delete" ON public."FocusSessionMember"
  FOR DELETE TO public
  USING ("userId" = COALESCE((auth.jwt() ->> 'sub')::bigint, (auth.jwt() ->> 'userId')::bigint, 0)::int);

-- ============================================================================
-- 11. Atomic SECURITY DEFINER RPC Functions with S2 Identity Guards
-- ============================================================================

-- RPC 1: create_focus_party
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

  v_clean_name := COALESCE(NULLIF(TRIM(p_name), ''), 'Focus Party');

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

-- RPC 2: join_focus_party
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

  SELECT EXISTS (
    SELECT 1 FROM public."FocusPartyMember"
    WHERE "partyId" = p_party_id AND "userId" = p_user_id
  ) INTO v_already;

  IF v_already THEN
    RETURN jsonb_build_object('success', true, 'partyId', p_party_id, 'alreadyMember', true);
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

-- RPC 3: leave_focus_party (Automatic leadership transfer to oldest remaining member)
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
    -- Delete empty party
    DELETE FROM public."FocusParty" WHERE id = p_party_id;
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

-- RPC 4: remove_focus_party_member (Leader-only protection)
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

-- RPC 5: enter_focus_session (Atomic creation / concurrency-safe entrant handling)
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
  v_session_id INT;
  v_member RECORD;
BEGIN
  -- S2 identity guard
  IF NULLIF(current_setting('request.jwt.claims', true), '') IS NOT NULL OR NULLIF(current_setting('request.jwt.claim.sub', true), '') IS NOT NULL THEN
    IF COALESCE((auth.jwt() ->> 'sub'), NULLIF(current_setting('request.jwt.claim.sub', true), ''), '') <> p_user_id::text THEN
      RAISE EXCEPTION 'S2 identity guard: caller identity does not match p_user_id' USING ERRCODE = '42501';
    END IF;
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

-- RPC 6: start_focus_timer
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

  IF v_member."timerState" = 'FOCUSING' THEN
    -- Already focusing, idempotent
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

-- RPC 7: pause_focus_timer
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
    v_elapsed := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - v_member."currentStartedAt"))))::int;
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

-- RPC 8: resume_focus_timer
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

-- RPC 9: leave_focus_session (Preserves cumulative time; auto-ends session when 0 participants remain)
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

  -- If currently focusing, bank the running interval
  IF v_member."timerState" = 'FOCUSING' AND v_member."currentStartedAt" IS NOT NULL THEN
    v_elapsed := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - v_member."currentStartedAt"))))::int;
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

-- RPC 10: get_focus_party_state
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
            THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - fsm."currentStartedAt"))))::int
            ELSE 0
          END
        )
      )
    ), '[]'::jsonb),
    COALESCE(SUM(
      fsm."accumulatedSeconds" +
      CASE
        WHEN fsm."timerState" = 'FOCUSING' AND fsm."currentStartedAt" IS NOT NULL
        THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - fsm."currentStartedAt"))))::int
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
      'updatedAt', v_party."updatedAt"
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

-- 12. Realtime publication & Replica Identity
ALTER TABLE public."FocusParty" REPLICA IDENTITY FULL;
ALTER TABLE public."FocusPartyMember" REPLICA IDENTITY FULL;
ALTER TABLE public."FocusSession" REPLICA IDENTITY FULL;
ALTER TABLE public."FocusSessionMember" REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public."FocusParty";
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public."FocusPartyMember";
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public."FocusSession";
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public."FocusSessionMember";
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 13. Grants for authenticated role (guarded by RLS and S2 identity guards)
GRANT SELECT, INSERT, UPDATE, DELETE ON public."FocusParty" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."FocusPartyMember" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."FocusSession" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."FocusSessionMember" TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

GRANT EXECUTE ON FUNCTION public.create_focus_party(INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_focus_party(INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_focus_party(INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_focus_party_member(INT, INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enter_focus_session(INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_focus_timer(INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pause_focus_timer(INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resume_focus_timer(INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_focus_session(INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_focus_party_state(INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_focus_party_member(INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_focus_session_participant(INT, INT) TO authenticated;
