-- Pixel Studio creations: what a scholar draws.
--
-- A dedicated table rather than a field in `characterConfig`, because a creation
-- is artwork (up to 64 KB of authored frames) and `characterConfig` is read on
-- every stats fetch, by `useDashboardData`, and inside conversation and profile
-- payloads. A scholar's drawing must not travel with all of those.
--
-- The artwork itself is a versioned JSON document: frames are a small,
-- self-contained, always-read-together value whose shape is owned by the Pixel
-- Display contract, so normalising it would spread a content format across the
-- schema and make every future version bump a migration.

-- CreateTable
CREATE TABLE "PixelCreation" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "grid" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PixelCreation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PixelCreation_userId_updatedAt_idx" ON "PixelCreation"("userId", "updatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "PixelCreation_userId_slug_key" ON "PixelCreation"("userId", "slug");

-- AddForeignKey
ALTER TABLE "PixelCreation" ADD CONSTRAINT "PixelCreation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
