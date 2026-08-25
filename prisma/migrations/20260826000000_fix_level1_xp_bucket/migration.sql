-- ============================================================
-- Level 1 XP bucket consistency fix (monotonic per-level curve)
-- ============================================================
-- PROBLEM: canonical_xp_for_next_level special-cased level 1 with a base
-- of 0 instead of canonical_required_xp(1) = 100. Result: level 1→2 cost
-- 282 XP while level 2→3 cost only 237 — the per-level increment was NOT
-- monotonic (first level harder than the second).
--
-- FIX: every level's bucket is now XP_req(L+1) − XP_req(L):
--   1→2 = 182, 2→3 = 237, 3→4 = 281, 4→5 = 318 …
-- Cumulative thresholds are UNCHANGED (level 2 still starts at 282 lifetime
-- XP), so levels, ranks and calculateLevelFromXp parity all hold.
--
-- Lifetime XP convention updated to match: for level 1, lifetime XP is now
-- 100 + currentXP (the 100 XP entry threshold is credited), removing the
-- CASE WHEN level <= 1 THEN currentXP special case from every writer.
-- Existing level-1 UserStats rows are backfilled +100 XP.

CREATE OR REPLACE FUNCTION public.canonical_xp_for_next_level(p_level INT)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT public.canonical_required_xp(GREATEST(1, p_level) + 1)
         - public.canonical_required_xp(GREATEST(1, p_level));
$$;

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
        "skillPoints" = "skillPoints" + 1,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "userId" = v_user_id;

    -- 7. Audit compliance ledgers.
    INSERT INTO "XpLedger" ("userId", amount, "balanceAfter", reason, source, metadata, "createdAt")
    VALUES (v_user_id, 5000, v_lifetime_xp, 'APEX_FORGE', 'SYSTEM',
            jsonb_build_object('subjectId', v_subject_id, 'nodeKey', p_node_key), NOW());

    INSERT INTO "SylphLedger" ("userId", amount, delta, "balanceAfter", reason, source, metadata, "createdAt")
    VALUES (v_user_id, 500, 500, v_new_sylph, 'APEX_FORGE', 'SYSTEM',
            jsonb_build_object('subjectId', v_subject_id, 'nodeKey', p_node_key), NOW());

    RETURN QUERY SELECT TRUE, FALSE, 5000, 500, 1,
        v_new_level, v_new_xp_within, v_new_rank, v_lifetime_xp, v_minted_sp;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_quest_reward(
    p_user_id INT,
    p_quest_id INT,
    p_user_local_date TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quest RECORD;
  v_user RECORD;
  v_today TEXT;
  v_is_late BOOLEAN := FALSE;
  v_is_early BOOLEAN := FALSE;
  v_penalty INT := 10;
  v_new_hp INT;
  v_final_xp INT;
  v_final_sylph INT;
  v_multiplier NUMERIC := 1.0;
  v_level INT;
  v_current_xp INT;
  v_xp_threshold INT;
  v_rank TEXT;
  v_previous_rank TEXT;
  v_levels_gained INT := 0;
  v_did_rank_up BOOLEAN := FALSE;
  v_level_up_sylph INT := 0;
  v_total_sylph_earned INT;
  v_hp_healed INT := 0;
  v_rank_up_text TEXT;
  v_early_bonus_text TEXT;
BEGIN
  -- Fetch & lock Quest
  SELECT * INTO v_quest
  FROM public."Quest"
  WHERE id = p_quest_id AND "userId" = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quest not found: %', p_quest_id;
  END IF;

  IF v_quest.status = 'COMPLETED' THEN
    RAISE EXCEPTION 'Quest already completed: %', p_quest_id;
  END IF;

  -- Fetch & lock User
  SELECT * INTO v_user
  FROM public."User"
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;

  v_today := COALESCE(p_user_local_date, TO_CHAR(NOW(), 'YYYY-MM-DD'));

  -- Check deadline
  IF v_quest."scheduledFor" IS NOT NULL AND v_quest."scheduledFor" <> '' THEN
    IF v_today > v_quest."scheduledFor" THEN
      v_is_late := TRUE;
    ELSIF v_today < v_quest."scheduledFor" THEN
      v_is_early := TRUE;
    END IF;
  END IF;

  -- If late, process as failed quest with penalty
  IF v_is_late THEN
    IF v_quest.difficulty = 'EASY' THEN v_penalty := 5;
    ELSIF v_quest.difficulty = 'NORMAL' THEN v_penalty := 10;
    ELSIF v_quest.difficulty = 'HARD' THEN v_penalty := 20;
    ELSIF v_quest.difficulty = 'EXPERT' THEN v_penalty := 40;
    END IF;

    IF v_quest."isGateKeyApplied" THEN v_penalty := v_penalty * 3; END IF;
    IF v_quest."isKamishWardActive" THEN v_penalty := 0; END IF;

    v_new_hp := GREATEST(0, v_user.hp - v_penalty);

    UPDATE public."Quest"
    SET status = 'FAILED'
    WHERE id = p_quest_id;

    UPDATE public."User"
    SET hp = v_new_hp
    WHERE id = p_user_id;

    IF v_penalty > 0 THEN
      INSERT INTO public."HpLedger" ("userId", amount, source, "createdAt")
      VALUES (p_user_id, -v_penalty, 'QUEST_FAILED_LATE', NOW());
    END IF;

    INSERT INTO public."SystemMessage" ("userId", content, type, read, "createdAt")
    VALUES (
      p_user_id,
      E'**Quest Failed (Late)**\n\n"' || v_quest.title || E'" was completed past its deadline of ' || v_quest."scheduledFor" || E'.\n\nPenalty: -' || v_penalty || E' HP',
      'WARNING',
      false,
      NOW()
    );

    RETURN jsonb_build_object(
      'success', true,
      'questId', p_quest_id,
      'status', 'FAILED',
      'penalty', jsonb_build_object('hpLost', v_penalty, 'currentHp', v_new_hp)
    );
  END IF;

  -- Calculate Rewards
  v_final_xp := v_quest."xpReward";
  v_final_sylph := v_quest."sylphReward";

  IF v_is_early THEN
    v_final_xp := FLOOR(v_final_xp * 1.2);
    v_final_sylph := FLOOR(v_final_sylph * 1.2);
  END IF;

  IF v_quest."isGateKeyApplied" THEN
    v_final_xp := v_final_xp * 2;
    v_final_sylph := v_final_sylph * 2;
  END IF;

  -- Streak multiplier
  IF v_user."streakDays" >= 8 THEN v_multiplier := 1.5;
  ELSIF v_user."streakDays" >= 4 THEN v_multiplier := 1.3;
  ELSIF v_user."streakDays" >= 2 THEN v_multiplier := 1.15;
  ELSIF v_user."streakDays" >= 1 THEN v_multiplier := 1.05;
  ELSE v_multiplier := 1.0;
  END IF;

  v_final_sylph := FLOOR(v_final_sylph * v_multiplier);

  -- Level up loop — CANONICAL curve (floor(100 * L^1.5)).
  -- The stored legacy threshold is ignored; it is always recomputed.
  v_level := v_user.level;
  v_current_xp := v_user."currentXP" + v_final_xp;
  v_xp_threshold := public.canonical_xp_for_next_level(v_level);
  v_previous_rank := v_user."hunterRank";

  WHILE v_current_xp >= v_xp_threshold LOOP
    v_current_xp := v_current_xp - v_xp_threshold;
    v_level := v_level + 1;
    v_levels_gained := v_levels_gained + 1;
    v_xp_threshold := public.canonical_xp_for_next_level(v_level);
  END LOOP;

  -- Canonical 8-tier rank ladder: 10/25/50/75/100/125/150
  v_rank := public.canonical_rank_display(v_level);
  v_did_rank_up := (v_rank <> v_previous_rank);

  IF v_levels_gained > 0 THEN
    v_level_up_sylph := v_level * 300;
  END IF;
  v_total_sylph_earned := v_final_sylph + v_level_up_sylph;

  -- HP restoration
  IF v_user.hp < v_user."maxHp" THEN
    v_hp_healed := LEAST(20, v_user."maxHp" - v_user.hp);
    v_new_hp := v_user.hp + v_hp_healed;
  ELSE
    v_new_hp := v_user.hp;
  END IF;

  -- Apply updates
  UPDATE public."Quest"
  SET status = 'COMPLETED',
      "completedAt" = NOW()
  WHERE id = p_quest_id;

  UPDATE public."User"
  SET level = v_level,
      "currentXP" = v_current_xp,
      "xpToNextLevel" = v_xp_threshold,
      "hunterRank" = v_rank,
      sylph = sylph + v_total_sylph_earned,
      hp = v_new_hp
  WHERE id = p_user_id;

  -- Mirror lifetime XP into UserStats (canonical cumulative store)
  -- Lifetime = XP accumulated below the current level + XP within it.
  INSERT INTO public."UserStats" ("userId", "level", "xp", "rank", "currency", "skillPoints",
      "endurance", "tenacity", "velocity", "discipline", "synthesis", "updatedAt")
  VALUES (p_user_id, v_level,
          public.canonical_required_xp(v_level) + v_current_xp,
          public.canonical_rank_db(v_level), v_total_sylph_earned, 0, 10, 10, 10, 10, 10, CURRENT_TIMESTAMP)
  ON CONFLICT ("userId") DO UPDATE SET
      xp = public.canonical_required_xp(v_level) + v_current_xp,
      level = EXCLUDED.level,
      rank = EXCLUDED.rank,
      currency = "UserStats".currency + v_total_sylph_earned,
      "updatedAt" = CURRENT_TIMESTAMP;

  -- Audit & Messages
  IF v_final_xp > 0 THEN
    INSERT INTO public."XpLedger" ("userId", amount, "balanceAfter", reason, source, metadata, "createdAt")
    VALUES (p_user_id, v_final_xp,
            public.canonical_required_xp(v_level) + v_current_xp,
            'QUEST_COMPLETE', 'QUEST', jsonb_build_object('questId', p_quest_id), NOW());
  END IF;

  IF v_final_sylph > 0 THEN
    INSERT INTO public."SylphLedger" ("userId", amount, source, "createdAt")
    VALUES (p_user_id, v_final_sylph, 'QUEST', NOW());
  END IF;

  IF v_level_up_sylph > 0 THEN
    INSERT INTO public."SylphLedger" ("userId", amount, source, "createdAt")
    VALUES (p_user_id, v_level_up_sylph, 'LEVEL_UP', NOW());
  END IF;

  IF v_hp_healed > 0 THEN
    INSERT INTO public."HpLedger" ("userId", amount, source, "createdAt")
    VALUES (p_user_id, v_hp_healed, 'QUEST_REWARD_HEAL', NOW());
  END IF;

  v_early_bonus_text := CASE WHEN v_is_early THEN E'\n(Includes 20% Early Completion Bonus!)' ELSE '' END;

  INSERT INTO public."SystemMessage" ("userId", content, type, read, "createdAt")
  VALUES (
    p_user_id,
    E'**Quest Complete**\n\n"' || v_quest.title || E'"\n\nRewards Obtained:\n• +' || v_final_xp || E' XP\n• +' || v_final_sylph || E' Sylph' || CASE WHEN v_multiplier > 1.0 THEN ' (Streak x' || v_multiplier || ')' ELSE '' END || v_early_bonus_text,
    'REWARD',
    false,
    NOW()
  );

  IF v_levels_gained > 0 THEN
    v_rank_up_text := CASE WHEN v_did_rank_up THEN E'\n\nRANK UP: ' || v_previous_rank || E'-Rank → ' || v_rank || E'-Rank' ELSE '' END;
    INSERT INTO public."SystemMessage" ("userId", content, type, read, "createdAt")
    VALUES (
      p_user_id,
      E'**Level Up**\n\nYou have reached Level ' || v_level || '.' || v_rank_up_text || E'\n\nStipend: +' || v_level_up_sylph || E' Sylph\n\nYou have grown stronger.',
      'LEVEL_UP',
      false,
      NOW()
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'questId', p_quest_id,
    'status', 'COMPLETED',
    'xpGained', v_final_xp,
    'sylphGained', v_final_sylph,
    'totalSylphEarned', v_total_sylph_earned,
    'hpHealed', v_hp_healed,
    'currentHp', v_new_hp,
    'level', v_level,
    'currentXP', v_current_xp,
    'xpToNextLevel', v_xp_threshold,
    'hunterRank', v_rank,
    'levelsGained', v_levels_gained,
    'didRankUp', v_did_rank_up
  );
END;
$$;

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
    VALUES (v_user_id, v_user.level, public.canonical_required_xp(v_user.level) + v_user."currentXP", 'RANK E', 0, 0, 10, 10, 10, 10, 10, CURRENT_TIMESTAMP)
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
    v_lifetime_xp := public.canonical_required_xp(v_user.level) + v_user."currentXP";
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
    VALUES (v_user_id, v_user.level, public.canonical_required_xp(v_user.level) + v_user."currentXP", 'RANK E', 0, 0, 10, 10, 10, 10, 10, CURRENT_TIMESTAMP)
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
    v_lifetime_xp := public.canonical_required_xp(v_user.level) + v_user."currentXP" + v_xp;

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


-- Backfill existing level-1 rows to the entry-threshold convention.
UPDATE "UserStats" SET xp = xp + 100, "updatedAt" = CURRENT_TIMESTAMP WHERE level <= 1;

-- Point level-1 users at the new bucket (self-heals via RPC on next flush anyway).
UPDATE "User" SET "xpToNextLevel" = 182 WHERE level <= 1;

-- New-user default matches the canonical level-1 bucket.
ALTER TABLE "User" ALTER COLUMN "xpToNextLevel" SET DEFAULT 182;
