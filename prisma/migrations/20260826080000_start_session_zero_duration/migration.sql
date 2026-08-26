-- ============================================================
-- start_study_session: backdate startedAt but keep stored duration at 0
-- ============================================================
-- initialSeconds must ONLY backdate the session start (so the server-side
-- wall-clock clamp never truncates carried-over client time). Writing the
-- initial seconds into durationSeconds made the settle RPC's delta
-- accounting treat them as "already credited", so a final flush with no
-- new seconds awarded zero XP/Sylph for the carried study time.
-- Stored duration stays 0 until the first flush credits the exact delta.
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
BEGIN
  v_initial_seconds := GREATEST(0, COALESCE(p_initial_seconds, 0));

  -- Close any unended active sessions for this user
  UPDATE public."StudySession"
  SET "endedAt" = NOW()
  WHERE "userId" = p_user_id AND "endedAt" IS NULL;

  -- If quest is provided, update quest status to IN_PROGRESS
  IF p_quest_id IS NOT NULL THEN
    UPDATE public."Quest"
    SET status = 'IN_PROGRESS'
    WHERE id = p_quest_id AND "userId" = p_user_id AND status = 'PENDING';
  END IF;

  -- Backdate the start by the initial seconds so a lazily-created session
  -- with carried-over client time is never truncated by the wall-clock
  -- clamp. The stored duration stays 0: the settle RPC credits the exact
  -- delta on the first flush (and awards rewards on the final flush).
  v_started_at := NOW() - (v_initial_seconds || ' seconds')::INTERVAL;

  -- Insert new study session
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
