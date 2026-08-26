-- ============================================================
-- Reconcile levels/ranks from lifetime XP (post-curve-fix repair)
-- ============================================================
-- The bucket fix (20260826000000) changed the level-1 bucket from 282 → 182,
-- but level up only happens inside the session-flush RPC. Users who had
-- already accumulated >182 XP into level 1 (e.g. 195) are now "over the bar":
-- they should already be a higher level (lifetime XP 295 → level 2),
-- not level 1 showing "195 / 182".
--
-- This reconciles EVERY user's level, rank, currentXP and xpToNextLevel from
-- their canonical lifetime XP (UserStats.xp) using the same formulas the RPC
-- uses, so the dashboard and profile never show >100% progress.
--
-- UserStats.xp is authoritative lifetime XP in the new convention:
--   lifetime = canonical_required_xp(level) + currentXP  (level 1 → 100 + XP)
--   level    = canonical_level_from_xp(lifetime)
--   currentXP = lifetime − canonical_required_xp(level)   (clamped ≥ 0)
--   next     = canonical_xp_for_next_level(level)

-- Recompute User.level / currentXP / xpToNextLevel / hunterRank.
WITH derived AS (
    SELECT us."userId" AS uid,
           public.canonical_level_from_xp(GREATEST(0, us.xp)) AS new_level,
           GREATEST(0, us.xp - public.canonical_required_xp(
               public.canonical_level_from_xp(GREATEST(0, us.xp)))) AS into_xp
    FROM "UserStats" us
)
UPDATE "User" u
SET level          = d.new_level,
    "currentXP"    = d.into_xp,
    "xpToNextLevel" = public.canonical_xp_for_next_level(d.new_level),
    "hunterRank"    = public.canonical_rank_display(d.new_level)
FROM derived d
WHERE u.id = d.uid;

-- Recompute UserStats.level / rank (xp stays as the lifetime total).
UPDATE "UserStats" us
SET level       = public.canonical_level_from_xp(GREATEST(0, us.xp)),
    rank        = public.canonical_rank_db(public.canonical_level_from_xp(GREATEST(0, us.xp))),
    "updatedAt" = CURRENT_TIMESTAMP;
