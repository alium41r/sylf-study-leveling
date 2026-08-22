-- ============================================================
-- Fix Session Duration Inflation & Canonical Reward Parity
-- ============================================================
-- ROOT CAUSE: complete_study_session credited the CUMULATIVE
-- session duration to User totals and re-awarded XP/Sylph on
-- EVERY invocation. The client flushes every ~180s plus on
-- pause/resume and final end, so a 3-hour session credited
-- 3+6+9+...+180 minutes (~91h) instead of 180 minutes, and
-- awarded rewards for every flush.
--
-- REMEDIATION:
--  1. Session row is SET (never incremented) to the exact
--     cumulative duration.
--  2. User lifetime totals advance ONLY by the DELTA since the
--     previously credited duration (exact N-seconds parity).
--  3. Quest.elapsedSeconds advances ONLY by the delta.
--  4. XP/Sylph are awarded exactly once per session, gated on
--     p_is_final (or the insert path), computed from the FULL
--     session duration using the canonical unified formula:
--       XP    = FLOOR(5 × minutes × sessionMultiplier)
--       Sylph = MAX(5, FLOOR(0.5 × minutes × streakMultiplier))
-- ============================================================

-- Drop the legacy signature so the new p_is_final parameter is
-- the single binding target for all callers.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'complete_study_session'
    ) THEN
        DROP FUNCTION public.complete_study_session(integer, integer, integer, integer, integer, integer, integer);
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.complete_study_session(
    p_user_id INT,
    p_session_id INT DEFAULT NULL,
    p_duration_minutes INT DEFAULT 0,
    p_duration_seconds INT DEFAULT 0,
    p_quest_id INT DEFAULT NULL,
    p_subject_id INT DEFAULT NULL,
    p_focus_rate INT DEFAULT 80,
    p_is_final BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
  v_actual_seconds INT;
  v_previous_seconds INT := 0;
  v_delta_seconds INT := 0;
  v_new_total_seconds INT;
  v_was_insert BOOLEAN := FALSE;
  v_award_eligible BOOLEAN := FALSE;
  v_minutes NUMERIC;
  v_streak_multiplier NUMERIC := 1.0;
  v_session_multiplier NUMERIC := 1.0;
  v_xp_gained INT := 0;
  v_final_sylph INT := 0;
  v_total_sylph_earned INT := 0;
  v_level INT;
  v_current_xp INT;
  v_xp_threshold INT;
  v_rank TEXT;
  v_rank_db TEXT;
  v_previous_rank TEXT;
  v_levels_gained INT := 0;
  v_did_rank_up BOOLEAN := FALSE;
  v_level_up_sylph INT := 0;
  v_session_id INT := p_session_id;
  v_lifetime_xp INT;
  v_rank_up_text TEXT;
BEGIN
  -- Lock the StudySession claim anchor FIRST (fixed lock order:
  -- StudySession → User → UserStats) and capture the previously
  -- credited duration for exact delta accounting.
  IF v_session_id IS NOT NULL THEN
    SELECT "durationSeconds"
    INTO v_previous_seconds
    FROM public."StudySession"
    WHERE id = v_session_id AND "userId" = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Session not found: %', v_session_id;
    END IF;
    v_previous_seconds := COALESCE(v_previous_seconds, 0);
  END IF;

  -- Fetch and lock user row for atomic update
  SELECT id, level, "currentXP", "xpToNextLevel", "hunterRank", sylph, "streakDays",
         "totalStudyMinutes", "totalStudySeconds"
  INTO v_user
  FROM public."User"
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;

  -- Normalize the claimed duration (server-clamped upstream).
  v_actual_seconds := GREATEST(0, COALESCE(p_duration_seconds, p_duration_minutes * 60));

  -- EXACT PARITY: only the new portion since the last credit counts.
  v_delta_seconds := GREATEST(0, v_actual_seconds - v_previous_seconds);

  -- Session row is SET to the exact cumulative duration (never +=).
  IF v_session_id IS NOT NULL THEN
    UPDATE public."StudySession"
    SET "durationMinutes" = FLOOR(v_actual_seconds / 60.0),
        "durationSeconds" = v_actual_seconds,
        "focusRate" = p_focus_rate,
        "endedAt" = NOW()
    WHERE id = v_session_id AND "userId" = p_user_id;
  ELSE
    v_was_insert := TRUE;
    INSERT INTO public."StudySession" (
      "userId", "questId", "subjectId", "durationMinutes", "durationSeconds", "focusRate", "startedAt", "endedAt"
    ) VALUES (
      p_user_id, p_quest_id, p_subject_id,
      FLOOR(v_actual_seconds / 60.0), v_actual_seconds, p_focus_rate,
      NOW() - (v_actual_seconds || ' seconds')::INTERVAL, NOW()
    )
    RETURNING id INTO v_session_id;
  END IF;

  -- Lifetime study totals advance ONLY by the delta — minutes stay
  -- exactly floor(totalSeconds / 60) at all times.
  IF v_delta_seconds > 0 THEN
    v_new_total_seconds := COALESCE(v_user."totalStudySeconds", 0) + v_delta_seconds;
    UPDATE public."User"
    SET "totalStudySeconds" = v_new_total_seconds,
        "totalStudyMinutes" = FLOOR(v_new_total_seconds / 60.0)
    WHERE id = p_user_id;
  END IF;

  -- Quest elapsed time advances ONLY by the delta as well.
  IF p_quest_id IS NOT NULL AND v_delta_seconds > 0 THEN
    UPDATE public."Quest"
    SET "elapsedSeconds" = "elapsedSeconds" + v_delta_seconds
    WHERE id = p_quest_id AND "userId" = p_user_id;
  END IF;

  -- ─── Canonical rewards — awarded exactly ONCE per session ───
  -- Final flush (or direct completion) is the single award point;
  -- intermediate auto-save flushes never award. Retrying the final
  -- flush yields delta = 0 and is therefore ineligible.
  v_award_eligible := (p_is_final OR v_was_insert)
                      AND (v_delta_seconds > 0 OR v_previous_seconds = 0);

  v_level := v_user.level;
  v_current_xp := v_user."currentXP";
  v_xp_threshold := public.canonical_xp_for_next_level(v_level); -- canonical, never trust stored legacy value
  v_rank := v_user."hunterRank";
  v_previous_rank := v_user."hunterRank";

  IF v_award_eligible AND v_actual_seconds >= 60 THEN
    v_minutes := v_actual_seconds / 60.0;

    -- Long-session multiplier = xpMultiplier in the canonical formula.
    IF v_minutes >= 120 THEN
      v_session_multiplier := 1.3;
    ELSIF v_minutes >= 60 THEN
      v_session_multiplier := 1.2;
    ELSIF v_minutes >= 30 THEN
      v_session_multiplier := 1.1;
    ELSE
      v_session_multiplier := 1.0;
    END IF;

    -- Streak multiplier = sylphMultiplier in the canonical formula.
    IF v_user."streakDays" >= 8 THEN
      v_streak_multiplier := 1.5;
    ELSIF v_user."streakDays" >= 4 THEN
      v_streak_multiplier := 1.3;
    ELSIF v_user."streakDays" >= 2 THEN
      v_streak_multiplier := 1.15;
    ELSIF v_user."streakDays" >= 1 THEN
      v_streak_multiplier := 1.05;
    ELSE
      v_streak_multiplier := 1.0;
    END IF;

    -- Canonical unified difficulty formula:
    --   XP    = FLOOR(5 × minutes × xpMultiplier)
    --   Sylph = MAX(5, FLOOR(0.5 × minutes × sylphMultiplier))
    v_xp_gained := FLOOR(5 * v_minutes * v_session_multiplier);
    v_final_sylph := GREATEST(5, FLOOR(0.5 * v_minutes * v_streak_multiplier));

    -- Award XP & process multi-level up loop — CANONICAL curve
    v_current_xp := v_current_xp + v_xp_gained;
    WHILE v_current_xp >= v_xp_threshold LOOP
      v_current_xp := v_current_xp - v_xp_threshold;
      v_level := v_level + 1;
      v_levels_gained := v_levels_gained + 1;
      v_xp_threshold := public.canonical_xp_for_next_level(v_level);
    END LOOP;

    -- Canonical 8-tier rank ladder: 10/25/50/75/100/125/150
    v_rank := public.canonical_rank_display(v_level);
    v_did_rank_up := (v_rank <> v_previous_rank);

    -- Level up stipend
    IF v_levels_gained > 0 THEN
      v_level_up_sylph := v_level * 300;
    END IF;
    v_total_sylph_earned := v_final_sylph + v_level_up_sylph;

    -- Atomic user progression update (rewards only; totals updated above)
    UPDATE public."User"
    SET level = v_level,
        "currentXP" = v_current_xp,
        "xpToNextLevel" = v_xp_threshold,
        "hunterRank" = v_rank,
        sylph = sylph + v_total_sylph_earned
    WHERE id = p_user_id;

    -- Mirror lifetime XP into UserStats (canonical cumulative store)
    v_lifetime_xp := CASE
        WHEN v_level <= 1 THEN v_current_xp
        ELSE public.canonical_required_xp(v_level) + v_current_xp
    END;
    v_rank_db := public.canonical_rank_db(v_level);

    INSERT INTO public."UserStats" ("userId", "level", "xp", "rank", "currency", "skillPoints",
        "endurance", "tenacity", "velocity", "discipline", "synthesis", "updatedAt")
    VALUES (p_user_id, v_level, v_lifetime_xp, v_rank_db, v_total_sylph_earned, 0, 10, 10, 10, 10, 10, CURRENT_TIMESTAMP)
    ON CONFLICT ("userId") DO UPDATE SET
        xp = v_lifetime_xp,
        level = v_level,
        rank = v_rank_db,
        currency = "UserStats".currency + v_total_sylph_earned,
        "updatedAt" = CURRENT_TIMESTAMP;

    -- Audit Ledgers & Notifications
    IF v_xp_gained > 0 THEN
      INSERT INTO public."XpLedger" ("userId", amount, "balanceAfter", reason, source, metadata, "createdAt")
      VALUES (p_user_id, v_xp_gained, v_lifetime_xp, 'FOCUS_SESSION', 'TIMER',
              jsonb_build_object('sessionId', v_session_id), NOW());
    END IF;

    IF v_final_sylph > 0 THEN
      INSERT INTO public."SylphLedger" ("userId", amount, source, "createdAt")
      VALUES (p_user_id, v_final_sylph, 'TIMER', NOW());
    END IF;

    IF v_level_up_sylph > 0 THEN
      INSERT INTO public."SylphLedger" ("userId", amount, source, "createdAt")
      VALUES (p_user_id, v_level_up_sylph, 'LEVEL_UP', NOW());
    END IF;

    IF v_levels_gained > 0 THEN
      v_rank_up_text := CASE WHEN v_did_rank_up THEN E'\n\nRank Up! You are now a ' || v_rank || E'-Rank Hunter.' ELSE '' END;
      INSERT INTO public."SystemMessage" ("userId", content, type, read, "createdAt")
      VALUES (
        p_user_id,
        E'**Level Up**\n\nYou have reached Level ' || v_level || '.' || v_rank_up_text || E'\n\nStipend: +' || v_level_up_sylph || E' Sylph\n\nYou have grown stronger.',
        'LEVEL_UP',
        false,
        NOW()
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'sessionId', v_session_id,
    'userId', p_user_id,
    'durationMinutes', FLOOR(v_actual_seconds / 60.0),
    'durationSeconds', v_actual_seconds,
    'deltaSeconds', v_delta_seconds,
    'awarded', v_award_eligible AND v_actual_seconds >= 60,
    'xpGained', v_xp_gained,
    'sylphGained', v_final_sylph,
    'totalSylphEarned', v_total_sylph_earned,
    'level', v_level,
    'currentXP', v_current_xp,
    'xpToNextLevel', v_xp_threshold,
    'hunterRank', v_rank,
    'levelsGained', v_levels_gained,
    'didRankUp', v_did_rank_up
  );
END;
$$;
