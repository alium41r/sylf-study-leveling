-- Planning Studio (planning kernel). Additive only: no existing table, row or guard changes. The old planner keeps working beside it.

-- CreateTable
CREATE TABLE "PlanningSpace" (
    "id" UUID NOT NULL,
    "userId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "autonomy" TEXT NOT NULL DEFAULT 'SMART',
    "workModel" JSONB NOT NULL,
    "settings" JSONB NOT NULL,
    "calibration" JSONB,
    "lastRepairAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanningSpace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanVersion" (
    "id" UUID NOT NULL,
    "spaceId" UUID NOT NULL,
    "userId" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PROPOSED',
    "source" TEXT NOT NULL,
    "workflow" TEXT NOT NULL,
    "baseVersion" INTEGER NOT NULL,
    "sequence" INTEGER,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "commitKey" TEXT,
    "request" JSONB,
    "operations" JSONB NOT NULL,
    "workModel" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "diff" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "verification" JSONB NOT NULL,
    "trace" JSONB NOT NULL,
    "versions" JSONB NOT NULL,
    "undoOf" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committedAt" TIMESTAMP(3),

    CONSTRAINT "PlanVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanBlock" (
    "id" UUID NOT NULL,
    "spaceId" UUID NOT NULL,
    "userId" INTEGER NOT NULL,
    "blockKey" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "questId" INTEGER,
    "localDate" TEXT NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'COMMITTED',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdVersion" INTEGER NOT NULL,
    "removedVersion" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanItemQuest" (
    "id" UUID NOT NULL,
    "spaceId" UUID NOT NULL,
    "userId" INTEGER NOT NULL,
    "itemKey" TEXT NOT NULL,
    "questId" INTEGER,
    "createdVersion" INTEGER NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanItemQuest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanningSpace_userId_key" ON "PlanningSpace"("userId");
CREATE UNIQUE INDEX "PlanVersion_spaceId_key_key" ON "PlanVersion"("spaceId", "key");
CREATE UNIQUE INDEX "PlanVersion_spaceId_sequence_key" ON "PlanVersion"("spaceId", "sequence");
CREATE INDEX "PlanVersion_spaceId_state_createdAt_idx" ON "PlanVersion"("spaceId", "state", "createdAt");
CREATE INDEX "PlanBlock_spaceId_removedVersion_localDate_idx" ON "PlanBlock"("spaceId", "removedVersion", "localDate");
CREATE INDEX "PlanBlock_userId_localDate_idx" ON "PlanBlock"("userId", "localDate");
CREATE INDEX "PlanBlock_questId_idx" ON "PlanBlock"("questId");
CREATE UNIQUE INDEX "PlanItemQuest_questId_key" ON "PlanItemQuest"("questId");
CREATE UNIQUE INDEX "PlanItemQuest_spaceId_itemKey_key" ON "PlanItemQuest"("spaceId", "itemKey");
-- A block key is unique among a space's live blocks; removed blocks stay as history.
CREATE UNIQUE INDEX "PlanBlock_live_key" ON "PlanBlock"("spaceId", "blockKey") WHERE "removedVersion" IS NULL;

-- AddForeignKey
ALTER TABLE "PlanningSpace" ADD CONSTRAINT "PlanningSpace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanVersion" ADD CONSTRAINT "PlanVersion_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "PlanningSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanVersion" ADD CONSTRAINT "PlanVersion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanBlock" ADD CONSTRAINT "PlanBlock_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "PlanningSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanBlock" ADD CONSTRAINT "PlanBlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanBlock" ADD CONSTRAINT "PlanBlock_questId_fkey" FOREIGN KEY ("questId") REFERENCES "Quest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlanItemQuest" ADD CONSTRAINT "PlanItemQuest_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "PlanningSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanItemQuest" ADD CONSTRAINT "PlanItemQuest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanItemQuest" ADD CONSTRAINT "PlanItemQuest_questId_fkey" FOREIGN KEY ("questId") REFERENCES "Quest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Closed vocabularies and sane bounds.
ALTER TABLE "PlanningSpace" ADD CONSTRAINT planning_space_bounds CHECK ("autonomy" IN ('ASK','SMART','AUTOPILOT') AND "version" >= 0);
ALTER TABLE "PlanVersion" ADD CONSTRAINT plan_version_bounds CHECK (
  "state" IN ('PROPOSED','COMMITTED','DISCARDED','SUPERSEDED')
  AND "source" IN ('STUDENT','MODEL','REPAIR','SYSTEM','UNDO')
  AND "baseVersion" >= 0
  AND char_length("key") BETWEEN 8 AND 120
  AND (("state" = 'COMMITTED') = ("sequence" IS NOT NULL))
  AND (("state" = 'COMMITTED') = ("committedAt" IS NOT NULL))
);
ALTER TABLE "PlanBlock" ADD CONSTRAINT plan_block_bounds CHECK (
  "state" IN ('COMMITTED','DONE','MISSED','SKIPPED')
  AND "startMinute" >= 0 AND "endMinute" <= 1440 AND "endMinute" > "startMinute"
  AND "endsAt" > "startsAt"
  AND "localDate" ~ '^\d{4}-\d{2}-\d{2}$'
);

-- Ownership: every row belongs to the space's owner, and a linked quest belongs to that owner too.
CREATE FUNCTION public.planning_kernel_owner_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE owner_id int;
BEGIN
  SELECT "userId" INTO owner_id FROM "PlanningSpace" WHERE id = NEW."spaceId";
  IF owner_id IS NULL OR owner_id <> NEW."userId" THEN
    RAISE EXCEPTION 'PLANNING_OWNERSHIP' USING ERRCODE = '23514';
  END IF;
  -- Nested on purpose: PL/pgSQL does not short-circuit AND, and PlanVersion rows have no questId.
  IF TG_TABLE_NAME IN ('PlanBlock','PlanItemQuest') THEN
    IF NEW."questId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Quest" WHERE id = NEW."questId" AND "userId" = NEW."userId") THEN
      RAISE EXCEPTION 'PLANNING_OWNERSHIP' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'PlanVersion' AND TG_OP = 'UPDATE' THEN
    -- A committed or closed version is history. Only a proposal may change, and only its state and commit receipt.
    IF OLD."state" <> 'PROPOSED' THEN
      RAISE EXCEPTION 'PLANNING_VERSION_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
    IF ROW(NEW."spaceId", NEW."userId", NEW."source", NEW."workflow", NEW."baseVersion", NEW."key", NEW."requestHash", NEW."operations", NEW."workModel", NEW."result", NEW."diff")
       IS DISTINCT FROM ROW(OLD."spaceId", OLD."userId", OLD."source", OLD."workflow", OLD."baseVersion", OLD."key", OLD."requestHash", OLD."operations", OLD."workModel", OLD."result", OLD."diff") THEN
      RAISE EXCEPTION 'PLANNING_VERSION_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER planning_space_version_owner BEFORE INSERT OR UPDATE ON "PlanVersion" FOR EACH ROW EXECUTE FUNCTION public.planning_kernel_owner_guard();
CREATE TRIGGER planning_space_block_owner BEFORE INSERT OR UPDATE ON "PlanBlock" FOR EACH ROW EXECUTE FUNCTION public.planning_kernel_owner_guard();
CREATE TRIGGER planning_space_item_owner BEFORE INSERT OR UPDATE ON "PlanItemQuest" FOR EACH ROW EXECUTE FUNCTION public.planning_kernel_owner_guard();
REVOKE ALL ON FUNCTION public.planning_kernel_owner_guard() FROM PUBLIC, anon, authenticated, service_role;

-- Private planner storage: the server reaches it through Prisma; clients never do.
ALTER TABLE "PlanningSpace" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlanVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlanBlock" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlanItemQuest" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "PlanningSpace", "PlanVersion", "PlanBlock", "PlanItemQuest" FROM PUBLIC, anon, authenticated, service_role;
