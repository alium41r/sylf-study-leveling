-- ============================================================================
-- Focus Timer Background Catalog & Studio — Phase 1 Database Migration
-- ============================================================================
-- Implements:
--   1. Add isAdmin flag to public."User"
--   2. FocusBackgroundCategory table (slug, layoutKey, sortOrder, isActive)
--   3. FocusBackground table (storagePath, dimensions, aspectRatio, focal point)
--   4. Foreign keys, indexes, and cascades
--   5. Seed initial 'Classic Sylf' category
--   6. Supabase Storage bucket 'focus-backgrounds' provisioning with RLS
-- ============================================================================

-- 1. Add isAdmin column to User if not present
ALTER TABLE public."User"
ADD COLUMN IF NOT EXISTS "isAdmin" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "User_isAdmin_idx" ON public."User" ("isAdmin");

-- 2. Create FocusBackgroundCategory Table
CREATE TABLE IF NOT EXISTS public."FocusBackgroundCategory" (
  "id" SERIAL NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "layoutKey" TEXT NOT NULL DEFAULT 'classic',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FocusBackgroundCategory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FocusBackgroundCategory_slug_key" UNIQUE ("slug")
);

-- 3. Create FocusBackground Table
CREATE TABLE IF NOT EXISTS public."FocusBackground" (
  "id" SERIAL NOT NULL,
  "categoryId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "storagePath" TEXT NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "aspectRatio" DOUBLE PRECISION NOT NULL,
  "focalX" DOUBLE PRECISION DEFAULT 0.5,
  "focalY" DOUBLE PRECISION DEFAULT 0.5,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FocusBackground_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FocusBackground_categoryId_fkey" FOREIGN KEY ("categoryId")
    REFERENCES public."FocusBackgroundCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FocusBackground_dimensions_positive" CHECK ("width" > 0 AND "height" > 0),
  CONSTRAINT "FocusBackground_focal_bounds" CHECK (
    ("focalX" IS NULL OR ("focalX" >= 0.0 AND "focalX" <= 1.0)) AND
    ("focalY" IS NULL OR ("focalY" >= 0.0 AND "focalY" <= 1.0))
  )
);

-- 4. Indexes for optimal catalog retrieval & sorting
CREATE INDEX IF NOT EXISTS "FocusBackground_categoryId_idx"
  ON public."FocusBackground" ("categoryId");

CREATE INDEX IF NOT EXISTS "FocusBackground_categoryId_sortOrder_idx"
  ON public."FocusBackground" ("categoryId", "sortOrder");

CREATE INDEX IF NOT EXISTS "FocusBackgroundCategory_sortOrder_idx"
  ON public."FocusBackgroundCategory" ("sortOrder");

-- 5. Seed Initial 'Classic Sylf' category
INSERT INTO public."FocusBackgroundCategory" ("slug", "name", "description", "layoutKey", "sortOrder", "isActive")
VALUES (
  'classic-sylf',
  'Classic Sylf',
  'The iconic original Sylf study environment with central focus ring and obsidian ambient styling',
  'classic',
  0,
  true
)
ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "layoutKey" = EXCLUDED."layoutKey";

-- Seed foundational roadmap categories for studio organization
INSERT INTO public."FocusBackgroundCategory" ("slug", "name", "description", "layoutKey", "sortOrder", "isActive")
VALUES
  ('anime', 'Anime', 'Vibrant anime study sanctums with negative space optimized for off-center timer placement', 'anime', 1, true),
  ('landscapes', 'Landscapes', 'Restrained, panoramic cinematic natural wonders with low-profile minimal HUD', 'landscape', 2, true),
  ('fantasy', 'Fantasy', 'Ancient libraries, ethereal spires, and mystical scholar sanctuaries', 'fantasy', 3, true)
ON CONFLICT ("slug") DO NOTHING;

-- 6. Supabase Storage bucket provisioning (if storage schema exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'storage') THEN
    INSERT INTO storage.buckets ("id", "name", "public", "file_size_limit", "allowed_mime_types")
    VALUES (
      'focus-backgrounds',
      'focus-backgrounds',
      true,
      15728640, -- 15MB
      ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    )
    ON CONFLICT ("id") DO UPDATE SET
      "public" = EXCLUDED."public",
      "file_size_limit" = EXCLUDED."file_size_limit",
      "allowed_mime_types" = EXCLUDED."allowed_mime_types";

    -- Ensure RLS policy for public read on focus-backgrounds bucket
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage'
        AND tablename = 'objects'
        AND policyname = 'Public Read Access for Focus Backgrounds'
    ) THEN
      CREATE POLICY "Public Read Access for Focus Backgrounds"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'focus-backgrounds');
    END IF;
  END IF;
END $$;
