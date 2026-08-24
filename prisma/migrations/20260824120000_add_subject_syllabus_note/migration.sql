-- Add free-text book / syllabus details to subjects (used by the AI
-- syllabus dissection engine).
ALTER TABLE "Subject" ADD COLUMN "syllabusNote" TEXT;
