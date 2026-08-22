-- CreateTable: UserStats
CREATE TABLE IF NOT EXISTS "UserStats" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "rank" TEXT NOT NULL DEFAULT 'RANK E',
    "currency" INTEGER NOT NULL DEFAULT 0,
    "skillPoints" INTEGER NOT NULL DEFAULT 0,
    "endurance" INTEGER NOT NULL DEFAULT 10,
    "tenacity" INTEGER NOT NULL DEFAULT 10,
    "velocity" INTEGER NOT NULL DEFAULT 10,
    "discipline" INTEGER NOT NULL DEFAULT 10,
    "synthesis" INTEGER NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserStats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "UserStats_userId_key" ON "UserStats"("userId");
CREATE INDEX IF NOT EXISTS "UserStats_userId_idx" ON "UserStats"("userId");
CREATE INDEX IF NOT EXISTS "UserStats_level_xp_idx" ON "UserStats"("level", "xp");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'UserStats_userId_fkey'
    ) THEN
        ALTER TABLE "UserStats" ADD CONSTRAINT "UserStats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Stored Procedure: commit_focus_progression
CREATE OR REPLACE FUNCTION public.commit_focus_progression(
    p_gained_xp INT,
    p_gained_currency INT,
    p_endurance_inc INT DEFAULT 0,
    p_velocity_inc INT DEFAULT 0,
    p_discipline_inc INT DEFAULT 0,
    p_tenacity_inc INT DEFAULT 0,
    p_synthesis_inc INT DEFAULT 0
)
RETURNS TABLE (
    new_level INT,
    new_xp INT,
    new_rank TEXT,
    new_currency INT,
    new_sp INT,
    leveled_up BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id INT;
    v_old_xp INT;
    v_old_level INT;
    v_new_xp INT;
    v_new_level INT;
    v_new_rank TEXT;
    v_sp_diff INT;
    v_new_sp INT;
    v_new_currency INT;
    v_leveled_up BOOLEAN := FALSE;
BEGIN
    -- 1. Strict Scalar Subquery RLS check (Integer user ID extraction)
    v_user_id := (SELECT COALESCE(
        ((auth.jwt() ->> 'userId'::text))::integer,
        (NULLIF(current_setting('request.jwt.claim.userId', true), ''))::integer,
        0
    ));
    IF v_user_id = 0 OR v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Invalid session context';
    END IF;

    -- 2. Resilient Initialization (Zero-Error Upsert)
    INSERT INTO "UserStats" ("userId", "level", "xp", "rank", "currency", "skillPoints", "endurance", "tenacity", "velocity", "discipline", "synthesis", "updatedAt")
    VALUES (v_user_id, 1, 0, 'RANK E', 0, 0, 10, 10, 10, 10, 10, CURRENT_TIMESTAMP)
    ON CONFLICT ("userId") DO NOTHING;

    -- 3. Lock Row for Atomic Mutation
    SELECT xp, level, "skillPoints", currency 
    INTO v_old_xp, v_old_level, v_new_sp, v_new_currency
    FROM "UserStats" 
    WHERE "userId" = v_user_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'UserStats record not found for authenticated user';
    END IF;

    -- 4. Calculate New Total XP & Level Curve: XP = 100 * L^1.5 => L = floor((XP / 100)^(2/3))
    v_new_xp := v_old_xp + GREATEST(0, p_gained_xp);
    v_new_currency := v_new_currency + GREATEST(0, p_gained_currency);

    IF v_new_xp < 282 THEN
        v_new_level := 1;
    ELSE
        v_new_level := GREATEST(1, FLOOR(POW(v_new_xp::FLOAT / 100.0, 2.0 / 3.0))::INT);
        -- Precision boundary guard to guarantee 100% parity with floor(100 * L^1.5)
        WHILE FLOOR(100.0 * POW((v_new_level + 1)::FLOAT, 1.5)) <= v_new_xp LOOP
            v_new_level := v_new_level + 1;
        END LOOP;
        WHILE v_new_level > 1 AND FLOOR(100.0 * POW(v_new_level::FLOAT, 1.5)) > v_new_xp LOOP
            v_new_level := v_new_level - 1;
        END LOOP;
    END IF;

    -- Level Up & Skill Point Allocation
    IF v_new_level > v_old_level THEN
        v_sp_diff := v_new_level - v_old_level;
        v_new_sp := v_new_sp + v_sp_diff;
        v_leveled_up := TRUE;
    END IF;

    -- 5. Calculate Rank Tier
    v_new_rank := CASE
        WHEN v_new_level >= 150 THEN 'MONARCH'
        WHEN v_new_level >= 125 THEN 'NATIONAL'
        WHEN v_new_level >= 100 THEN 'RANK S'
        WHEN v_new_level >= 75  THEN 'RANK A'
        WHEN v_new_level >= 50  THEN 'RANK B'
        WHEN v_new_level >= 25  THEN 'RANK C'
        WHEN v_new_level >= 10  THEN 'RANK D'
        ELSE 'RANK E'
    END;

    -- 6. Commit Cascade to Database
    UPDATE "UserStats"
    SET 
        xp = v_new_xp,
        level = v_new_level,
        rank = v_new_rank,
        currency = v_new_currency,
        "skillPoints" = v_new_sp,
        endurance = LEAST(100, endurance + GREATEST(0, p_endurance_inc)),
        velocity = LEAST(100, velocity + GREATEST(0, p_velocity_inc)),
        discipline = LEAST(100, discipline + GREATEST(0, p_discipline_inc)),
        tenacity = LEAST(100, tenacity + GREATEST(0, p_tenacity_inc)),
        synthesis = LEAST(100, synthesis + GREATEST(0, p_synthesis_inc)),
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "userId" = v_user_id;

    RETURN QUERY SELECT v_new_level, v_new_xp, v_new_rank, v_new_currency, v_new_sp, v_leveled_up;
END;
$$;
