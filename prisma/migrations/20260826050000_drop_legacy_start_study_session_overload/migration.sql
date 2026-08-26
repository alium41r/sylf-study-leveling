-- ============================================================
-- Drop the legacy 3-argument start_study_session overload.
-- ============================================================
-- The previous agent created start_study_session directly in the live DB
-- (never captured in a migration). Migration 20260826040000 captured it
-- WITH the new p_initial_seconds parameter, which produced a SECOND
-- overload (Postgres treats the defaulted 4-arg signature as distinct
-- from the exact 3-arg one). Ambiguous 3-arg calls would resolve to the
-- legacy version, which lacks startedAt backdating. Drop it so only the
-- migrated 4-arg function remains (3-arg calls fall through its DEFAULT).
-- ============================================================

DROP FUNCTION IF EXISTS public.start_study_session(integer, integer, integer);
