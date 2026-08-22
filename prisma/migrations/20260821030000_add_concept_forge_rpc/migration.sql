-- Migration: 20260821030000_add_concept_forge_rpc
-- Description: Adds atomic commit_forge_progress stored procedure with rank/level recalculation and idempotent mastery claim

CREATE OR REPLACE FUNCTION public.commit_forge_progress(
    p_topic_key TEXT,
    p_difficulty INT,
    p_session_minutes INT
)
RETURNS TABLE (
    success BOOLEAN,
    topic_progress INT,
    topic_completed BOOLEAN,
    core_completed BOOLEAN,
    awarded_xp INT,
    awarded_sylph INT,
    awarded_sp INT,
    unlocked_pedestal TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id INT;
    v_topic_id INT;
    v_core_id INT;
    v_target_progress INT;
    v_weight FLOAT;
    v_delta INT;
    v_new_progress INT;
    v_topic_completed BOOLEAN := FALSE;
    v_core_completed BOOLEAN := FALSE;
    v_incomplete_count INT;
    v_mastery_inserted_id INT := NULL;
    v_reward_xp INT := 0;
    v_reward_sylph INT := 0;
    v_reward_sp INT := 0;
    v_reward_pedestal TEXT := NULL;
    v_core_record RECORD;

    -- Leveling & Progression Variables
    v_old_xp INT;
    v_old_level INT;
    v_old_currency INT;
    v_old_sp INT;
    v_new_xp INT;
    v_new_level INT;
    v_new_rank TEXT;
    v_level_diff INT := 0;
    v_total_sp_awarded INT := 0;
BEGIN
    -- 1. Scalar JWT Integer Auth Extraction
    v_user_id := (SELECT COALESCE(
        ((auth.jwt() ->> 'userId'::text))::integer,
        (NULLIF(current_setting('request.jwt.claim.userId', true), ''))::integer,
        0
    ));
    IF v_user_id = 0 THEN
        RAISE EXCEPTION 'Unauthorized: Invalid session context';
    END IF;

    -- 2. Fetch Topic & Parent Core Configuration
    SELECT id, "forgeCoreId", "targetProgress", "structuralWeight"
    INTO v_topic_id, v_core_id, v_target_progress, v_weight
    FROM "ForgeTopic"
    WHERE "topicKey" = p_topic_key;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Forge topic not found: %', p_topic_key;
    END IF;

    -- 3. Calculate Deterministic Progress Delta
    -- Delta = (Difficulty * 5 + floor(Minutes / 15)) * Weight (Clamped between 1 and 40)
    v_delta := GREATEST(1, LEAST(40, FLOOR((GREATEST(1, LEAST(5, p_difficulty)) * 5 + FLOOR(p_session_minutes / 15)) * v_weight))::INT);

    -- 4. Upsert UserForgeProgress
    INSERT INTO "UserForgeProgress" ("userId", "forgeTopicId", progress, "updatedAt")
    VALUES (v_user_id, v_topic_id, v_delta, NOW())
    ON CONFLICT ("userId", "forgeTopicId")
    DO UPDATE SET 
        progress = LEAST(v_target_progress, "UserForgeProgress".progress + v_delta),
        "updatedAt" = NOW()
    RETURNING progress INTO v_new_progress;

    -- Check Topic Completion
    IF v_new_progress >= v_target_progress THEN
        v_topic_completed := TRUE;
        UPDATE "UserForgeProgress"
        SET "completedAt" = COALESCE("completedAt", NOW())
        WHERE "userId" = v_user_id AND "forgeTopicId" = v_topic_id;
    END IF;

    -- 5. Check Complete Core Completion Status
    SELECT COUNT(*)
    INTO v_incomplete_count
    FROM "ForgeTopic" ft
    LEFT JOIN "UserForgeProgress" ufp 
        ON ufp."forgeTopicId" = ft.id AND ufp."userId" = v_user_id
    WHERE ft."forgeCoreId" = v_core_id 
      AND (ufp.progress IS NULL OR ufp.progress < ft."targetProgress");

    -- 6. If all topics for this core are 100% completed, attempt idempotent mastery claim
    IF v_incomplete_count = 0 THEN
        INSERT INTO "UserForgeCoreMastery" ("userId", "forgeCoreId", "completedAt", "prestigeTier")
        VALUES (v_user_id, v_core_id, NOW(), 1)
        ON CONFLICT ("userId", "forgeCoreId") DO NOTHING
        RETURNING id INTO v_mastery_inserted_id;

        -- Only execute reward payouts if this was a newly claimed mastery
        IF v_mastery_inserted_id IS NOT NULL THEN
            v_core_completed := TRUE;

            SELECT "rewardXp", "rewardSylph", "rewardSp", "rewardPedestalKey"
            INTO v_core_record
            FROM "ForgeCore"
            WHERE id = v_core_id;

            v_reward_xp := v_core_record."rewardXp";
            v_reward_sylph := v_core_record."rewardSylph";
            v_reward_sp := v_core_record."rewardSp";
            v_reward_pedestal := v_core_record."rewardPedestalKey";

            -- Auto-initialize UserStats if absent
            INSERT INTO "UserStats" ("userId", "updatedAt") 
            VALUES (v_user_id, CURRENT_TIMESTAMP) 
            ON CONFLICT ("userId") DO NOTHING;

            -- Lock UserStats FOR UPDATE
            SELECT xp, level, currency, "skillPoints"
            INTO v_old_xp, v_old_level, v_old_currency, v_old_sp
            FROM "UserStats"
            WHERE "userId" = v_user_id
            FOR UPDATE;

            v_new_xp := v_old_xp + v_reward_xp;

            -- Deterministic Level Recalculation
            IF v_new_xp < 282 THEN
                v_new_level := 1;
            ELSE
                v_new_level := GREATEST(1, FLOOR(POW(v_new_xp / 100.0, 2.0 / 3.0))::INT);
                WHILE FLOOR(100.0 * POW((v_new_level + 1)::FLOAT, 1.5)) <= v_new_xp LOOP
                    v_new_level := v_new_level + 1;
                END LOOP;
                WHILE v_new_level > 1 AND FLOOR(100.0 * POW(v_new_level::FLOAT, 1.5)) > v_new_xp LOOP
                    v_new_level := v_new_level - 1;
                END LOOP;
            END IF;

            v_level_diff := GREATEST(0, v_new_level - v_old_level);
            v_total_sp_awarded := v_reward_sp + v_level_diff;

            -- Rank Recalculation
            IF v_new_level >= 150 THEN
                v_new_rank := 'MONARCH';
            ELSIF v_new_level >= 125 THEN
                v_new_rank := 'NATIONAL';
            ELSIF v_new_level >= 100 THEN
                v_new_rank := 'RANK S';
            ELSIF v_new_level >= 75 THEN
                v_new_rank := 'RANK A';
            ELSIF v_new_level >= 50 THEN
                v_new_rank := 'RANK B';
            ELSIF v_new_level >= 25 THEN
                v_new_rank := 'RANK C';
            ELSIF v_new_level >= 10 THEN
                v_new_rank := 'RANK D';
            ELSE
                v_new_rank := 'RANK E';
            END IF;

            -- Atomic Commit to UserStats
            UPDATE "UserStats"
            SET xp = v_new_xp,
                level = v_new_level,
                rank = v_new_rank,
                currency = currency + v_reward_sylph,
                "skillPoints" = "skillPoints" + v_total_sp_awarded,
                "updatedAt" = CURRENT_TIMESTAMP
            WHERE "userId" = v_user_id;

            -- Record Sylph Ledger Entry
            INSERT INTO "SylphLedger" ("userId", delta, "balanceAfter", reason, metadata)
            SELECT 
                v_user_id, 
                v_reward_sylph, 
                currency, 
                'FORGE_CORE_MASTERY', 
                jsonb_build_object('coreId', v_core_id, 'coreKey', (SELECT "coreKey" FROM "ForgeCore" WHERE id = v_core_id))
            FROM "UserStats"
            WHERE "userId" = v_user_id;
        END IF;
    END IF;

    RETURN QUERY SELECT 
        TRUE, 
        v_new_progress, 
        v_topic_completed, 
        v_core_completed, 
        v_reward_xp, 
        v_reward_sylph, 
        v_total_sp_awarded, 
        v_reward_pedestal;
END;
$$;
