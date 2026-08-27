-- ============================================================
-- Fix synthesis apex threshold: tier 4 unlocks at value 65
-- (matches lib/cognitive-stats.ts — the previous version used 80/tier 5).
-- ============================================================

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
    v_apex_extra_sp := CASE WHEN v_synthesis >= 65 THEN 1 ELSE 0 END;

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
