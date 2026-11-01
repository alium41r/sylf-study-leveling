-- Phase 12, finding P-5: the open-session lookup and the flood guard filter a student's whole history. Partial, so it stays small.
-- Prisma's schema language cannot express a partial index, so this lives only here. `db push` would offer to drop it: use migrations.
-- A plain CREATE INDEX blocks writes to StudySession while it builds. On a large hosted table, build it first with CONCURRENTLY, outside a
-- transaction, and this statement then does nothing.
-- Rollback: DROP INDEX IF EXISTS public."StudySession_userId_open_idx";
CREATE INDEX IF NOT EXISTS "StudySession_userId_open_idx" ON public."StudySession"("userId") WHERE "endedAt" IS NULL;
