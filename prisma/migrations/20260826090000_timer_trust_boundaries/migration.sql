-- ============================================================
-- Timer trust boundaries (T2 adversarial verification fixes)
-- ============================================================
-- Verified vulnerabilities fixed here:
--  V1: unbounded p_initial_seconds backdating allowed a client to
--      manufacture 24h of study time (86,400s delta, 9,360 XP).
--      FIX: hard cap at 1h + overlap guard — a session's backdated start
--      can never precede the end of the user's most recent ended session
--      (minus 60s grace). Recovery can only fill REAL wall-clock gaps in
--      the user's own history.
--  V2: two concurrent lazy starts (multi-tab) created two session rows,
--      both creditable from the same wall-clock period.
--      FIX: ADOPT — an open session with the same (questId, subjectId)
--      is returned instead of creating a duplicate.
--  V3: foreign subjectId/questId were accepted (cross-user linkage).
--      FIX: ownership validation raises 42501.
-- ============================================================

CREATE OR REPLACE FUNCTION public.start_study_session(
    p_user_id INT,
    p_quest_id INT DEFAULT NULL,
    p_subject_id INT DEFAULT NULL,
    p_initial_seconds INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id INT;
  v_started_at TIMESTAMP;
  v_initial_seconds INT;
  v_existing RECORD;
  v_last_end TIMESTAMP;
BEGIN
  -- 1. HARD CAP on carried seconds (server-authoritative trust boundary).
  v_initial_seconds := LEAST(GREATEST(0, COALESCE(p_initial_seconds, 0)), 3600);

  -- 2. Ownership validation — a session may never reference another
  --    user's subject or quest.
  IF p_subject_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public."Subject" WHERE id = p_subject_id AND "userId" = p_user_id
  ) THEN
    RAISE EXCEPTION 'Subject not found or unauthorized' USING ERRCODE = '42501';
  END IF;
  IF p_quest_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public."Quest" WHERE id = p_quest_id AND "userId" = p_user_id
  ) THEN
    RAISE EXCEPTION 'Quest not found or unauthorized' USING ERRCODE = '42501';
  END IF;

  -- If quest is provided, update quest status to IN_PROGRESS
  IF p_quest_id IS NOT NULL THEN
    UPDATE public."Quest"
    SET status = 'IN_PROGRESS'
    WHERE id = p_quest_id AND "userId" = p_user_id AND status = 'PENDING';
  END IF;

  -- 3. ADOPT: converge concurrent/duplicate starts onto ONE session row.
  --    A second tab racing the same lazy start receives the EXISTING open
  --    session instead of creating a duplicate that could double-credit
  --    the same wall-clock period.
  SELECT id, "startedAt", "durationMinutes", "durationSeconds", "focusRate"
  INTO v_existing
  FROM public."StudySession"
  WHERE "userId" = p_user_id
    AND "endedAt" IS NULL
    AND "questId" IS NOT DISTINCT FROM p_quest_id
    AND "subjectId" IS NOT DISTINCT FROM p_subject_id
  ORDER BY id
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'id', v_existing.id,
      'userId', p_user_id,
      'questId', p_quest_id,
      'subjectId', p_subject_id,
      'durationMinutes', v_existing."durationMinutes",
      'durationSeconds', v_existing."durationSeconds",
      'focusRate', v_existing."focusRate",
      'startedAt', v_existing."startedAt"
    );
  END IF;

  -- 4. Anti-fabrication overlap guard: compute the user's last ENDED
  --    session BEFORE closing open rows (closing sets endedAt = NOW(),
  --    which would otherwise wipe the legitimate backdate window).
  SELECT MAX("endedAt") INTO v_last_end
  FROM public."StudySession"
  WHERE "userId" = p_user_id AND "endedAt" IS NOT NULL;

  -- 5. Close any OTHER unended active sessions for this user (single
  --    open-session invariant; abandoned rows cannot accumulate).
  UPDATE public."StudySession"
  SET "endedAt" = NOW()
  WHERE "userId" = p_user_id AND "endedAt" IS NULL;

  -- 6. Backdated start — capped (step 1) and never allowed to precede
  --    the user's last ended session (step 4). A fabricated backdate can
  --    only reach into time the user demonstrably did not already have
  --    credited, and never more than 1h.
  v_started_at := NOW() - (v_initial_seconds || ' seconds')::INTERVAL;

  IF v_last_end IS NOT NULL THEN
    v_started_at := GREATEST(v_started_at, v_last_end - INTERVAL '60 seconds');
  END IF;

  -- Insert new study session (stored duration stays 0 — the settle RPC
  -- credits the exact delta on the first flush).
  INSERT INTO public."StudySession" (
    "userId", "questId", "subjectId", "durationMinutes", "durationSeconds", "focusRate", "startedAt"
  ) VALUES (
    p_user_id, p_quest_id, p_subject_id, 0, 0, 80, v_started_at
  )
  RETURNING id INTO v_session_id;

  RETURN jsonb_build_object(
    'id', v_session_id,
    'userId', p_user_id,
    'questId', p_quest_id,
    'subjectId', p_subject_id,
    'durationMinutes', 0,
    'durationSeconds', 0,
    'focusRate', 80,
    'startedAt', v_started_at
  );
END;
$$;
