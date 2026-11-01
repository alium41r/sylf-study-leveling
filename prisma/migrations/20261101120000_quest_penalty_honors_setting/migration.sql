-- A person who turned the HP penalty off should lose nothing for finishing a quest late. The late path applied it regardless, and this is the one
-- change to the function. Everything else is the effective definition from 20261002000000_planner_v2_durable_core, unchanged. Additive and idempotent.
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
  v_level_up_sp INT := 0;
  v_rank_up_sp INT := 0;
  v_total_sylph_earned INT;
  v_hp_healed INT := 0;
  v_rank_up_text TEXT;
  v_early_bonus_text TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(73641,p_user_id);
  IF EXISTS (SELECT 1 FROM "Quest" WHERE id=p_quest_id AND "userId"=p_user_id AND "plannedMinutes" IS NOT NULL)
    AND current_setting('sylf.planner_v2_execution_quest',true) IS DISTINCT FROM p_quest_id::text THEN
    RAISE EXCEPTION 'PLANNER_EXECUTION_PROTOCOL_REQUIRED' USING ERRCODE='23514'; END IF;
  IF EXISTS (SELECT 1 FROM "Quest" WHERE id=p_quest_id AND "remainingDisposition"='WITHDRAWN') THEN
    RAISE EXCEPTION 'PLANNER_WITHDRAWN_COMPLETION_FORBIDDEN' USING ERRCODE='23514'; END IF;
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
    IF v_quest."isKamishWardActive" OR v_user."enableHpPenalty" IS FALSE THEN v_penalty := 0; END IF;

    v_new_hp := GREATEST(0, v_user.hp - v_penalty);

    UPDATE public."Quest"
    SET status = 'FAILED', "executionVersion"=CASE WHEN "plannedMinutes" IS NULL THEN "executionVersion" ELSE "executionVersion"+1 END
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

  -- SP stipend: +2 SP per level gained, +5 SP per rank up.
  v_level_up_sp := v_levels_gained * 2;
  v_rank_up_sp := CASE WHEN v_did_rank_up THEN 5 ELSE 0 END;
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
  SET "executionVersion" = CASE WHEN "plannedMinutes" IS NULL THEN "executionVersion" ELSE "executionVersion"+1 END,
              "remainingDisposition" = CASE WHEN "plannedMinutes" IS NULL THEN "remainingDisposition" ELSE 'COMPLETED' END,
              "remainingMinutesEstimate" = CASE WHEN "plannedMinutes" IS NULL THEN "remainingMinutesEstimate" ELSE 0 END,
              status = 'COMPLETED',
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
          public.canonical_rank_db(v_level), v_total_sylph_earned, v_level_up_sp + v_rank_up_sp, 10, 10, 10, 10, 10, CURRENT_TIMESTAMP)
  ON CONFLICT ("userId") DO UPDATE SET
      xp = public.canonical_required_xp(v_level) + v_current_xp,
      level = EXCLUDED.level,
      rank = EXCLUDED.rank,
      currency = "UserStats".currency + v_total_sylph_earned,
      "skillPoints" = "UserStats"."skillPoints" + v_level_up_sp + v_rank_up_sp,
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
      E'**Level Up**\n\nYou have reached Level ' || v_level || '.' || v_rank_up_text || E'\n\nStipend: +' || v_level_up_sylph || E' Sylph • +' || (v_level_up_sp + v_rank_up_sp) || E' SP\n\nYou have grown stronger.',
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
