-- ============================================================
-- Migration: Atomic Session & Achievement Reward RPCs
--
-- 1. claim_session_reward_atomic   — idempotent, row-locked
--    quest-reward + node-progress claim for a completed study
--    session (replaces the read-modify-write awardXP +
--    prisma.user.update loop in app/api/sessions/route.ts).
-- 2. claim_achievement_reward_atomic — idempotent, row-locked
--    achievement redemption (replaces the client-side
--    transaction in app/api/achievements/route.ts).
-- 3. complete_study_session — canonicalized in place: the live
--    function still used the retired legacy curve 200 * L^1.2
--    and the 6/13/21/31/46 rank ladder. It now uses the
--    canonical helpers, locks StudySession BEFORE User (fixed
--    lock order), mirrors lifetime XP into UserStats and writes
--    XpLedger audit rows.
--
-- Lock acquisition ordering across ALL progression RPCs:
--   StudySession → Quest → User → UserStats → SubjectNode
-- (each function locks a prefix of this chain, never out of
--  order, which makes deadlock cycles impossible).
-- ============================================================

-- ─── 0. Schema: session-level reward claim marker ────────────

ALTER TABLE "StudySession"
    ADD COLUMN IF NOT EXISTS "rewardsClaimed" BOOLEAN NOT NULL DEFAULT FALSE;

-- ─── 1. claim_session_reward_atomic ──────────────────────────

CREATE OR REPLACE FUNCTION public.claim_session_reward_atomic(
    p_user_id TEXT,
    p_session_id TEXT,
    p_xp_amount INT,
    p_sylph_amount INT,
    p_node_id TEXT,
    p_progress_delta NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id INT;
    v_session_id INT;
    v_node_id INT := NULL;
    v_has_reward BOOLEAN;
    v_session_owner INT;
    v_claimed BOOLEAN;
    v_user RECORD;
    v_node RECORD;
    v_xp INT;
    v_sylph INT;
    v_lifetime_xp INT;
    v_level INT;
    v_current_xp INT;
    v_xp_threshold INT;
    v_rank TEXT;
    v_rank_db TEXT;
    v_levels_gained INT := 0;
    v_did_rank_up BOOLEAN := FALSE;
    v_new_progress NUMERIC := NULL;
    v_mastery_granted BOOLEAN := FALSE;
BEGIN
    -- 1. Validate TEXT parameters (cast only after shape check).
    IF p_user_id IS NULL OR p_user_id !~ '^[0-9]+$' THEN
        RAISE EXCEPTION 'Invalid user id' USING ERRCODE = '22023';
    END IF;
    IF p_session_id IS NULL OR p_session_id !~ '^[0-9]+$' THEN
        RAISE EXCEPTION 'Invalid session id' USING ERRCODE = '22023';
    END IF;
    IF p_node_id IS NOT NULL AND LENGTH(TRIM(p_node_id)) > 0 AND p_node_id !~ '^[0-9]+$' THEN
        RAISE EXCEPTION 'Invalid node id' USING ERRCODE = '22023';
    END IF;
    v_user_id := p_user_id::INT;
    v_session_id := p_session_id::INT;
    IF p_node_id IS NOT NULL AND LENGTH(TRIM(p_node_id)) > 0 THEN
        v_node_id := p_node_id::INT;
    END IF;

    v_xp := GREATEST(0, COALESCE(p_xp_amount, 0));
    v_sylph := GREATEST(0, COALESCE(p_sylph_amount, 0));
    v_has_reward := (v_xp > 0 OR v_sylph > 0);

    -- 2. Lock the session claim anchor FIRST (fixed lock order).
    SELECT "userId", "rewardsClaimed" INTO v_session_owner, v_claimed
    FROM "StudySession"
    WHERE id = v_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Session not found: %', v_session_id;
    END IF;
    IF v_session_owner <> v_user_id THEN
        RAISE EXCEPTION 'Session % does not belong to user %', v_session_id, v_user_id
            USING ERRCODE = '42501';
    END IF;

    -- 3. Idempotency guard: rewards may be claimed exactly once.
    IF v_has_reward AND v_claimed THEN
        RAISE EXCEPTION 'ALREADY_CLAIMED: Session % rewards have already been claimed', v_session_id
            USING ERRCODE = 'S0001';
    END IF;

    -- 4. Lock User → UserStats.
    SELECT * INTO v_user FROM "User" WHERE id = v_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found: %', v_user_id;
    END IF;

    INSERT INTO "UserStats" ("userId", "level", "xp", "rank", "currency", "skillPoints",
        "endurance", "tenacity", "velocity", "discipline", "synthesis", "updatedAt")
    VALUES (v_user_id, v_user.level, 0, 'RANK E', 0, 0, 10, 10, 10, 10, 10, CURRENT_TIMESTAMP)
    ON CONFLICT ("userId") DO NOTHING;

    PERFORM 1 FROM "UserStats" WHERE "userId" = v_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'UserStats record not found for user %', v_user_id;
    END IF;

    -- 5. Lock SubjectNode and apply progress delta (optional).
    IF v_node_id IS NOT NULL THEN
        SELECT sn."progress", sn."isMastered"
        INTO v_node
        FROM "SubjectNode" sn
        JOIN "Subject" s ON s.id = sn."subjectId"
        WHERE sn.id = v_node_id AND s."userId" = v_user_id
        FOR UPDATE OF sn;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Subject node % not found or unauthorized', v_node_id;
        END IF;

        IF COALESCE(p_progress_delta, 0) > 0 THEN
            v_new_progress := LEAST(100, v_node.progress + COALESCE(p_progress_delta, 0));

            UPDATE "SubjectNode"
            SET progress = v_new_progress,
                "isMastered" = CASE WHEN v_new_progress >= 100 THEN TRUE ELSE "isMastered" END,
                "masteredAt" = CASE WHEN v_new_progress >= 100 AND NOT "isMastered" THEN NOW() ELSE "masteredAt" END,
                "updatedAt" = CURRENT_TIMESTAMP
            WHERE id = v_node_id;

            v_mastery_granted := (NOT v_node.isMastered) AND v_new_progress >= 100;
        ELSE
            v_new_progress := v_node.progress;
        END IF;
    END IF;

    -- 6. Canonical recomputation of lifetime XP, level, rank, next-level XP.
    v_lifetime_xp := CASE
        WHEN v_user.level <= 1 THEN v_user."currentXP"
        ELSE public.canonical_required_xp(v_user.level) + v_user."currentXP"
    END;
    v_level := v_user.level;
    v_current_xp := v_user."currentXP";
    v_xp_threshold := public.canonical_xp_for_next_level(v_level);
    v_rank := v_user."hunterRank";

    IF v_has_reward THEN
        v_lifetime_xp := v_lifetime_xp + v_xp;
        v_current_xp := v_current_xp + v_xp;

        WHILE v_current_xp >= v_xp_threshold LOOP
            v_current_xp := v_current_xp - v_xp_threshold;
            v_level := v_level + 1;
            v_levels_gained := v_levels_gained + 1;
            v_xp_threshold := public.canonical_xp_for_next_level(v_level);
        END LOOP;

        v_rank := public.canonical_rank_display(v_level);
        v_rank_db := public.canonical_rank_db(v_level);
        v_did_rank_up := (v_rank <> v_user."hunterRank");

        -- 7. Atomic mutations.
        UPDATE "User"
        SET "currentXP" = v_current_xp,
            "xpToNextLevel" = v_xp_threshold,
            level = v_level,
            "hunterRank" = v_rank,
            sylph = sylph + v_sylph
        WHERE id = v_user_id;

        UPDATE "UserStats"
        SET xp = v_lifetime_xp,
            level = v_level,
            rank = v_rank_db,
            currency = currency + v_sylph,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "userId" = v_user_id;

        UPDATE "StudySession"
        SET "rewardsClaimed" = TRUE
        WHERE id = v_session_id;

        -- 8. Audit compliance ledgers.
        IF v_xp > 0 THEN
            INSERT INTO "XpLedger" ("userId", amount, "balanceAfter", reason, source, metadata, "createdAt")
            VALUES (v_user_id, v_xp, v_lifetime_xp, 'SESSION_QUEST_REWARD', 'QUEST',
                    jsonb_build_object('sessionId', v_session_id), NOW());
        END IF;

        IF v_sylph > 0 THEN
            INSERT INTO "SylphLedger" ("userId", amount, delta, "balanceAfter", reason, source, metadata, "createdAt")
            VALUES (v_user_id, v_sylph, v_sylph, v_user.sylph + v_sylph, 'SESSION_QUEST_REWARD', 'QUEST',
                    jsonb_build_object('sessionId', v_session_id), NOW());
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'sessionId', v_session_id,
        'xpGained', CASE WHEN v_has_reward THEN v_xp ELSE 0 END,
        'sylphGained', CASE WHEN v_has_reward THEN v_sylph ELSE 0 END,
        'level', v_level,
        'currentXP', v_current_xp,
        'xpToNextLevel', v_xp_threshold,
        'hunterRank', v_rank,
        'levelsGained', v_levels_gained,
        'didRankUp', v_did_rank_up,
        'nodeProgress', v_new_progress,
        'masteryGranted', v_mastery_granted
    );
END;
$$;

-- ─── 2. claim_achievement_reward_atomic ──────────────────────

CREATE OR REPLACE FUNCTION public.claim_achievement_reward_atomic(
    p_user_id TEXT,
    p_achievement_id TEXT,
    p_xp_reward INT,
    p_sylph_reward INT,
    p_title TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id INT;
    v_xp INT;
    v_sylph INT;
    v_user RECORD;
    v_lifetime_xp INT;
    v_level INT;
    v_current_xp INT;
    v_xp_threshold INT;
    v_rank TEXT;
    v_rank_db TEXT;
    v_levels_gained INT := 0;
    v_did_rank_up BOOLEAN := FALSE;
    v_level_up_sylph INT := 0;
    v_total_sylph INT;
BEGIN
    -- 1. Validate parameters.
    IF p_user_id IS NULL OR p_user_id !~ '^[0-9]+$' THEN
        RAISE EXCEPTION 'Invalid user id' USING ERRCODE = '22023';
    END IF;
    IF p_achievement_id IS NULL OR LENGTH(TRIM(p_achievement_id)) = 0 THEN
        RAISE EXCEPTION 'Invalid achievement id' USING ERRCODE = '22023';
    END IF;
    v_user_id := p_user_id::INT;
    v_xp := GREATEST(0, COALESCE(p_xp_reward, 0));
    v_sylph := GREATEST(0, COALESCE(p_sylph_reward, 0));

    -- 2. Lock order: User → UserStats.
    SELECT * INTO v_user FROM "User" WHERE id = v_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found: %', v_user_id;
    END IF;

    INSERT INTO "UserStats" ("userId", "level", "xp", "rank", "currency", "skillPoints",
        "endurance", "tenacity", "velocity", "discipline", "synthesis", "updatedAt")
    VALUES (v_user_id, v_user.level, 0, 'RANK E', 0, 0, 10, 10, 10, 10, 10, CURRENT_TIMESTAMP)
    ON CONFLICT ("userId") DO NOTHING;

    PERFORM 1 FROM "UserStats" WHERE "userId" = v_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'UserStats record not found for user %', v_user_id;
    END IF;

    -- 3. Idempotency guard.
    IF EXISTS (
        SELECT 1 FROM "UserAchievement"
        WHERE "userId" = v_user_id AND "achievementId" = p_achievement_id
    ) THEN
        RAISE EXCEPTION 'ALREADY_CLAIMED: Achievement % already claimed', p_achievement_id
            USING ERRCODE = 'S0001';
    END IF;

    -- 4. Canonical recomputation.
    v_lifetime_xp := CASE
        WHEN v_user.level <= 1 THEN v_user."currentXP"
        ELSE public.canonical_required_xp(v_user.level) + v_user."currentXP"
    END + v_xp;

    v_level := v_user.level;
    v_current_xp := v_user."currentXP" + v_xp;
    v_xp_threshold := public.canonical_xp_for_next_level(v_level);

    WHILE v_current_xp >= v_xp_threshold LOOP
        v_current_xp := v_current_xp - v_xp_threshold;
        v_level := v_level + 1;
        v_levels_gained := v_levels_gained + 1;
        v_xp_threshold := public.canonical_xp_for_next_level(v_level);
    END LOOP;

    v_rank := public.canonical_rank_display(v_level);
    v_rank_db := public.canonical_rank_db(v_level);
    v_did_rank_up := (v_rank <> v_user."hunterRank");

    -- Level-up stipend preserved from the legacy flow.
    IF v_levels_gained > 0 THEN
        v_level_up_sylph := v_level * 300;
    END IF;
    v_total_sylph := v_sylph + v_level_up_sylph;

    -- 5. Claim record (unique constraint is the race backstop; the
    --    User row lock serializes concurrent claims first).
    BEGIN
        INSERT INTO "UserAchievement" ("userId", "achievementId", "claimedAt")
        VALUES (v_user_id, p_achievement_id, NOW());
    EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'ALREADY_CLAIMED: Achievement % already claimed', p_achievement_id
            USING ERRCODE = 'S0001';
    END;

    -- 6. Atomic mutations.
    UPDATE "User"
    SET "currentXP" = v_current_xp,
        "xpToNextLevel" = v_xp_threshold,
        level = v_level,
        "hunterRank" = v_rank,
        sylph = sylph + v_total_sylph
    WHERE id = v_user_id;

    UPDATE "UserStats"
    SET xp = v_lifetime_xp,
        level = v_level,
        rank = v_rank_db,
        currency = currency + v_total_sylph,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "userId" = v_user_id;

    -- 7. Audit compliance ledgers.
    IF v_xp > 0 THEN
        INSERT INTO "XpLedger" ("userId", amount, "balanceAfter", reason, source, metadata, "createdAt")
        VALUES (v_user_id, v_xp, v_lifetime_xp, 'ACHIEVEMENT_CLAIM', 'ACHIEVEMENT',
                jsonb_build_object('achievementId', p_achievement_id), NOW());
    END IF;

    IF v_sylph > 0 THEN
        INSERT INTO "SylphLedger" ("userId", amount, delta, "balanceAfter", reason, source, metadata, "createdAt")
        VALUES (v_user_id, v_sylph, v_sylph, v_user.sylph + v_total_sylph,
                'ACHIEVEMENT_CLAIM: ' || COALESCE(p_title, p_achievement_id), 'ACHIEVEMENT',
                jsonb_build_object('achievementId', p_achievement_id), NOW());
    END IF;

    IF v_level_up_sylph > 0 THEN
        INSERT INTO "SylphLedger" ("userId", amount, delta, "balanceAfter", reason, source, metadata, "createdAt")
        VALUES (v_user_id, v_level_up_sylph, v_level_up_sylph, v_user.sylph + v_total_sylph,
                'ACHIEVEMENT_LEVEL_UP_STIPEND', 'LEVEL_UP',
                jsonb_build_object('achievementId', p_achievement_id), NOW());
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'achievementId', p_achievement_id,
        'xpGained', v_xp,
        'sylphGained', v_total_sylph,
        'level', v_level,
        'currentXP', v_current_xp,
        'xpToNextLevel', v_xp_threshold,
        'hunterRank', v_rank,
        'levelsGained', v_levels_gained,
        'didRankUp', v_did_rank_up
    );
END;
$$;

-- ─── 3. Canonicalized complete_study_session ─────────────────
-- The live function used the retired legacy curve (200 * L^1.2)
-- and legacy rank ladder, and locked User BEFORE StudySession
-- (lock-order inversion vs claim_session_reward_atomic).

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
    p_focus_rate INT DEFAULT 80
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
  v_actual_seconds INT;
  v_exact_minutes NUMERIC;
  v_streak_multiplier NUMERIC := 1.0;
  v_session_multiplier NUMERIC := 1.0;
  v_base_xp NUMERIC := 0;
  v_base_sylph NUMERIC := 0;
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
  -- StudySession → User → UserStats).
  IF v_session_id IS NOT NULL THEN
    PERFORM 1
    FROM public."StudySession"
    WHERE id = v_session_id AND "userId" = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Session not found: %', v_session_id;
    END IF;
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

  v_actual_seconds := COALESCE(p_duration_seconds, p_duration_minutes * 60);

  -- Upsert / Update StudySession
  IF v_session_id IS NOT NULL THEN
    UPDATE public."StudySession"
    SET "durationMinutes" = p_duration_minutes,
        "durationSeconds" = v_actual_seconds,
        "focusRate" = p_focus_rate,
        "endedAt" = NOW()
    WHERE id = v_session_id AND "userId" = p_user_id;
  ELSE
    INSERT INTO public."StudySession" (
      "userId", "questId", "subjectId", "durationMinutes", "durationSeconds", "focusRate", "startedAt", "endedAt"
    ) VALUES (
      p_user_id, p_quest_id, p_subject_id, p_duration_minutes, v_actual_seconds, p_focus_rate,
      NOW() - (v_actual_seconds || ' seconds')::INTERVAL, NOW()
    )
    RETURNING id INTO v_session_id;
  END IF;

  -- Calculate rewards if >= 60s
  v_level := v_user.level;
  v_current_xp := v_user."currentXP";
  v_xp_threshold := public.canonical_xp_for_next_level(v_level); -- canonical, never trust stored legacy value
  v_rank := v_user."hunterRank";
  v_previous_rank := v_user."hunterRank";

  IF v_actual_seconds >= 60 THEN
    v_exact_minutes := v_actual_seconds / 60.0;
    v_base_xp := v_exact_minutes * 1.5;
    v_base_sylph := v_exact_minutes + (FLOOR(v_exact_minutes / 30.0) * 10);

    -- Long session multiplier
    IF v_exact_minutes >= 120 THEN
      v_session_multiplier := 1.3;
    ELSIF v_exact_minutes >= 60 THEN
      v_session_multiplier := 1.2;
    ELSIF v_exact_minutes >= 30 THEN
      v_session_multiplier := 1.1;
    ELSE
      v_session_multiplier := 1.0;
    END IF;

    -- Streak multiplier
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

    v_xp_gained := FLOOR(v_base_xp * v_session_multiplier);
    v_final_sylph := FLOOR(v_base_sylph * v_streak_multiplier * v_session_multiplier);

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
  END IF;

  -- Level up stipend
  IF v_levels_gained > 0 THEN
    v_level_up_sylph := v_level * 300;
  END IF;
  v_total_sylph_earned := v_final_sylph + v_level_up_sylph;

  -- Update User record
  UPDATE public."User"
  SET "totalStudyMinutes" = "totalStudyMinutes" + p_duration_minutes,
      "totalStudySeconds" = "totalStudySeconds" + v_actual_seconds,
      level = v_level,
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

  -- Update quest elapsed time if linked
  IF p_quest_id IS NOT NULL THEN
    UPDATE public."Quest"
    SET "elapsedSeconds" = "elapsedSeconds" + v_actual_seconds
    WHERE id = p_quest_id AND "userId" = p_user_id;
  END IF;

  RETURN jsonb_build_object(
    'sessionId', v_session_id,
    'userId', p_user_id,
    'durationMinutes', p_duration_minutes,
    'durationSeconds', v_actual_seconds,
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
