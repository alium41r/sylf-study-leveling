-- Migration: 20260821020000_add_skill_tree_rpc
-- Description: Adds atomic unlock_skill_node stored procedure with prerequisite and stat gating

CREATE OR REPLACE FUNCTION public.unlock_skill_node(p_skill_node_id INT)
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
    v_stat_value INT;
    v_node_key TEXT;
    v_cost_sp INT;
    v_req_stat TEXT;
    v_req_value INT;
    v_prereq_key TEXT;
    v_parent_node_id INT;
    v_parent_unlocked BOOLEAN;
BEGIN
    -- 1. Scalar JWT Integer User ID Extraction
    v_user_id := (SELECT COALESCE(
        ((auth.jwt() ->> 'userId'::text))::integer,
        (NULLIF(current_setting('request.jwt.claim.userId', true), ''))::integer,
        0
    ));
    IF v_user_id = 0 THEN
        RAISE EXCEPTION 'Unauthorized: Invalid session context';
    END IF;

    -- 2. Fetch Target Node Data
    SELECT "nodeKey", "costSp", "prerequisiteStat", "prerequisiteValue", "prerequisiteNodeKey"
    INTO v_node_key, v_cost_sp, v_req_stat, v_req_value, v_prereq_key
    FROM "SkillNode"
    WHERE id = p_skill_node_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Skill node not found';
    END IF;

    -- 3. Check if Already Unlocked
    IF EXISTS (
        SELECT 1 FROM "UserSkill" 
        WHERE "userId" = v_user_id AND "skillNodeId" = p_skill_node_id
    ) THEN
        RAISE EXCEPTION 'Skill node already unlocked';
    END IF;

    -- 4. Verify Parent Node Prerequisite (if defined)
    IF v_prereq_key IS NOT NULL AND v_prereq_key <> '' THEN
        SELECT id INTO v_parent_node_id FROM "SkillNode" WHERE "nodeKey" = v_prereq_key;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Parent prerequisite node configuration error: %', v_prereq_key;
        END IF;

        SELECT EXISTS (
            SELECT 1 FROM "UserSkill" 
            WHERE "userId" = v_user_id AND "skillNodeId" = v_parent_node_id
        ) INTO v_parent_unlocked;

        IF NOT v_parent_unlocked THEN
            RAISE EXCEPTION 'Prerequisite skill node not unlocked: %', v_prereq_key;
        END IF;
    END IF;

    -- 5. Lock UserStats and Verify Stat Gate & SP
    -- Auto-initialize UserStats if absent
    INSERT INTO "UserStats" ("userId", "updatedAt") VALUES (v_user_id, CURRENT_TIMESTAMP) ON CONFLICT ("userId") DO NOTHING;

    SELECT "skillPoints",
           CASE LOWER(v_req_stat)
               WHEN 'endurance' THEN endurance
               WHEN 'tenacity' THEN tenacity
               WHEN 'velocity' THEN velocity
               WHEN 'discipline' THEN discipline
               WHEN 'synthesis' THEN synthesis
               ELSE 0
           END
    INTO v_sp, v_stat_value
    FROM "UserStats"
    WHERE "userId" = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'UserStats record not found';
    END IF;

    IF v_sp < v_cost_sp THEN
        RAISE EXCEPTION 'Insufficient Skill Points (Required: %, Available: %)', v_cost_sp, v_sp;
    END IF;

    IF v_stat_value < v_req_value THEN
        RAISE EXCEPTION 'Cognitive stat requirement not met for % (Required: %, Current: %)', 
            v_req_stat, v_req_value, v_stat_value;
    END IF;

    -- 6. Atomic Deduction & Commit
    UPDATE "UserStats"
    SET "skillPoints" = "skillPoints" - v_cost_sp,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "userId" = v_user_id;

    INSERT INTO "UserSkill" ("userId", "skillNodeId")
    VALUES (v_user_id, p_skill_node_id);

    RETURN QUERY SELECT TRUE, v_sp - v_cost_sp, v_node_key;
END;
$$;
