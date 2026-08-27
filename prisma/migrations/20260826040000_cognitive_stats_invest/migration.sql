-- ============================================================
-- Cognitive Stats — investment ledger & ability effects (RPC parity)
-- ============================================================
-- Adds the StatInvestLedger audit table and wires two ability effects
-- into the canonical RPCs:
--   • VELOCITY (Flow State): +2% session XP per ability tier in
--     complete_study_session.
--   • SYNTHESIS (Insight): +1 bonus SP at tier 4+ in forge_apex_node_atomic.
-- The other three effects (Endurance HP, Tenacity streak target,
-- Discipline chat quota, Synthesis mastery %) are computed in
-- lib/cognitive-stats.ts and applied in their TypeScript services.

CREATE TABLE "StatInvestLedger" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "statKey" TEXT NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "currencyUsed" TEXT NOT NULL,
    "cost" INTEGER NOT NULL DEFAULT 0,
    "statValueAfter" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StatInvestLedger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StatInvestLedger_userId_createdAt_idx" ON "StatInvestLedger"("userId", "createdAt" DESC);
CREATE INDEX "StatInvestLedger_statKey_idx" ON "StatInvestLedger"("statKey");

ALTER TABLE "StatInvestLedger" ADD CONSTRAINT "StatInvestLedger_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION public.forge_apex_node_atomic(
    p_user_id TEXT,
    p_subject_id TEXT,
    p_node_key TEXT
)
RETURNS TABLE (
    success BOOLEAN,
    already_forged BOOLEAN,
    xp_awarded INT,
    sylph_awarded INT,
    sp_awarded INT,
    new_level INT,
    new_xp_within_level INT,
    new_rank TEXT,
    new_total_xp INT,
    minted_sp INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id INT;
    v_subject_id INT;
    v_user RECORD;
    v_node_mastered BOOLEAN;
    v_minted_sp INT := 0;
    v_lifetime_xp INT;
    v_new_level INT;
    v_new_xp_within INT;
    v_new_next INT;
    v_new_rank TEXT;
    v_new_rank_db TEXT;
    v_synthesis INT;
    v_apex_extra_sp INT := 0;
    v_new_sylph INT;
BEGIN
    -- 1. Strict parameter validation (TEXT ids cast only after shape check)
    IF p_user_id IS NULL OR p_user_id !~ '^[0-9]+$' THEN
        RAISE EXCEPTION 'Invalid user id' USING ERRCODE = '22023';
    END IF;
    IF p_subject_id IS NULL OR p_subject_id !~ '^[0-9]+$' THEN
        RAISE EXCEPTION 'Invalid subject id' USING ERRCODE = '22023';
    END IF;
    IF p_node_key IS NULL OR p_node_key <> 'N10_1' THEN
        RAISE EXCEPTION 'Only the N10_1 Apex Keystone can be forged'
            USING ERRCODE = '22023';
    END IF;
    v_user_id := p_user_id::INT;
    v_subject_id := p_subject_id::INT;

    -- 2. Acquire row locks in a fixed order: User → UserStats → SubjectNode
    --    (consistent ordering prevents deadlocks with other RPCs).
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

    SELECT "isMastered" INTO v_node_mastered
    FROM "SubjectNode"
    WHERE "subjectId" = v_subject_id AND "nodeId" = p_node_key
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Subject node % not found for subject %', p_node_key, v_subject_id;
    END IF;

    -- 3. Idempotency guard — the mastery flag is the claim anchor.
    IF v_node_mastered THEN
        RAISE EXCEPTION 'ALREADY_FORGED: Apex node % for subject % has already been forged',
            p_node_key, v_subject_id
            USING ERRCODE = 'A0001';
    END IF;

    -- 4. Validate subject mastery requirement: >= 115 minted Subject SP
    --    (sum of spAward across all mastered nodes except the apex itself).
    SELECT COALESCE(SUM("spAward"), 0) INTO v_minted_sp
    FROM "SubjectNode"
    WHERE "subjectId" = v_subject_id
      AND "nodeId" <> 'N10_1'
      AND ("isMastered" OR "progress" >= 100);

    IF v_minted_sp < 115 THEN
        RAISE EXCEPTION 'INSUFFICIENT_SP: Requires 115 Subject SP, current %', v_minted_sp
            USING ERRCODE = 'A0002';
    END IF;

    -- 5. Canonical recomputation of lifetime XP, level, rank, next-level XP.
    v_lifetime_xp := public.canonical_required_xp(v_user.level) + v_user."currentXP" + 5000;

    v_new_level     := public.canonical_level_from_xp(v_lifetime_xp);
    v_new_xp_within := v_lifetime_xp - public.canonical_required_xp(v_new_level);
    v_new_next    := public.canonical_xp_for_next_level(v_new_level);
    v_new_rank    := public.canonical_rank_display(v_new_level);
    v_new_rank_db := public.canonical_rank_db(v_new_level);
    v_new_sylph   := v_user.sylph + 500;

    -- Synthesis (Insight): ability tier 4+ grants +1 bonus SP on Apex forge.
    v_synthesis := 10;
    SELECT COALESCE("synthesis", 10) INTO v_synthesis
    FROM public."UserStats" WHERE "userId" = v_user_id;
    v_apex_extra_sp := CASE WHEN v_synthesis >= 80 THEN 1 ELSE 0 END;

    -- 6. Atomic mutations.
    UPDATE "SubjectNode"
    SET progress = 100.0,
        "isMastered" = TRUE,
        "masteredAt" = NOW(),
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "subjectId" = v_subject_id AND "nodeId" = p_node_key;

    UPDATE "User"
    SET "currentXP" = v_new_xp_within,
        "xpToNextLevel" = v_new_next,
        level = v_new_level,
        "hunterRank" = v_new_rank,
        sylph = v_new_sylph
    WHERE id = v_user_id;

    UPDATE "UserStats"
    SET xp = v_lifetime_xp,
        level = v_new_level,
        rank = v_new_rank_db,
        currency = currency + 500,
        "skillPoints" = "skillPoints" + 1 + v_apex_extra_sp,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "userId" = v_user_id;

    -- 7. Audit compliance ledgers.
    INSERT INTO "XpLedger" ("userId", amount, "balanceAfter", reason, source, metadata, "createdAt")
    VALUES (v_user_id, 5000, v_lifetime_xp, 'APEX_FORGE', 'SYSTEM',
            jsonb_build_object('subjectId', v_subject_id, 'nodeKey', p_node_key), NOW());

    INSERT INTO "SylphLedger" ("userId", amount, delta, "balanceAfter", reason, source, metadata, "createdAt")
    VALUES (v_user_id, 500, 500, v_new_sylph, 'APEX_FORGE', 'SYSTEM',
            jsonb_build_object('subjectId', v_subject_id, 'nodeKey', p_node_key), NOW());

    RETURN QUERY SELECT TRUE, FALSE, 5000, 500, 1 + v_apex_extra_sp,
        v_new_level, v_new_xp_within, v_new_rank, v_lifetime_xp, v_minted_sp;
END;
$$;
CREATE OR REPLACE FUNCTION public.complete_study_session(
    p_user_id INT,
    p_session_id INT DEFAULT NULL,
    p_duration_minutes INT DEFAULT 0,
    p_duration_seconds INT DEFAULT 0,
    p_quest_id INT DEFAULT NULL,
    p_subject_id INT DEFAULT NULL,
    p_break_seconds INT DEFAULT 0,
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
  v_break_seconds INT;
  v_focus_rate_actual INT;
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
  v_velocity INT;
  v_velocity_tier INT := 0;
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
  v_break_seconds := GREATEST(0, COALESCE(p_break_seconds, 0));

  -- focusRate = share of ACTIVE session time that was focus (never 0/0 → 80).
  IF (v_actual_seconds + v_break_seconds) > 0 THEN
    v_focus_rate_actual := ROUND(100.0 * v_actual_seconds / (v_actual_seconds + v_break_seconds));
  ELSE
    v_focus_rate_actual := 80;
  END IF;

  -- EXACT PARITY: only the new portion since the last credit counts.
  v_delta_seconds := GREATEST(0, v_actual_seconds - v_previous_seconds);

  -- Session row is SET to the exact cumulative duration (never +=).
  IF v_session_id IS NOT NULL THEN
    UPDATE public."StudySession"
    SET "durationMinutes" = FLOOR(v_actual_seconds / 60.0),
        "durationSeconds" = v_actual_seconds,
        "breakSeconds" = v_break_seconds,
        "focusRate" = v_focus_rate_actual,
        "endedAt" = NOW()
    WHERE id = v_session_id AND "userId" = p_user_id;
  ELSE
    v_was_insert := TRUE;
    INSERT INTO public."StudySession" (
      "userId", "questId", "subjectId", "durationMinutes", "durationSeconds", "breakSeconds", "focusRate", "startedAt", "endedAt"
    ) VALUES (
      p_user_id, p_quest_id, p_subject_id,
      FLOOR(v_actual_seconds / 60.0), v_actual_seconds, v_break_seconds, v_focus_rate_actual,
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
    -- Velocity (Flow State): +2% session XP per ability tier.
    v_velocity := 10;
    SELECT COALESCE("velocity", 10) INTO v_velocity
    FROM public."UserStats" WHERE "userId" = p_user_id;
    v_velocity_tier := CASE
        WHEN v_velocity >= 100 THEN 6
        WHEN v_velocity >= 80  THEN 5
        WHEN v_velocity >= 65  THEN 4
        WHEN v_velocity >= 50  THEN 3
        WHEN v_velocity >= 35  THEN 2
        WHEN v_velocity >= 20  THEN 1
        ELSE 0
    END;

    v_xp_gained := FLOOR(5 * v_minutes * v_session_multiplier);
    v_xp_gained := FLOOR(v_xp_gained * (1.0 + 0.02 * v_velocity_tier));
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
    v_lifetime_xp := public.canonical_required_xp(v_level) + v_current_xp;
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
    'breakSeconds', v_break_seconds,
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
