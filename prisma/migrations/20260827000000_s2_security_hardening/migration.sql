-- ============================================================================
-- S2 Security Hardening (20260827000000)
-- ----------------------------------------------------------------------------
-- 1. Close the live anonymous RPC exposure: revoke EXECUTE on ALL public
--    functions from PUBLIC/anon/authenticated, and stop future functions from
--    inheriting EXECUTE through default privileges.
-- 2. Harden the six kept SECURITY DEFINER RPCs with an in-function identity
--    guard: any caller that is not the app role (postgres / supabase_admin)
--    must prove its JWT subject equals p_user_id (S2 guard, ERRCODE 42501).
-- 3. Drop the dead claim_session_reward_atomic (caller-supplied reward amounts,
--    no callers in app/ or lib/). claim_achievement_reward_atomic IS used by
--    /api/achievements and is therefore kept and guarded instead.
-- 4. Enable RLS on the previously unprotected private tables with explicit
--    owner policies; Item stays an intentional public catalog (SELECT-only);
--    WaitlistEntry gets RLS with NO policies (PII, app-only access);
--    _prisma_migrations is deliberately left without RLS (infrastructure
--    metadata owned by Prisma; all external grants are revoked below).
-- 5. Repair missing WITH CHECK clauses and replace users_select_policy's
--    USING (true); consolidate the three legacy dashboard policies.
--
-- The app connects as postgres (BYPASSRLS + function owner), so none of these
-- revocations affect the Prisma/Next.js path. Realtime subscriptions use the
-- authenticated role + RLS policies and are unaffected by privilege revokes.
-- NOTE (dashboard step): ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin can
-- only be run by supabase_admin itself — see SECURITY-S2 report.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1a. Function EXECUTE revokes (closes the verified anon /rpc/ exposure)
-- ────────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM service_role;

-- 1b. Table privilege revokes (removes the residual TRUNCATE/REFERENCES/
--     TRIGGER/MAINTAIN grants; PostgREST table access stays denied)
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- 1c. Secure default privileges for objects created by the app role (postgres)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Drop dead reward RPC (caller-supplied amounts, no app callers)
-- ────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.claim_session_reward_atomic(text, text, integer, integer, text, numeric);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Hardened SECURITY DEFINER RPCs (bodies identical to latest versions
--    except for the S2 identity guard inserted after the main BEGIN)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.start_study_session(
    p_user_id INT,
    p_quest_id INT DEFAULT NULL,
    p_subject_id INT DEFAULT NULL,
    p_initial_seconds INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id INT;
  v_started_at TIMESTAMP;
  v_initial_seconds INT;
  v_existing RECORD;
  v_last_end TIMESTAMP;
BEGIN
  -- ══ S2 identity guard (20260827000000) — never trust caller-supplied p_user_id ══
  -- The app reaches this function as role postgres/supabase_admin. Any other
  -- role must prove its JWT subject equals p_user_id before anything runs.
  IF current_user NOT IN ('postgres', 'supabase_admin') THEN
    IF COALESCE((auth.jwt() ->> 'sub'), NULLIF(current_setting('request.jwt.claim.sub', true), ''), '') <> p_user_id::text THEN
      RAISE EXCEPTION 'S2 identity guard: caller identity does not match p_user_id' USING ERRCODE = '42501';
    END IF;
  END IF;
  -- 1. HARD CAP on carried seconds (server-authoritative trust boundary; T3: reduced to 30 minutes).
  v_initial_seconds := LEAST(GREATEST(0, COALESCE(p_initial_seconds, 0)), 1800);

  -- 2. Ownership validation — a session may never reference another
  --    user's subject or quest.
  IF p_subject_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public."Subject" WHERE id = p_subject_id AND "userId" = p_user_id
  ) THEN
    RAISE EXCEPTION 'Subject not found or unauthorized' USING ERRCODE = '42501';
  END IF;
  IF p_quest_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public."Quest" WHERE id = p_quest_id AND "userId" = p_user_id
  ) THEN
    RAISE EXCEPTION 'Quest not found or unauthorized' USING ERRCODE = '42501';
  END IF;

  -- If quest is provided, update quest status to IN_PROGRESS
  IF p_quest_id IS NOT NULL THEN
    UPDATE public."Quest"
    SET status = 'IN_PROGRESS'
    WHERE id = p_quest_id AND "userId" = p_user_id AND status = 'PENDING';
  END IF;

  -- 3. ADOPT: converge concurrent/duplicate starts onto ONE session row.
  --    A second tab racing the same lazy start receives the EXISTING open
  --    session instead of creating a duplicate that could double-credit
  --    the same wall-clock period.
  SELECT id, "startedAt", "durationMinutes", "durationSeconds", "focusRate"
  INTO v_existing
  FROM public."StudySession"
  WHERE "userId" = p_user_id
    AND "endedAt" IS NULL
    AND "questId" IS NOT DISTINCT FROM p_quest_id
    AND "subjectId" IS NOT DISTINCT FROM p_subject_id
  ORDER BY id
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'id', v_existing.id,
      'userId', p_user_id,
      'questId', p_quest_id,
      'subjectId', p_subject_id,
      'durationMinutes', v_existing."durationMinutes",
      'durationSeconds', v_existing."durationSeconds",
      'focusRate', v_existing."focusRate",
      'startedAt', v_existing."startedAt"
    );
  END IF;

  -- 4. Anti-fabrication overlap guard: compute the user's last ENDED
  --    session BEFORE closing open rows (closing sets endedAt = NOW(),
  --    which would otherwise wipe the legitimate backdate window).
  SELECT MAX("endedAt") INTO v_last_end
  FROM public."StudySession"
  WHERE "userId" = p_user_id AND "endedAt" IS NOT NULL;

  -- 5. Close any OTHER unended active sessions for this user (single
  --    open-session invariant; abandoned rows cannot accumulate).
  UPDATE public."StudySession"
  SET "endedAt" = NOW()
  WHERE "userId" = p_user_id AND "endedAt" IS NULL;

  -- 6. Backdated start — capped (step 1) and never allowed to precede
  --    the user's last ended session (step 4). A fabricated backdate can
  --    only reach into time the user demonstrably did not already have
  --    credited, and never more than 1h.
  v_started_at := NOW() - (v_initial_seconds || ' seconds')::INTERVAL;

  IF v_last_end IS NOT NULL THEN
    v_started_at := GREATEST(v_started_at, v_last_end - INTERVAL '60 seconds');
  END IF;

  -- Insert new study session (stored duration stays 0 — the settle RPC
  -- credits the exact delta on the first flush).
  INSERT INTO public."StudySession" (
    "userId", "questId", "subjectId", "durationMinutes", "durationSeconds", "focusRate", "startedAt"
  ) VALUES (
    p_user_id, p_quest_id, p_subject_id, 0, 0, 80, v_started_at
  )
  RETURNING id INTO v_session_id;

  RETURN jsonb_build_object(
    'id', v_session_id,
    'userId', p_user_id,
    'questId', p_quest_id,
    'subjectId', p_subject_id,
    'durationMinutes', 0,
    'durationSeconds', 0,
    'focusRate', 80,
    'startedAt', v_started_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_study_session_atomic(
    p_user_id INT,
    p_session_id INT DEFAULT NULL,
    p_duration_seconds INT DEFAULT 0,
    p_break_seconds INT DEFAULT 0,
    p_quest_id INT DEFAULT NULL,
    p_subject_id INT DEFAULT NULL,
    p_complete_quest BOOLEAN DEFAULT FALSE,
    p_is_final BOOLEAN DEFAULT FALSE,
    p_user_local_date TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user RECORD;
    v_quest RECORD;
    v_node RECORD;
    v_session_owner INT;
    v_claimed BOOLEAN := FALSE;
    v_previous_seconds INT := 0;
    v_previous_break INT := 0;
    v_started_at TIMESTAMP;
    v_actual_seconds INT;
    v_break_seconds INT;
    v_focus_rate_actual INT;
    v_stored_seconds INT := 0;
    v_delta_seconds INT := 0;
    v_new_total_seconds INT;
    v_session_id INT := p_session_id;
    v_was_insert BOOLEAN := FALSE;
    v_wall_seconds INT;
    v_last_end TIMESTAMP;
    v_award_eligible BOOLEAN;

    v_session_minutes NUMERIC;
    v_session_multiplier NUMERIC := 1.0;
    v_streak_multiplier NUMERIC := 1.0;
    v_session_xp INT := 0;
    v_session_sylph INT := 0;

    v_quest_found BOOLEAN := FALSE;
    v_quest_open BOOLEAN := FALSE;
    v_quest_completed BOOLEAN := FALSE;
    v_quest_xp INT := 0;
    v_quest_sylph INT := 0;
    v_hp_healed INT := 0;
    v_new_hp INT;
    v_today TEXT;
    v_target_seconds INT := 0;
    v_should_complete BOOLEAN := FALSE;
    v_ratio NUMERIC := 0;
    v_full BOOLEAN := FALSE;
    v_base_xp INT := 0;
    v_base_sylph INT := 0;
    v_early BOOLEAN := FALSE;
    v_raw_progress NUMERIC := 0;

    v_node_id INT := NULL;
    v_node_found BOOLEAN := FALSE;
    v_new_progress NUMERIC := NULL;
    v_mastery_granted BOOLEAN := FALSE;

    v_total_xp INT := 0;
    v_total_sylph INT := 0;
    v_level_up_sylph INT := 0;
    v_lifetime_xp INT;
    v_level INT;
    v_current_xp INT;
    v_xp_threshold INT;
    v_rank TEXT;
    v_rank_db TEXT;
    v_previous_rank TEXT;
    v_levels_gained INT := 0;
    v_did_rank_up BOOLEAN := FALSE;
    v_rank_up_text TEXT := '';
BEGIN
  -- ══ S2 identity guard (20260827000000) — never trust caller-supplied p_user_id ══
  -- The app reaches this function as role postgres/supabase_admin. Any other
  -- role must prove its JWT subject equals p_user_id before anything runs.
  IF current_user NOT IN ('postgres', 'supabase_admin') THEN
    IF COALESCE((auth.jwt() ->> 'sub'), NULLIF(current_setting('request.jwt.claim.sub', true), ''), '') <> p_user_id::text THEN
      RAISE EXCEPTION 'S2 identity guard: caller identity does not match p_user_id' USING ERRCODE = '42501';
    END IF;
  END IF;
    IF p_user_id IS NULL OR p_user_id <= 0 THEN
        RAISE EXCEPTION 'Invalid user id' USING ERRCODE = '22023';
    END IF;

    v_actual_seconds := GREATEST(0, COALESCE(p_duration_seconds, 0));
    v_break_seconds := GREATEST(0, COALESCE(p_break_seconds, 0));

    -- 1. Lock StudySession first (fixed order: Session → Quest → User → UserStats → Node)
    IF v_session_id IS NOT NULL THEN
        SELECT "userId", "durationSeconds", "breakSeconds", "rewardsClaimed", "startedAt"
        INTO v_session_owner, v_previous_seconds, v_previous_break, v_claimed, v_started_at
        FROM public."StudySession"
        WHERE id = v_session_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Session not found: %', v_session_id;
        END IF;
        IF v_session_owner <> p_user_id THEN
            RAISE EXCEPTION 'Session % does not belong to user %', v_session_id, p_user_id
                USING ERRCODE = '42501';
        END IF;
        v_previous_seconds := COALESCE(v_previous_seconds, 0);
        v_previous_break := COALESCE(v_previous_break, 0);

        -- Server-side wall-clock clamp: cumulative focus can never exceed the
        -- (possibly backdated) session window + 60s grace. Because the stored
        -- duration is monotonic, a clamped flush can never regress data —
        -- it simply credits nothing until real time catches up.
        v_wall_seconds := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - v_started_at))));
        v_actual_seconds := LEAST(v_actual_seconds, v_wall_seconds + 60);
        v_break_seconds := LEAST(v_break_seconds, GREATEST(0, v_wall_seconds + 60 - v_actual_seconds));
    ELSE
        v_was_insert := TRUE;

        -- Trust boundary for the direct-call insert path (the API always
        -- provides a session id): ownership validation plus the same
        -- 30-minute recovery cap as start_study_session. This branch can
        -- never mint more time than the documented bound.
        IF p_subject_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public."Subject" WHERE id = p_subject_id AND "userId" = p_user_id
        ) THEN
            RAISE EXCEPTION 'Subject not found or unauthorized' USING ERRCODE = '42501';
        END IF;
        IF p_quest_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public."Quest" WHERE id = p_quest_id AND "userId" = p_user_id
        ) THEN
            RAISE EXCEPTION 'Quest not found or unauthorized' USING ERRCODE = '42501';
        END IF;
        v_actual_seconds := LEAST(v_actual_seconds, 1800);
        v_break_seconds := LEAST(v_break_seconds, 1800);
    END IF;

    IF (v_actual_seconds + v_break_seconds) > 0 THEN
        v_focus_rate_actual := ROUND(100.0 * v_actual_seconds / (v_actual_seconds + v_break_seconds));
    ELSE
        v_focus_rate_actual := 80;
    END IF;

    v_delta_seconds := GREATEST(0, v_actual_seconds - v_previous_seconds);

    -- 2. Lock Quest (if linked)
    IF p_quest_id IS NOT NULL THEN
        SELECT * INTO v_quest
        FROM public."Quest"
        WHERE id = p_quest_id AND "userId" = p_user_id
        FOR UPDATE;
        IF FOUND THEN
            v_quest_found := TRUE;
            v_quest_open := (v_quest.status = 'ACTIVE' OR v_quest.status = 'IN_PROGRESS' OR v_quest.status = 'PENDING');
        END IF;
    END IF;

    -- 3. Lock User and ensure UserStats exists
    SELECT * INTO v_user FROM public."User" WHERE id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found: %', p_user_id;
    END IF;

    INSERT INTO public."UserStats" ("userId", "level", "xp", "rank", "currency", "skillPoints",
        "endurance", "tenacity", "velocity", "discipline", "synthesis", "updatedAt")
    VALUES (p_user_id, v_user.level, public.canonical_required_xp(v_user.level) + v_user."currentXP", 'RANK E', 0, 0, 10, 10, 10, 10, 10, CURRENT_TIMESTAMP)
    ON CONFLICT ("userId") DO NOTHING;

    PERFORM 1 FROM public."UserStats" WHERE "userId" = p_user_id FOR UPDATE;

    -- Streak multiplier (canonical ladder) — used by both session and quest rewards.
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

    -- 4. Lock SubjectNode (if the quest targets one). Nested IFs: a
    -- record field must never appear in the same condition as a plain
    -- boolean variable (PostgreSQL does not guarantee short-circuit
    -- evaluation order for unassigned RECORD access).
    IF v_quest_found THEN
        IF v_quest."subjectNodeId" IS NOT NULL THEN
            v_node_id := v_quest."subjectNodeId";
            SELECT sn."progress", sn."isMastered", sn."spAward", sn."nodeId", sn."title"
            INTO v_node
            FROM public."SubjectNode" sn
            JOIN public."Subject" s ON s.id = sn."subjectId"
            WHERE sn.id = v_node_id AND s."userId" = p_user_id
            FOR UPDATE OF sn;
            IF FOUND THEN
                v_node_found := TRUE;
            END IF;
        END IF;
    END IF;

    -- 5. Upsert session row — monotonic stored duration; endedAt only on final.
    IF v_session_id IS NOT NULL THEN
        v_stored_seconds := GREATEST(v_actual_seconds, v_previous_seconds);
        UPDATE public."StudySession"
        SET "durationMinutes" = FLOOR(v_stored_seconds / 60.0),
            "durationSeconds" = v_stored_seconds,
            "breakSeconds" = GREATEST(v_break_seconds, "breakSeconds"),
            "focusRate" = v_focus_rate_actual,
            "endedAt" = CASE WHEN p_is_final THEN NOW() ELSE "endedAt" END,
            "rewardsClaimed" = CASE WHEN p_is_final THEN TRUE ELSE "rewardsClaimed" END
        WHERE id = v_session_id AND "userId" = p_user_id;
    ELSE
        -- Overlap guard: the backdated start can never precede the end of
        -- the user's most recent ended session (minus 60s grace) — the
        -- insert path can only fill REAL wall-clock gaps in the user's
        -- own history, bounded by the 30-minute cap above.
        SELECT MAX("endedAt") INTO v_last_end
        FROM public."StudySession"
        WHERE "userId" = p_user_id AND "endedAt" IS NOT NULL;

        v_started_at := NOW() - ((v_actual_seconds + v_break_seconds) || ' seconds')::INTERVAL;
        IF v_last_end IS NOT NULL THEN
            v_started_at := GREATEST(v_started_at, v_last_end - INTERVAL '60 seconds');
        END IF;

        -- Wall-consistency clamp: the stored/credited duration can never
        -- exceed the guarded window + 60s grace, exactly like the session
        -- branch. (The overlap guard alone shifts startedAt; this clamp
        -- actually bounds the credited seconds.)
        v_wall_seconds := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - v_started_at))));
        v_actual_seconds := LEAST(v_actual_seconds, v_wall_seconds + 60);
        v_break_seconds := LEAST(v_break_seconds, GREATEST(0, v_wall_seconds + 60 - v_actual_seconds));

        IF (v_actual_seconds + v_break_seconds) > 0 THEN
            v_focus_rate_actual := ROUND(100.0 * v_actual_seconds / (v_actual_seconds + v_break_seconds));
        ELSE
            v_focus_rate_actual := 80;
        END IF;
        v_delta_seconds := GREATEST(0, v_actual_seconds - v_previous_seconds);

        INSERT INTO public."StudySession" (
            "userId", "questId", "subjectId", "durationMinutes", "durationSeconds", "breakSeconds", "focusRate",
            "rewardsClaimed", "startedAt", "endedAt"
        ) VALUES (
            p_user_id, p_quest_id, p_subject_id,
            FLOOR(v_actual_seconds / 60.0), v_actual_seconds, v_break_seconds, v_focus_rate_actual,
            p_is_final,
            v_started_at,
            CASE WHEN p_is_final THEN NOW() ELSE NULL END
        )
        RETURNING id INTO v_session_id;
        v_stored_seconds := v_actual_seconds;
    END IF;

    -- 6. Lifetime study totals advance strictly by the delta.
    IF v_delta_seconds > 0 THEN
        v_new_total_seconds := COALESCE(v_user."totalStudySeconds", 0) + v_delta_seconds;
        UPDATE public."User"
        SET "totalStudySeconds" = v_new_total_seconds,
            "totalStudyMinutes" = FLOOR(v_new_total_seconds / 60.0)
        WHERE id = p_user_id;
    END IF;

    -- 7. Quest elapsed advances strictly by the delta.
    IF v_quest_found AND v_delta_seconds > 0 THEN
        UPDATE public."Quest"
        SET "elapsedSeconds" = "elapsedSeconds" + v_delta_seconds
        WHERE id = p_quest_id;
        v_quest."elapsedSeconds" := v_quest."elapsedSeconds" + v_delta_seconds;
    END IF;

    -- 8. Progression baseline (canonical curve — never trust stored thresholds).
    v_level := v_user.level;
    v_current_xp := v_user."currentXP";
    v_xp_threshold := public.canonical_xp_for_next_level(v_level);
    v_rank := v_user."hunterRank";
    v_previous_rank := v_user."hunterRank";

    -- 9. Focus-session time rewards (single award point: final flush or direct insert).
    v_award_eligible := (p_is_final OR v_was_insert)
                        AND (v_delta_seconds > 0 OR v_previous_seconds = 0);
    IF v_award_eligible AND v_actual_seconds >= 60 THEN
        v_session_minutes := v_actual_seconds / 60.0;

        IF v_session_minutes >= 120 THEN
            v_session_multiplier := 1.3;
        ELSIF v_session_minutes >= 60 THEN
            v_session_multiplier := 1.2;
        ELSIF v_session_minutes >= 30 THEN
            v_session_multiplier := 1.1;
        ELSE
            v_session_multiplier := 1.0;
        END IF;

        v_session_xp := FLOOR(5 * v_session_minutes * v_session_multiplier);
        v_session_sylph := GREATEST(5, FLOOR(0.5 * v_session_minutes * v_streak_multiplier));
    END IF;

    -- 10. Quest completion & node settlement (only for open quests).
    IF v_quest_found AND v_quest_open THEN
        v_target_seconds := COALESCE(v_quest."targetMinutes", v_quest."requiredMinutes", 45) * 60;
        v_should_complete := (p_complete_quest = TRUE) OR (v_quest."elapsedSeconds" >= v_target_seconds);

        IF v_should_complete THEN
            v_quest_completed := TRUE;
            v_full := (v_quest."elapsedSeconds" >= v_target_seconds);
            v_ratio := LEAST(1.0, CASE WHEN v_target_seconds > 0 THEN v_quest."elapsedSeconds"::NUMERIC / v_target_seconds ELSE 1.0 END);

            v_base_xp := CASE WHEN v_full THEN v_quest."xpReward" ELSE FLOOR(v_quest."xpReward" * v_ratio) END;
            v_base_sylph := CASE WHEN v_full THEN v_quest."sylphReward" ELSE FLOOR(v_quest."sylphReward" * v_ratio) END;

            -- Early-completion bonus (parity with claim_quest_reward).
            v_today := COALESCE(NULLIF(p_user_local_date, ''), TO_CHAR(NOW(), 'YYYY-MM-DD'));
            IF v_quest."scheduledFor" IS NOT NULL AND v_quest."scheduledFor" <> '' AND v_today < v_quest."scheduledFor" THEN
                v_early := TRUE;
                v_base_xp := FLOOR(v_base_xp * 1.2);
                v_base_sylph := FLOOR(v_base_sylph * 1.2);
            END IF;

            -- Gate Key multiplier (parity with claim_quest_reward).
            IF v_quest."isGateKeyApplied" THEN
                v_base_xp := v_base_xp * 2;
                v_base_sylph := v_base_sylph * 2;
            END IF;

            -- Streak multiplier applies to Sylph (parity with claim_quest_reward).
            v_base_sylph := FLOOR(v_base_sylph * v_streak_multiplier);
            v_quest_xp := GREATEST(0, v_base_xp);
            v_quest_sylph := GREATEST(0, v_base_sylph);

            -- HP restoration (parity with claim_quest_reward: +20 up to max).
            IF v_user.hp < v_user."maxHp" THEN
                v_hp_healed := LEAST(20, v_user."maxHp" - v_user.hp);
                v_new_hp := v_user.hp + v_hp_healed;
            ELSE
                v_new_hp := v_user.hp;
            END IF;

            UPDATE public."Quest"
            SET status = 'COMPLETED',
                "completedAt" = NOW()
            WHERE id = p_quest_id;

            -- Node progress mirrors the reward: full scope weight at full
            -- completion, scaled by studied time otherwise.
            IF v_node_found THEN
                v_new_progress := CASE WHEN v_full
                    THEN LEAST(100.0, GREATEST(5.0, FLOOR(v_quest."scopeWeight" * 100)))
                    ELSE LEAST(100.0, GREATEST(0.0, FLOOR(v_quest."scopeWeight" * 100 * v_ratio)))
                END;
            END IF;
        ELSE
            -- Quest still open: advance the node proportionally to THIS flush's delta.
            IF v_node_found AND v_delta_seconds >= 30 THEN
                v_raw_progress := FLOOR(v_quest."scopeWeight" * 100 * LEAST(1.0, v_delta_seconds::NUMERIC / NULLIF(v_target_seconds, 0)));
                v_new_progress := LEAST(100.0, GREATEST(1.0, v_raw_progress));
            END IF;
        END IF;

        IF v_new_progress IS NOT NULL AND v_new_progress > 0 AND v_node_found THEN
            UPDATE public."SubjectNode"
            SET progress = LEAST(100, v_node.progress + v_new_progress),
                "isMastered" = CASE WHEN v_node.progress + v_new_progress >= 100 THEN TRUE ELSE "isMastered" END,
                "masteredAt" = CASE WHEN v_node.progress + v_new_progress >= 100 AND NOT v_node.isMastered THEN NOW() ELSE "masteredAt" END,
                "updatedAt" = CURRENT_TIMESTAMP
            WHERE id = v_node_id;
            v_mastery_granted := (NOT v_node.isMastered) AND (v_node.progress + v_new_progress >= 100);
        END IF;
    END IF;

    -- 11. Combined XP / level-up processing (single pass, single User write).
    v_total_xp := v_session_xp + v_quest_xp;
    v_total_sylph := v_session_sylph + v_quest_sylph;

    IF v_total_xp > 0 THEN
        v_current_xp := v_current_xp + v_total_xp;
        WHILE v_current_xp >= v_xp_threshold LOOP
            v_current_xp := v_current_xp - v_xp_threshold;
            v_level := v_level + 1;
            v_levels_gained := v_levels_gained + 1;
            v_xp_threshold := public.canonical_xp_for_next_level(v_level);
        END LOOP;

        v_rank := public.canonical_rank_display(v_level);
        v_did_rank_up := (v_rank <> v_previous_rank);

        IF v_levels_gained > 0 THEN
            v_level_up_sylph := v_level * 300;
            v_total_sylph := v_total_sylph + v_level_up_sylph;
        END IF;
    END IF;

    -- 12. Single atomic User + UserStats mutation.
    IF v_total_xp > 0 OR v_total_sylph > 0 OR v_hp_healed > 0 THEN
        UPDATE public."User"
        SET level = v_level,
            "currentXP" = v_current_xp,
            "xpToNextLevel" = v_xp_threshold,
            "hunterRank" = v_rank,
            sylph = sylph + v_total_sylph,
            hp = CASE WHEN v_hp_healed > 0 THEN v_new_hp ELSE hp END
        WHERE id = p_user_id;

        v_lifetime_xp := public.canonical_required_xp(v_level) + v_current_xp;
        v_rank_db := public.canonical_rank_db(v_level);

        UPDATE public."UserStats"
        SET xp = v_lifetime_xp,
            level = v_level,
            rank = v_rank_db,
            currency = currency + v_total_sylph,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "userId" = p_user_id;
    END IF;

    -- 13. Audit ledgers.
    IF v_session_xp > 0 THEN
        INSERT INTO public."XpLedger" ("userId", amount, "balanceAfter", reason, source, metadata, "createdAt")
        VALUES (p_user_id, v_session_xp, public.canonical_required_xp(v_level) + v_current_xp,
                'FOCUS_SESSION', 'TIMER', jsonb_build_object('sessionId', v_session_id), NOW());
    END IF;

    IF v_quest_xp > 0 THEN
        INSERT INTO public."XpLedger" ("userId", amount, "balanceAfter", reason, source, metadata, "createdAt")
        VALUES (p_user_id, v_quest_xp, public.canonical_required_xp(v_level) + v_current_xp,
                'SESSION_QUEST_REWARD', 'QUEST',
                jsonb_build_object('sessionId', v_session_id, 'questId', p_quest_id), NOW());
    END IF;

    IF v_session_sylph > 0 THEN
        INSERT INTO public."SylphLedger" ("userId", amount, source, "createdAt")
        VALUES (p_user_id, v_session_sylph, 'TIMER', NOW());
    END IF;

    IF v_quest_sylph > 0 THEN
        INSERT INTO public."SylphLedger" ("userId", amount, source, "createdAt")
        VALUES (p_user_id, v_quest_sylph, 'QUEST', NOW());
    END IF;

    IF v_level_up_sylph > 0 THEN
        INSERT INTO public."SylphLedger" ("userId", amount, source, "createdAt")
        VALUES (p_user_id, v_level_up_sylph, 'LEVEL_UP', NOW());
    END IF;

    IF v_hp_healed > 0 THEN
        INSERT INTO public."HpLedger" ("userId", amount, source, "createdAt")
        VALUES (p_user_id, v_hp_healed, 'QUEST_REWARD_HEAL', NOW());
    END IF;

    -- 14. System messages.
    IF v_quest_completed THEN
        INSERT INTO public."SystemMessage" ("userId", content, type, read, "createdAt")
        VALUES (
            p_user_id,
            CASE WHEN v_full
                THEN '**🏆 QUEST COMPLETED: ' || v_quest.title || '**\n\nTarget Duration: ' || COALESCE(v_quest."targetMinutes", v_quest."requiredMinutes", 45) || ' mins.\n\nRewards Claimed: **+' || v_quest_xp || ' XP** • **+' || v_quest_sylph || ' Sylph**.'
                ELSE '**🏆 QUEST COMPLETED EARLY: ' || v_quest.title || '**\n\nRewards Claimed: **+' || v_quest_xp || ' XP** • **+' || v_quest_sylph || ' Sylph** (full reward unlocks at ' || COALESCE(v_quest."targetMinutes", v_quest."requiredMinutes", 45) || ' mins).'
            END,
            'REWARD', false, NOW()
        );
    END IF;

    IF v_mastery_granted THEN
        INSERT INTO public."SystemMessage" ("userId", content, type, read, "createdAt")
        VALUES (
            p_user_id,
            '**🎯 SYLLABUS NODE MASTERED: ' || v_node.title || '**\n\nYou achieved 100% mastery on node **' || v_node."nodeId" || '**!\n\nReward Minted: **+' || COALESCE(v_node."spAward", 0) || ' Subject SP**.',
            'REWARD', false, NOW()
        );
    END IF;

    IF v_levels_gained > 0 THEN
        v_rank_up_text := CASE WHEN v_did_rank_up THEN E'\n\nRank Up! You are now a ' || v_rank || E'-Rank Hunter.' ELSE '' END;
        INSERT INTO public."SystemMessage" ("userId", content, type, read, "createdAt")
        VALUES (
            p_user_id,
            E'**Level Up**\n\nYou have reached Level ' || v_level || '.' || v_rank_up_text || E'\n\nStipend: +' || v_level_up_sylph || E' Sylph\n\nYou have grown stronger.',
            'LEVEL_UP', false, NOW()
        );
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'sessionId', v_session_id,
        'isFinal', p_is_final,
        'alreadyClaimed', (p_is_final AND v_claimed),
        'durationSeconds', v_stored_seconds,
        'breakSeconds', GREATEST(v_break_seconds, v_previous_break),
        'deltaSeconds', v_delta_seconds,
        'awarded', v_award_eligible AND v_actual_seconds >= 60,
        'xpGained', v_session_xp,
        'sylphGained', v_session_sylph,
        'totalSylphEarned', v_total_sylph,
        'questCompleted', v_quest_completed,
        'questXp', v_quest_xp,
        'questSylph', v_quest_sylph,
        'hpHealed', v_hp_healed,
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
  v_stored_seconds INT;
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
  -- ══ S2 identity guard (20260827000000) — never trust caller-supplied p_user_id ══
  -- The app reaches this function as role postgres/supabase_admin. Any other
  -- role must prove its JWT subject equals p_user_id before anything runs.
  IF current_user NOT IN ('postgres', 'supabase_admin') THEN
    IF COALESCE((auth.jwt() ->> 'sub'), NULLIF(current_setting('request.jwt.claim.sub', true), ''), '') <> p_user_id::text THEN
      RAISE EXCEPTION 'S2 identity guard: caller identity does not match p_user_id' USING ERRCODE = '42501';
    END IF;
  END IF;
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
  -- Stored duration is MONOTONIC so a lagging/duplicate client flush can
  -- never regress a previously-flushed higher value.
  IF v_session_id IS NOT NULL THEN
    v_stored_seconds := GREATEST(v_actual_seconds, v_previous_seconds);
    UPDATE public."StudySession"
    SET "durationMinutes" = FLOOR(v_stored_seconds / 60.0),
        "durationSeconds" = v_stored_seconds,
        "breakSeconds" = GREATEST(v_break_seconds, "breakSeconds"),
        "focusRate" = v_focus_rate_actual,
        "endedAt" = CASE WHEN p_is_final THEN NOW() ELSE "endedAt" END
    WHERE id = v_session_id AND "userId" = p_user_id;
  ELSE
    v_was_insert := TRUE;
    v_stored_seconds := v_actual_seconds;
    INSERT INTO public."StudySession" (
      "userId", "questId", "subjectId", "durationMinutes", "durationSeconds", "breakSeconds", "focusRate", "startedAt", "endedAt"
    ) VALUES (
      p_user_id, p_quest_id, p_subject_id,
      FLOOR(v_actual_seconds / 60.0), v_actual_seconds, v_break_seconds, v_focus_rate_actual,
      NOW() - (v_actual_seconds || ' seconds')::INTERVAL, CASE WHEN p_is_final THEN NOW() ELSE NULL END
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
    'durationMinutes', FLOOR(v_stored_seconds / 60.0),
    'durationSeconds', v_stored_seconds,
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
  -- ══ S2 identity guard (20260827000000) — never trust caller-supplied p_user_id ══
  -- The app reaches this function as role postgres/supabase_admin. Any other
  -- role must prove its JWT subject equals p_user_id before anything runs.
  IF current_user NOT IN ('postgres', 'supabase_admin') THEN
    IF COALESCE((auth.jwt() ->> 'sub'), NULLIF(current_setting('request.jwt.claim.sub', true), ''), '') <> p_user_id::text THEN
      RAISE EXCEPTION 'S2 identity guard: caller identity does not match p_user_id' USING ERRCODE = '42501';
    END IF;
  END IF;
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
  -- ══ S2 identity guard (20260827000000) — never trust caller-supplied p_user_id ══
  -- The app reaches this function as role postgres/supabase_admin. Any other
  -- role must prove its JWT subject equals p_user_id before anything runs.
  IF current_user NOT IN ('postgres', 'supabase_admin') THEN
    IF COALESCE((auth.jwt() ->> 'sub'), NULLIF(current_setting('request.jwt.claim.sub', true), ''), '') <> p_user_id::text THEN
      RAISE EXCEPTION 'S2 identity guard: caller identity does not match p_user_id' USING ERRCODE = '42501';
    END IF;
  END IF;
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
  -- ══ S2 identity guard (20260827000000) — never trust caller-supplied p_user_id ══
  -- The app reaches this function as role postgres/supabase_admin. Any other
  -- role must prove its JWT subject equals p_user_id before anything runs.
  IF current_user NOT IN ('postgres', 'supabase_admin') THEN
    IF COALESCE((auth.jwt() ->> 'sub'), NULLIF(current_setting('request.jwt.claim.sub', true), ''), '') <> p_user_id::text THEN
      RAISE EXCEPTION 'S2 identity guard: caller identity does not match p_user_id' USING ERRCODE = '42501';
    END IF;
  END IF;
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
  -- ══ S2 identity guard (20260827000000) — never trust caller-supplied p_user_id ══
  -- The app reaches this function as role postgres/supabase_admin. Any other
  -- role must prove its JWT subject equals p_user_id before anything runs.
  IF current_user NOT IN ('postgres', 'supabase_admin') THEN
    IF COALESCE((auth.jwt() ->> 'sub'), NULLIF(current_setting('request.jwt.claim.sub', true), ''), '') <> p_user_id::text THEN
      RAISE EXCEPTION 'S2 identity guard: caller identity does not match p_user_id' USING ERRCODE = '42501';
    END IF;
  END IF;
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

-- ────────────────────────────────────────────────────────────────────────────
-- 4. RLS on previously unprotected tables
-- ────────────────────────────────────────────────────────────────────────────
-- Private, user-owned: enable RLS + owner policies.
ALTER TABLE "AiUsageLog" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "aiusagelog_user_policy" ON "AiUsageLog";
CREATE POLICY "aiusagelog_user_policy" ON "AiUsageLog"
  FOR ALL TO public
  USING ((("userId")::text = (auth.uid())::text OR "userId" = COALESCE((auth.jwt() ->> 'userId')::integer, 0)))
  WITH CHECK ((("userId")::text = (auth.uid())::text OR "userId" = COALESCE((auth.jwt() ->> 'userId')::integer, 0)));

ALTER TABLE "FloatingRestDay" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "floatingrestday_user_policy" ON "FloatingRestDay";
CREATE POLICY "floatingrestday_user_policy" ON "FloatingRestDay"
  FOR ALL TO public
  USING ((("userId")::text = (auth.uid())::text OR "userId" = COALESCE((auth.jwt() ->> 'userId')::integer, 0)))
  WITH CHECK ((("userId")::text = (auth.uid())::text OR "userId" = COALESCE((auth.jwt() ->> 'userId')::integer, 0)));

ALTER TABLE "UserInventory" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "userinventory_user_policy" ON "UserInventory";
CREATE POLICY "userinventory_user_policy" ON "UserInventory"
  FOR ALL TO public
  USING ((("userId")::text = (auth.uid())::text OR "userId" = COALESCE((auth.jwt() ->> 'userId')::integer, 0)))
  WITH CHECK ((("userId")::text = (auth.uid())::text OR "userId" = COALESCE((auth.jwt() ->> 'userId')::integer, 0)));

ALTER TABLE "UserQuota" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "userquota_user_policy" ON "UserQuota";
CREATE POLICY "userquota_user_policy" ON "UserQuota"
  FOR ALL TO public
  USING ((("userId")::text = (auth.uid())::text OR "userId" = COALESCE((auth.jwt() ->> 'userId')::integer, 0)))
  WITH CHECK ((("userId")::text = (auth.uid())::text OR "userId" = COALESCE((auth.jwt() ->> 'userId')::integer, 0)));

ALTER TABLE "UserSkillNode" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "userskillnode_user_policy" ON "UserSkillNode";
CREATE POLICY "userskillnode_user_policy" ON "UserSkillNode"
  FOR ALL TO public
  USING ((("userId")::text = (auth.uid())::text OR "userId" = COALESCE((auth.jwt() ->> 'userId')::integer, 0)))
  WITH CHECK ((("userId")::text = (auth.uid())::text OR "userId" = COALESCE((auth.jwt() ->> 'userId')::integer, 0)));

ALTER TABLE "UserStats" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "userstats_user_policy" ON "UserStats";
CREATE POLICY "userstats_user_policy" ON "UserStats"
  FOR ALL TO public
  USING ((("userId")::text = (auth.uid())::text OR "userId" = COALESCE((auth.jwt() ->> 'userId')::integer, 0)))
  WITH CHECK ((("userId")::text = (auth.uid())::text OR "userId" = COALESCE((auth.jwt() ->> 'userId')::integer, 0)));

ALTER TABLE "XpLedger" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "xpledger_user_policy" ON "XpLedger";
CREATE POLICY "xpledger_user_policy" ON "XpLedger"
  FOR ALL TO public
  USING ((("userId")::text = (auth.uid())::text OR "userId" = COALESCE((auth.jwt() ->> 'userId')::integer, 0)))
  WITH CHECK ((("userId")::text = (auth.uid())::text OR "userId" = COALESCE((auth.jwt() ->> 'userId')::integer, 0)));

-- WaitlistEntry: PII (emails). RLS enabled with NO policies — external roles
-- are blocked entirely; the app API reaches it as postgres.
ALTER TABLE "WaitlistEntry" ENABLE ROW LEVEL SECURITY;

-- Item: intentionally public catalog (read-only, mirrors AcousticTrack).
ALTER TABLE "Item" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "item_select_public_catalog" ON "Item";
CREATE POLICY "item_select_public_catalog" ON "Item"
  FOR SELECT TO public
  USING (true);

-- _prisma_migrations: deliberately left WITHOUT RLS — infrastructure metadata
-- managed by Prisma as postgres; all external table grants were revoked in 1b.

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Policy repairs (WITH CHECK) and legacy consolidation
-- ────────────────────────────────────────────────────────────────────────────

-- User: self-only SELECT (replaces USING (true)); UPDATE gains WITH CHECK so
-- the row must still be the caller's own. Protected columns (sylph, level,
-- currentXP, hp, streakDays, verificationStatus, tokenVersion, password) are
-- protected by keeping ALL column-level grants off external roles — do not
-- add UPDATE grants to anon/authenticated on "User".
DROP POLICY IF EXISTS "users_select_policy" ON "User";
CREATE POLICY "users_select_own_policy" ON "User"
  FOR SELECT TO public
  USING (((id)::text = (auth.uid())::text OR id = COALESCE((auth.jwt() ->> 'userId')::integer, 0)));

DROP POLICY IF EXISTS "users_update_policy" ON "User";
CREATE POLICY "users_update_own_policy" ON "User"
  FOR UPDATE TO public
  USING (((id)::text = (auth.uid())::text OR id = COALESCE((auth.jwt() ->> 'userId')::integer, 0)))
  WITH CHECK (((id)::text = (auth.uid())::text OR id = COALESCE((auth.jwt() ->> 'userId')::integer, 0)));

-- Conversation: replace the single ALL-policy with explicit INSERT/UPDATE/
-- DELETE policies. UPDATE is creator-only (WITH CHECK on createdBy); INSERT
-- must be self-created; DELETE is participant-or-creator.
DROP POLICY IF EXISTS "convo_write_policy" ON "Conversation";
CREATE POLICY "conversation_insert_creator" ON "Conversation"
  FOR INSERT TO public
  WITH CHECK ((("createdBy")::text = (auth.uid())::text OR "createdBy" = COALESCE((auth.jwt() ->> 'userId')::integer, 0)));
CREATE POLICY "conversation_update_creator" ON "Conversation"
  FOR UPDATE TO public
  USING ((("createdBy")::text = (auth.uid())::text OR "createdBy" = COALESCE((auth.jwt() ->> 'userId')::integer, 0)) OR (EXISTS (SELECT 1 FROM "ConversationParticipant" cp WHERE cp."conversationId" = "Conversation".id AND ((cp."userId")::text = (auth.uid())::text OR cp."userId" = COALESCE((auth.jwt() ->> 'userId')::integer, 0)))))
  WITH CHECK ((("createdBy")::text = (auth.uid())::text OR "createdBy" = COALESCE((auth.jwt() ->> 'userId')::integer, 0)));
CREATE POLICY "conversation_delete_participant" ON "Conversation"
  FOR DELETE TO public
  USING ((("createdBy")::text = (auth.uid())::text OR "createdBy" = COALESCE((auth.jwt() ->> 'userId')::integer, 0)) OR (EXISTS (SELECT 1 FROM "ConversationParticipant" cp WHERE cp."conversationId" = "Conversation".id AND ((cp."userId")::text = (auth.uid())::text OR cp."userId" = COALESCE((auth.jwt() ->> 'userId')::integer, 0)))));

-- FriendRequest: split the unchecked ALL-policy; UPDATE/DELETE must keep the
-- row owned by sender or receiver.
DROP POLICY IF EXISTS "friend_request_update_delete_policy" ON "FriendRequest";
CREATE POLICY "friend_request_update_policy" ON "FriendRequest"
  FOR UPDATE TO public
  USING (("senderId")::text = (auth.uid())::text OR "senderId" = COALESCE((auth.jwt() ->> 'userId')::integer, 0)
         OR ("receiverId")::text = (auth.uid())::text OR "receiverId" = COALESCE((auth.jwt() ->> 'userId')::integer, 0))
  WITH CHECK (("senderId")::text = (auth.uid())::text OR "senderId" = COALESCE((auth.jwt() ->> 'userId')::integer, 0)
         OR ("receiverId")::text = (auth.uid())::text OR "receiverId" = COALESCE((auth.jwt() ->> 'userId')::integer, 0));
CREATE POLICY "friend_request_delete_policy" ON "FriendRequest"
  FOR DELETE TO public
  USING (("senderId")::text = (auth.uid())::text OR "senderId" = COALESCE((auth.jwt() ->> 'userId')::integer, 0)
         OR ("receiverId")::text = (auth.uid())::text OR "receiverId" = COALESCE((auth.jwt() ->> 'userId')::integer, 0));

-- SessionInvite: same repair.
DROP POLICY IF EXISTS "session_invite_write_policy" ON "SessionInvite";
CREATE POLICY "session_invite_update_policy" ON "SessionInvite"
  FOR UPDATE TO public
  USING (("senderId")::text = (auth.uid())::text OR "senderId" = COALESCE((auth.jwt() ->> 'userId')::integer, 0)
         OR ("receiverId")::text = (auth.uid())::text OR "receiverId" = COALESCE((auth.jwt() ->> 'userId')::integer, 0))
  WITH CHECK (("senderId")::text = (auth.uid())::text OR "senderId" = COALESCE((auth.jwt() ->> 'userId')::integer, 0)
         OR ("receiverId")::text = (auth.uid())::text OR "receiverId" = COALESCE((auth.jwt() ->> 'userId')::integer, 0));
CREATE POLICY "session_invite_delete_policy" ON "SessionInvite"
  FOR DELETE TO public
  USING (("senderId")::text = (auth.uid())::text OR "senderId" = COALESCE((auth.jwt() ->> 'userId')::integer, 0)
         OR ("receiverId")::text = (auth.uid())::text OR "receiverId" = COALESCE((auth.jwt() ->> 'userId')::integer, 0));

-- SubjectNode: replace the legacy unchecked policy with an owner policy that
-- resolves ownership through Subject.userId and carries WITH CHECK.
DROP POLICY IF EXISTS "Users manage own subject nodes" ON "SubjectNode";
CREATE POLICY "subject_node_user_policy" ON "SubjectNode"
  FOR ALL TO public
  USING ("subjectId" IN (SELECT s.id FROM "Subject" s WHERE (s."userId")::text = (auth.uid())::text OR s."userId" = COALESCE((auth.jwt() ->> 'userId')::integer, 0)))
  WITH CHECK ("subjectId" IN (SELECT s.id FROM "Subject" s WHERE (s."userId")::text = (auth.uid())::text OR s."userId" = COALESCE((auth.jwt() ->> 'userId')::integer, 0)));

-- Drop the legacy unchecked dashboard policies (superseded by the *_user_policy
-- set, which already carries USING + WITH CHECK).
DROP POLICY IF EXISTS "Users manage own quests" ON "Quest";
DROP POLICY IF EXISTS "Users manage own subjects" ON "Subject";
