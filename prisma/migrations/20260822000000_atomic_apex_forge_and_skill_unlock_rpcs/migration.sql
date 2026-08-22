-- ============================================================
-- Migration: Atomic Apex Forge & Skill Tree Unlock RPCs
--
-- 1. Canonical progression math (XP = floor(100 * L^1.5), 8-tier ranks)
--    exposed as shared SQL helpers used by every progression RPC.
-- 2. forge_apex_node_atomic   — idempotent, row-locked Apex Keystone
--    forge with audit ledgers (fixes the repeatable-reward exploit).
-- 3. unlock_skill_node_atomic — atomic, persisted skill node unlock
--    with prerequisite + SP validation (fixes unpersisted unlocks).
-- 4. claim_quest_reward       — redefined on the canonical curve
--    (it previously lived only in the live DB and used the retired
--    legacy 200 * L^1.2 curve and 6/13/21/31/46 rank ladder).
--
-- All functions are SECURITY DEFINER with SET search_path = public
-- and take explicit p_user_id parameters (server-authoritative; no
-- reliance on spoofable GUC JWT claims).
-- ============================================================

-- ─── Tables ──────────────────────────────────────────────────

-- XpLedger: audit trail for every XP mutation (mirrors SylphLedger).
CREATE TABLE IF NOT EXISTS "XpLedger" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "balanceAfter" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL DEFAULT '',
    "source" "LedgerSource" NOT NULL DEFAULT 'SYSTEM',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "XpLedger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "XpLedger_userId_createdAt_idx" ON "XpLedger"("userId", "createdAt" DESC);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'XpLedger_userId_fkey'
    ) THEN
        ALTER TABLE "XpLedger" ADD CONSTRAINT "XpLedger_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- UserSkillNode: durable unlock state for the 8-class cognitive skill tree.
CREATE TABLE IF NOT EXISTS "UserSkillNode" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "nodeKey" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSkillNode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserSkillNode_userId_nodeKey_key" ON "UserSkillNode"("userId", "nodeKey");
CREATE INDEX IF NOT EXISTS "UserSkillNode_userId_idx" ON "UserSkillNode"("userId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'UserSkillNode_userId_fkey'
    ) THEN
        ALTER TABLE "UserSkillNode" ADD CONSTRAINT "UserSkillNode_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- ─── Canonical Math Helpers (single SQL source of truth) ─────

-- XP required to REACH level L (cumulative): floor(100 * L^1.5).
CREATE OR REPLACE FUNCTION public.canonical_required_xp(p_level INT)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE WHEN p_level <= 1 THEN 100
                ELSE FLOOR(100 * POWER(p_level::FLOAT, 1.5))::INT END;
$$;

-- Level derived from lifetime XP: L = floor((XP / 100)^(2/3)) with
-- discrete boundary guards — exact parity with lib/game-engine.ts.
CREATE OR REPLACE FUNCTION public.canonical_level_from_xp(p_total_xp INT)
RETURNS INT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_level INT;
BEGIN
    IF p_total_xp < 282 THEN
        RETURN 1;
    END IF;

    v_level := GREATEST(1, FLOOR(POWER(p_total_xp::FLOAT / 100.0, 2.0 / 3.0))::INT);

    WHILE public.canonical_required_xp(v_level + 1) <= p_total_xp LOOP
        v_level := v_level + 1;
    END LOOP;

    WHILE v_level > 1 AND public.canonical_required_xp(v_level) > p_total_xp LOOP
        v_level := v_level - 1;
    END LOOP;

    RETURN v_level;
END;
$$;

-- XP bucket size needed to advance FROM level L TO level L + 1
-- (the "xpToNextLevel" value stored on User rows).
CREATE OR REPLACE FUNCTION public.canonical_xp_for_next_level(p_level INT)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT public.canonical_required_xp(GREATEST(1, p_level) + 1)
         - CASE WHEN p_level <= 1 THEN 0
                ELSE public.canonical_required_xp(GREATEST(1, p_level)) END;
$$;

-- DB-facing rank token ('RANK E' ... 'MONARCH') for UserStats.rank.
CREATE OR REPLACE FUNCTION public.canonical_rank_db(p_level INT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN p_level >= 150 THEN 'MONARCH'
        WHEN p_level >= 125 THEN 'NATIONAL'
        WHEN p_level >= 100 THEN 'RANK S'
        WHEN p_level >= 75  THEN 'RANK A'
        WHEN p_level >= 50  THEN 'RANK B'
        WHEN p_level >= 25  THEN 'RANK C'
        WHEN p_level >= 10  THEN 'RANK D'
        ELSE 'RANK E'
    END;
$$;

-- UI-facing rank token ('E' ... 'S', 'NATIONAL', 'MONARCH') for User.hunterRank.
CREATE OR REPLACE FUNCTION public.canonical_rank_display(p_level INT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN p_level >= 150 THEN 'MONARCH'
        WHEN p_level >= 125 THEN 'NATIONAL'
        WHEN p_level >= 100 THEN 'S'
        WHEN p_level >= 75  THEN 'A'
        WHEN p_level >= 50  THEN 'B'
        WHEN p_level >= 25  THEN 'C'
        WHEN p_level >= 10  THEN 'D'
        ELSE 'E'
    END;
$$;

-- ─── 1. Atomic Apex Forge ────────────────────────────────────

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
    v_lifetime_xp := CASE
        WHEN v_user.level <= 1 THEN v_user."currentXP"
        ELSE public.canonical_required_xp(v_user.level) + v_user."currentXP"
    END + 5000;

    v_new_level     := public.canonical_level_from_xp(v_lifetime_xp);
    v_new_xp_within := v_lifetime_xp - CASE
        WHEN v_new_level <= 1 THEN 0
        ELSE public.canonical_required_xp(v_new_level)
    END;
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

-- ─── 2. Atomic Skill Node Unlock ─────────────────────────────

CREATE OR REPLACE FUNCTION public.unlock_skill_node_atomic(
    p_user_id TEXT,
    p_node_key TEXT,
    p_sp_cost INT,
    p_required_prereqs TEXT[]
)
RETURNS TABLE (
    success BOOLEAN,
    remaining_sp INT,
    unlocked_node_key TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id INT;
    v_sp INT;
    v_unlocked_count INT;
    v_prereq_count INT;
BEGIN
    -- 1. Validate inputs.
    IF p_user_id IS NULL OR p_user_id !~ '^[0-9]+$' THEN
        RAISE EXCEPTION 'Invalid user id' USING ERRCODE = '22023';
    END IF;
    IF p_node_key IS NULL OR LENGTH(TRIM(p_node_key)) = 0 THEN
        RAISE EXCEPTION 'Invalid node key' USING ERRCODE = '22023';
    END IF;
    IF p_sp_cost IS NULL OR p_sp_cost < 0 THEN
        RAISE EXCEPTION 'Invalid SP cost' USING ERRCODE = '22023';
    END IF;
    v_user_id := p_user_id::INT;

    -- 2. Resilient UserStats initialization + row lock.
    INSERT INTO "UserStats" ("userId", "level", "xp", "rank", "currency", "skillPoints",
        "endurance", "tenacity", "velocity", "discipline", "synthesis", "updatedAt")
    VALUES (v_user_id, 1, 0, 'RANK E', 0, 0, 10, 10, 10, 10, 10, CURRENT_TIMESTAMP)
    ON CONFLICT ("userId") DO NOTHING;

    SELECT "skillPoints" INTO v_sp
    FROM "UserStats"
    WHERE "userId" = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'UserStats record not found for user %', v_user_id;
    END IF;

    -- 3. Already-unlocked guard (idempotency).
    IF EXISTS (
        SELECT 1 FROM "UserSkillNode"
        WHERE "userId" = v_user_id AND "nodeKey" = p_node_key
    ) THEN
        RAISE EXCEPTION 'ALREADY_UNLOCKED: Skill node % already unlocked', p_node_key
            USING ERRCODE = 'A0003';
    END IF;

    -- 4. Prerequisite validation — ALL parent keys must be unlocked.
    IF p_required_prereqs IS NOT NULL AND cardinality(p_required_prereqs) > 0 THEN
        v_prereq_count := cardinality(p_required_prereqs);

        SELECT COUNT(*) INTO v_unlocked_count
        FROM "UserSkillNode"
        WHERE "userId" = v_user_id AND "nodeKey" = ANY(p_required_prereqs);

        IF v_unlocked_count < v_prereq_count THEN
            RAISE EXCEPTION 'PREREQUISITES_UNMET: % of % prerequisite nodes missing',
                v_prereq_count - v_unlocked_count, v_prereq_count
                USING ERRCODE = 'A0004';
        END IF;
    END IF;

    -- 5. SP balance validation.
    IF v_sp < p_sp_cost THEN
        RAISE EXCEPTION 'INSUFFICIENT_SKILL_POINTS: Required %, Available %', p_sp_cost, v_sp
            USING ERRCODE = 'A0005';
    END IF;

    -- 6. Atomic deduction + durable persistence.
    UPDATE "UserStats"
    SET "skillPoints" = "skillPoints" - p_sp_cost,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "userId" = v_user_id;

    INSERT INTO "UserSkillNode" ("userId", "nodeKey", "unlockedAt")
    VALUES (v_user_id, p_node_key, NOW());

    RETURN QUERY SELECT TRUE, v_sp - p_sp_cost, p_node_key;
END;
$$;

-- ─── 3. Canonicalized claim_quest_reward ─────────────────────
-- Previously existed ONLY in the live database (never in a migration)
-- and used the retired legacy math. Re-created here so fresh databases
-- get it too, and existing deployments are upgraded in place.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'claim_quest_reward'
    ) THEN
        DROP FUNCTION public.claim_quest_reward(integer, integer, text);
    END IF;
END $$;

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
          CASE WHEN v_level <= 1 THEN v_current_xp
               ELSE public.canonical_required_xp(v_level) + v_current_xp END,
          public.canonical_rank_db(v_level), v_total_sylph_earned, 0, 10, 10, 10, 10, 10, CURRENT_TIMESTAMP)
  ON CONFLICT ("userId") DO UPDATE SET
      xp = CASE WHEN "UserStats".level <= 1 THEN v_current_xp
                ELSE public.canonical_required_xp(v_level) + v_current_xp END,
      level = EXCLUDED.level,
      rank = EXCLUDED.rank,
      currency = "UserStats".currency + v_total_sylph_earned,
      "updatedAt" = CURRENT_TIMESTAMP;

  -- Audit & Messages
  IF v_final_xp > 0 THEN
    INSERT INTO public."XpLedger" ("userId", amount, "balanceAfter", reason, source, metadata, "createdAt")
    VALUES (p_user_id, v_final_xp,
            CASE WHEN v_level <= 1 THEN v_current_xp
                 ELSE public.canonical_required_xp(v_level) + v_current_xp END,
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
