// The catalogs a student reads in Progress: how Sylf works, and the milestones. Separate from ./index so an app that never opens them evaluates none of
// it at start, and the Codex's text is the web's own, from the same file, with no copy. tooling/checks/check-boundaries.mjs audits this file with the
// same rules as ./index, and requires screens to reach it only through import().
export { ARCHIVE_ENTRIES } from "../../../../lib/archive-catalog";
export type { ArchiveCategory, ArchiveEntry, ContentBlock, UnlockRequirement } from "../../../../lib/archive-catalog";
export { ACHIEVEMENT_CATEGORIES, ACHIEVEMENTS_CATALOG, rankTitle } from "../../../../lib/achievements-catalog";
export type { AchievementCategory, Rarity } from "../../../../lib/achievements-catalog";
export { RANK_LADDER } from "../../../../lib/game-engine";
