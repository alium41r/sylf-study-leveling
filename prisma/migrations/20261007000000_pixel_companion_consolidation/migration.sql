-- Additive: document format version is independent of optimistic content revision.
ALTER TABLE "PixelCreation" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "PixelCreation" ADD CONSTRAINT "PixelCreation_revision_positive" CHECK ("revision" > 0);
ALTER TABLE "PixelCreation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY pixel_creation_owner ON "PixelCreation" FOR ALL TO authenticated
  USING ("userId" = COALESCE((auth.jwt() ->> 'userId')::integer, 0))
  WITH CHECK ("userId" = COALESCE((auth.jwt() ->> 'userId')::integer, 0));
-- Keep API-only access. The policy is defense in depth if grants change later.
REVOKE ALL ON TABLE "PixelCreation" FROM anon, authenticated;
