-- Search terms for the shared syllabus library, so a request finds the few entries that might be its syllabus with one indexed lookup instead of a
-- pass over every entry. Terms come from lib/planner/kernel `syllabusTerms`; rows saved before this migration are indexed by the server on first
-- search. Additive only.

-- AlterTable
ALTER TABLE "SyllabusOutline" ADD COLUMN     "terms" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "SyllabusOutline_terms_idx" ON "SyllabusOutline" USING GIN ("terms");
