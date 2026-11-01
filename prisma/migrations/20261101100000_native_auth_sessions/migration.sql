-- Phase 12, ADR 0009: a native sign-in is an AuthSession row. Nullable columns only, so existing rows and the web keep working untouched.
-- NULL `kind` means a browser session from before this migration. `tokenVersion` is the account version the refresh token was issued
-- against, because a refresh token is opaque and has to fail when the account's version moves, even if nothing ended this row.
--
-- The table comes from `db push`, not from this history, so every statement is idempotent: the disposable harness builds the table from
-- the final schema before it replays migrations, and a hosted database has it already.
--
-- Rollback, once no native client depends on it, and only by the owner:
--   ALTER TABLE public."AuthSession" DROP CONSTRAINT IF EXISTS "AuthSession_kind_check";
--   DROP INDEX IF EXISTS public."AuthSession_refreshHash_key";
--   ALTER TABLE public."AuthSession" DROP COLUMN IF EXISTS "kind", DROP COLUMN IF EXISTS "refreshHash", DROP COLUMN IF EXISTS "previousRefreshHash",
--     DROP COLUMN IF EXISTS "rotatedAt", DROP COLUMN IF EXISTS "clientName", DROP COLUMN IF EXISTS "tokenVersion";
ALTER TABLE public."AuthSession"
  ADD COLUMN IF NOT EXISTS "kind" TEXT,
  ADD COLUMN IF NOT EXISTS "refreshHash" TEXT,
  ADD COLUMN IF NOT EXISTS "previousRefreshHash" TEXT,
  ADD COLUMN IF NOT EXISTS "rotatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "clientName" TEXT,
  ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER;

DO $$ BEGIN
  ALTER TABLE public."AuthSession" ADD CONSTRAINT "AuthSession_kind_check" CHECK ("kind" IS NULL OR "kind" IN ('BROWSER', 'NATIVE'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "AuthSession_refreshHash_key" ON public."AuthSession"("refreshHash");
