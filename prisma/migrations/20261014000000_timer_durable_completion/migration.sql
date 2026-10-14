-- Creation identities survive response loss, app restarts and completed rows.
CREATE TABLE public."TimerSessionStart" (
  "userId" INTEGER NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  "clientKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "sessionId" INTEGER NOT NULL REFERENCES public."StudySession"(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("userId", "clientKey")
);
CREATE INDEX "TimerSessionStart_sessionId_idx" ON public."TimerSessionStart"("sessionId");
ALTER TABLE public."TimerSessionStart" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."TimerSessionStart" FROM PUBLIC, anon, authenticated;

-- Preserve the canonical settlement owner, fixing terminality and zero-delta rewards.
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
    v_effective_end TIMESTAMP := LEAST(NOW(), COALESCE(NULLIF(current_setting('sylf.timer_effective_end', true), '')::timestamp, NOW()));
    v_linked_quest INT;
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
    v_level_up_sp INT := 0;
    v_rank_up_sp INT := 0;
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
  PERFORM pg_advisory_xact_lock(73641,p_user_id);
  IF EXISTS (SELECT 1 FROM "StudySession" WHERE id=p_session_id AND "userId"=p_user_id AND "executionState" IS NOT NULL)
    AND current_setting('sylf.planner_v2_session_transition',true) IS DISTINCT FROM p_session_id::text THEN
    RAISE EXCEPTION 'PLANNER_EXECUTION_PROTOCOL_REQUIRED' USING ERRCODE='23514'; END IF;
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
        SELECT "userId", "durationSeconds", "breakSeconds", "rewardsClaimed", "startedAt", "questId"
        INTO v_session_owner, v_previous_seconds, v_previous_break, v_claimed, v_started_at, v_linked_quest
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
        IF p_quest_id IS DISTINCT FROM v_linked_quest THEN
            RAISE EXCEPTION 'Session quest does not match' USING ERRCODE = '42501';
        END IF;
        -- A final receipt is terminal: late heartbeats/retries cannot change
        -- time, rewards, quest progress or the original end timestamp.
        IF v_claimed THEN
            RETURN jsonb_build_object('success', TRUE, 'sessionId', v_session_id,
                'isFinal', TRUE, 'alreadyClaimed', TRUE, 'durationSeconds', v_previous_seconds,
                'breakSeconds', v_previous_break, 'deltaSeconds', 0, 'awarded', FALSE,
                'xpGained', 0, 'sylphGained', 0, 'questCompleted', FALSE);
        END IF;
        v_effective_end := GREATEST(v_started_at, v_effective_end);
        v_previous_seconds := COALESCE(v_previous_seconds, 0);
        v_previous_break := COALESCE(v_previous_break, 0);

        -- Server-side wall-clock clamp: cumulative focus can never exceed the
        -- (possibly backdated) session window + 60s grace. Because the stored
        -- duration is monotonic, a clamped flush can never regress data —
        -- it simply credits nothing until real time catches up.
        v_wall_seconds := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (v_effective_end - v_started_at))));
        v_actual_seconds := GREATEST(v_previous_seconds, LEAST(v_actual_seconds, GREATEST(0, v_wall_seconds + 60 - v_previous_break)));
        v_break_seconds := GREATEST(v_previous_break, LEAST(v_break_seconds, GREATEST(0, v_wall_seconds + 60 - v_actual_seconds)));
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
        SET "executionVersion" = CASE WHEN "executionState" IS NULL THEN "executionVersion" ELSE "executionVersion"+1 END,
            "executionState" = CASE WHEN "executionState" IS NOT NULL AND p_is_final THEN 'ENDED' ELSE "executionState" END,
            "runningSince" = CASE WHEN p_is_final THEN NULL ELSE "runningSince" END,
            "durationMinutes" = FLOOR(v_stored_seconds / 60.0),
            "durationSeconds" = v_stored_seconds,
            "breakSeconds" = GREATEST(v_break_seconds, "breakSeconds"),
            "focusRate" = v_focus_rate_actual,
            "endedAt" = CASE WHEN p_is_final THEN v_effective_end ELSE "endedAt" END,
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
        v_wall_seconds := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (v_effective_end - v_started_at))));
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
        -- Actual progress does not advance the structural execution generation.
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
                        AND NOT v_claimed;
    IF v_award_eligible AND v_stored_seconds >= 60 THEN
        v_session_minutes := v_stored_seconds / 60.0;

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
        v_should_complete := (p_complete_quest = TRUE) OR (v_quest."plannedMinutes" IS NULL AND v_quest."elapsedSeconds" >= v_target_seconds);

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
            SET "executionVersion" = CASE WHEN "plannedMinutes" IS NULL THEN "executionVersion" ELSE "executionVersion"+1 END,
              "remainingDisposition" = CASE WHEN "plannedMinutes" IS NULL THEN "remainingDisposition" ELSE 'COMPLETED' END,
              "remainingMinutesEstimate" = CASE WHEN "plannedMinutes" IS NULL THEN "remainingMinutesEstimate" ELSE 0 END,
              status = 'COMPLETED',
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

        -- SP stipend: +2 SP per level gained, +5 SP per rank up.
        v_level_up_sp := v_levels_gained * 2;
        v_rank_up_sp := CASE WHEN v_did_rank_up THEN 5 ELSE 0 END;
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
            "skillPoints" = "skillPoints" + v_level_up_sp + v_rank_up_sp,
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
            E'**Level Up**\n\nYou have reached Level ' || v_level || '.' || v_rank_up_text || E'\n\nStipend: +' || v_level_up_sylph || E' Sylph • +' || (v_level_up_sp + v_rank_up_sp) || E' SP\n\nYou have grown stronger.',
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
        'awarded', v_award_eligible AND v_stored_seconds >= 60,
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


-- Reuse the existing economic ledger for per-week replay protection.
CREATE UNIQUE INDEX "SylphLedger_weekly_mission_receipt_key" ON public."SylphLedger" ("userId", (metadata->>'weekKey'))
WHERE reason = 'WEEKLY_MISSION';

-- Focus Party timers retain their existing row/epoch owner and use the same
-- client journal for durable exits. joinedAt identifies a participation, so a
-- lost response replay cannot remove a user who has since rejoined.
-- Closed intervals let an earlier durable exit cut off time banked by an
-- already-in-flight pause/resume. This is accounting within the existing row,
-- not another delivery mechanism. Legacy accepted time becomes the base.
ALTER TABLE public."FocusSessionMember" ADD COLUMN "timerTimeline" JSONB;
CREATE OR REPLACE FUNCTION public.enter_focus_session(
  p_party_id INT,
  p_user_id INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_party RECORD;
  v_session_id INT;
  v_member RECORD;
BEGIN
  -- S2 identity guard
  IF NULLIF(current_setting('request.jwt.claims', true), '') IS NOT NULL OR NULLIF(current_setting('request.jwt.claim.sub', true), '') IS NOT NULL THEN
    IF COALESCE((auth.jwt() ->> 'sub'), NULLIF(current_setting('request.jwt.claim.sub', true), ''), '') <> p_user_id::text THEN
      RAISE EXCEPTION 'S2 identity guard: caller identity does not match p_user_id' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO v_party FROM public."FocusParty" WHERE id = p_party_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FocusParty % not found', p_party_id USING ERRCODE = '23503';
  END IF;

  IF v_party."disbandedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot enter session of a disbanded party' USING ERRCODE = 'check_violation';
  END IF;

  -- Verify user is an active party member
  IF NOT EXISTS (
    SELECT 1 FROM public."FocusPartyMember"
    WHERE "partyId" = p_party_id AND "userId" = p_user_id
  ) THEN
    RAISE EXCEPTION 'User % is not a member of party %', p_user_id, p_party_id USING ERRCODE = 'check_violation';
  END IF;

  -- Locate or create active FocusSession atomically
  SELECT id INTO v_session_id
  FROM public."FocusSession"
  WHERE "partyId" = p_party_id AND "endedAt" IS NULL
  FOR UPDATE;

  IF v_session_id IS NULL THEN
    -- Attempt insert guarded by partial unique index
    INSERT INTO public."FocusSession" ("partyId", "startedAt")
    VALUES (p_party_id, CURRENT_TIMESTAMP)
    ON CONFLICT ("partyId") WHERE "endedAt" IS NULL DO NOTHING
    RETURNING id INTO v_session_id;

    IF v_session_id IS NULL THEN
      -- Another transaction created it concurrently: fetch and lock it
      SELECT id INTO v_session_id
      FROM public."FocusSession"
      WHERE "partyId" = p_party_id AND "endedAt" IS NULL
      FOR UPDATE;
    END IF;
  END IF;

  -- Find or initialize user's FocusSessionMember participation
  SELECT * INTO v_member
  FROM public."FocusSessionMember"
  WHERE "sessionId" = v_session_id AND "userId" = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public."FocusSessionMember" (
      "sessionId", "userId", "timerState", "accumulatedSeconds", "currentStartedAt", "joinedAt", "lastHeartbeatAt"
    ) VALUES (
      v_session_id, p_user_id, 'NOT_STARTED', 0, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    RETURNING * INTO v_member;
  ELSE
    -- User previously left this active session: REJOIN
    -- Cumulative focus duration in accumulatedSeconds is strictly PRESERVED
    IF v_member."timerState" = 'LEFT' THEN
      UPDATE public."FocusSessionMember"
      SET "timerState" = CASE WHEN v_member."accumulatedSeconds" > 0 THEN 'PAUSED'::public."FocusTimerState" ELSE 'NOT_STARTED'::public."FocusTimerState" END,
          "currentStartedAt" = NULL,
          "leftAt" = NULL,
          "joinedAt" = GREATEST(CURRENT_TIMESTAMP, v_member."joinedAt" + INTERVAL '1 millisecond'),
          "timerTimeline" = jsonb_build_object('base',v_member."accumulatedSeconds",'intervals','[]'::jsonb),
          "lastHeartbeatAt" = CURRENT_TIMESTAMP
      WHERE id = v_member.id
      RETURNING * INTO v_member;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'sessionId', v_session_id,
    'partyId', p_party_id,
    'userId', p_user_id,
    'timerState', v_member."timerState",
    'accumulatedSeconds', v_member."accumulatedSeconds",
    'currentStartedAt', v_member."currentStartedAt"
  );
END;
$$;
CREATE OR REPLACE FUNCTION public.pause_focus_timer(
  p_session_id INT,
  p_user_id INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session RECORD;
  v_member RECORD;
  v_elapsed INT := 0;
BEGIN
  -- S2 identity guard
  IF NULLIF(current_setting('request.jwt.claims', true), '') IS NOT NULL OR NULLIF(current_setting('request.jwt.claim.sub', true), '') IS NOT NULL THEN
    IF COALESCE((auth.jwt() ->> 'sub'), NULLIF(current_setting('request.jwt.claim.sub', true), ''), '') <> p_user_id::text THEN
      RAISE EXCEPTION 'S2 identity guard: caller identity does not match p_user_id' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO v_session FROM public."FocusSession" WHERE id = p_session_id;
  IF NOT FOUND OR v_session."endedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'Focus session is not active' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_member
  FROM public."FocusSessionMember"
  WHERE "sessionId" = p_session_id AND "userId" = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User is not in this focus session' USING ERRCODE = 'check_violation';
  END IF;

  IF v_member."timerState" = 'LEFT' THEN
    RAISE EXCEPTION 'User has left the focus session' USING ERRCODE = 'check_violation';
  END IF;

  IF v_member."timerState" = 'NOT_STARTED' THEN
    RAISE EXCEPTION 'Cannot pause a timer that has not been started' USING ERRCODE = 'check_violation';
  END IF;

  IF v_member."timerState" = 'PAUSED' THEN
    -- Idempotent
    RETURN jsonb_build_object(
      'success', true,
      'timerState', v_member."timerState",
      'accumulatedSeconds', v_member."accumulatedSeconds",
      'currentStartedAt', v_member."currentStartedAt"
    );
  END IF;

  IF v_member."timerState" = 'FOCUSING' AND v_member."currentStartedAt" IS NOT NULL THEN
    -- Bank the complete authoritative interval, matching local epoch display.
    v_elapsed := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - v_member."currentStartedAt"))))::int;
  END IF;

  UPDATE public."FocusSessionMember"
  SET "timerState" = 'PAUSED',
      "accumulatedSeconds" = v_member."accumulatedSeconds" + v_elapsed,
      "timerTimeline" = CASE WHEN v_member."currentStartedAt" IS NULL THEN v_member."timerTimeline" ELSE
        jsonb_set(COALESCE(v_member."timerTimeline",jsonb_build_object('base',v_member."accumulatedSeconds",'intervals','[]'::jsonb)),
          '{intervals}',COALESCE(v_member."timerTimeline"->'intervals','[]'::jsonb) ||
            jsonb_build_array(jsonb_build_object('start',v_member."currentStartedAt",'end',CURRENT_TIMESTAMP))) END,
      "currentStartedAt" = NULL,
      "lastHeartbeatAt" = CURRENT_TIMESTAMP
  WHERE id = v_member.id
  RETURNING * INTO v_member;

  RETURN jsonb_build_object(
    'success', true,
    'sessionId', p_session_id,
    'userId', p_user_id,
    'timerState', v_member."timerState",
    'accumulatedSeconds', v_member."accumulatedSeconds",
    'currentStartedAt', v_member."currentStartedAt"
  );
END;
$$;
CREATE OR REPLACE FUNCTION public.leave_focus_session(
  p_session_id INT,
  p_user_id INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member RECORD;
  v_boundary TIMESTAMP := LEAST(CURRENT_TIMESTAMP, COALESCE(NULLIF(current_setting('sylf.party_exit_at',true),'')::timestamp, CURRENT_TIMESTAMP));
  v_elapsed INT := 0;
  v_new_accumulated INT;
  v_closed INT := 0;
  v_remaining_participants INT;
BEGIN
  -- S2 identity guard
  IF NULLIF(current_setting('request.jwt.claims', true), '') IS NOT NULL OR NULLIF(current_setting('request.jwt.claim.sub', true), '') IS NOT NULL THEN
    IF COALESCE((auth.jwt() ->> 'sub'), NULLIF(current_setting('request.jwt.claim.sub', true), ''), '') <> p_user_id::text THEN
      RAISE EXCEPTION 'S2 identity guard: caller identity does not match p_user_id' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Session-first locking serializes all departures. Two members leaving in
  -- parallel can no longer both observe another member and leave a zombie room.
  PERFORM 1 FROM public."FocusSession" WHERE id=p_session_id FOR UPDATE;
  SELECT * INTO v_member
  FROM public."FocusSessionMember"
  WHERE "sessionId" = p_session_id AND "userId" = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'notFound', true);
  END IF;

  IF NULLIF(current_setting('sylf.party_exit_joined_at',true),'') IS NOT NULL
    AND v_member."joinedAt" IS DISTINCT FROM current_setting('sylf.party_exit_joined_at',true)::timestamp THEN
    RETURN jsonb_build_object('success',true,'sessionId',p_session_id,'alreadyLeft',true,'supersededParticipation',true);
  END IF;
  v_boundary := GREATEST(v_member."joinedAt", v_boundary);
  IF v_member."timerState" = 'LEFT' THEN
    -- Idempotent
    RETURN jsonb_build_object(
      'success', true,
      'sessionId', p_session_id,
      'userId', p_user_id,
      'accumulatedSeconds', v_member."accumulatedSeconds",
      'alreadyLeft', true
    );
  END IF;

  -- If currently focusing, bank through the original exit boundary
  IF v_member."timerState" = 'FOCUSING' AND v_member."currentStartedAt" IS NOT NULL THEN
    v_elapsed := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (v_boundary - v_member."currentStartedAt"))))::int;
  END IF;

  v_new_accumulated := v_member."accumulatedSeconds" + v_elapsed;
  IF v_member."timerTimeline" IS NOT NULL THEN
    SELECT COALESCE(sum(GREATEST(0,FLOOR(EXTRACT(EPOCH FROM
      (LEAST(v_boundary,(stretch->>'end')::timestamp)-(stretch->>'start')::timestamp))))),0)::int INTO v_closed
    FROM jsonb_array_elements(v_member."timerTimeline"->'intervals') AS stretch;
    v_new_accumulated := (v_member."timerTimeline"->>'base')::int + v_closed + v_elapsed;
  END IF;

  UPDATE public."FocusSessionMember"
  SET "timerState" = 'LEFT',
      "accumulatedSeconds" = v_new_accumulated,
      "currentStartedAt" = NULL,
      "leftAt" = v_boundary,
      "timerTimeline" = NULL,
      "lastHeartbeatAt" = CURRENT_TIMESTAMP
  WHERE id = v_member.id;

  -- Check if ANY participants remain in the session (paused users still count as participants)
  SELECT count(*) INTO v_remaining_participants
  FROM public."FocusSessionMember"
  WHERE "sessionId" = p_session_id AND "timerState" <> 'LEFT';

  IF v_remaining_participants = 0 THEN
    -- Finalize and close the session
    UPDATE public."FocusSession"
    SET "endedAt" = (SELECT MAX("leftAt") FROM public."FocusSessionMember" WHERE "sessionId"=p_session_id)
    WHERE id = p_session_id AND "endedAt" IS NULL;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'sessionId', p_session_id,
    'userId', p_user_id,
    'accumulatedSeconds', v_new_accumulated,
    'remainingParticipants', v_remaining_participants,
    'sessionEnded', (v_remaining_participants = 0)
  );
END;
$$;
CREATE OR REPLACE FUNCTION public.leave_focus_session(p_session_id INT,p_user_id INT,p_joined_at TIMESTAMP,p_ended_at TIMESTAMP)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result JSONB;
  previous_exit TEXT := COALESCE(current_setting('sylf.party_exit_at',true),'');
  previous_join TEXT := COALESCE(current_setting('sylf.party_exit_joined_at',true),'');
BEGIN
  IF p_ended_at > CURRENT_TIMESTAMP + INTERVAL '60 seconds' THEN
    RAISE EXCEPTION 'Invalid focus room exit time' USING ERRCODE='22023';
  END IF;
  PERFORM set_config('sylf.party_exit_at',p_ended_at::text,true);
  PERFORM set_config('sylf.party_exit_joined_at',p_joined_at::text,true);
  result := public.leave_focus_session(p_session_id,p_user_id);
  PERFORM set_config('sylf.party_exit_at',previous_exit,true);
  PERFORM set_config('sylf.party_exit_joined_at',previous_join,true);
  RETURN result;
END $$;

-- Mutating timer RPCs are backend capabilities. Cookie authorization and
-- resource ownership live in the HTTP handlers; public/JWT clients may not
-- call SECURITY DEFINER economic or party operations with a forged owner.
DO $$ DECLARE operation regprocedure;
BEGIN
  FOR operation IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('start_study_session','settle_study_session_atomic','complete_study_session','claim_session_reward_atomic',
      'create_focus_party','join_focus_party','leave_focus_party','kick_focus_member','enter_focus_session','start_focus_timer','pause_focus_timer','resume_focus_timer','leave_focus_session','get_focus_party_state')
  LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role',operation); END LOOP;
END $$;
