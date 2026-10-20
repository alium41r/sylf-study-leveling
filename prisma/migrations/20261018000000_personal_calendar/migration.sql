-- Personal calendar content. Browser access uses Sylf cookie-authenticated APIs,
-- never Supabase auth.uid(): Sylf's canonical owner is User.id (integer).
CREATE TABLE "CalendarEvent" (
  "id" TEXT PRIMARY KEY, "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "title" TEXT NOT NULL, "description" TEXT NOT NULL DEFAULT '', "color" TEXT NOT NULL DEFAULT 'VIOLET',
  "allDay" BOOLEAN NOT NULL DEFAULT false, "startDate" TEXT NOT NULL, "endDate" TEXT NOT NULL,
  "startsAt" TIMESTAMPTZ(3), "endsAt" TIMESTAMPTZ(3), "timezone" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CalendarEvent_range_check" CHECK (
    ("allDay" AND "startsAt" IS NULL AND "endsAt" IS NULL AND "endDate" > "startDate") OR
    (NOT "allDay" AND "startsAt" IS NOT NULL AND "endsAt" IS NOT NULL AND "endsAt" > "startsAt")
  ),
  CONSTRAINT "CalendarEvent_revision_check" CHECK ("revision" > 0)
);
CREATE INDEX "CalendarEvent_userId_startDate_endDate_idx" ON "CalendarEvent"("userId", "startDate", "endDate");
CREATE INDEX "CalendarEvent_userId_startsAt_endsAt_idx" ON "CalendarEvent"("userId", "startsAt", "endsAt");
CREATE TABLE "CalendarNote" (
  "id" TEXT PRIMARY KEY, "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "dateKey" TEXT NOT NULL, "title" TEXT NOT NULL DEFAULT '', "document" JSONB NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CalendarNote_revision_check" CHECK ("revision" > 0)
);
CREATE INDEX "CalendarNote_userId_dateKey_createdAt_idx" ON "CalendarNote"("userId", "dateKey", "createdAt");
ALTER TABLE "CalendarEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CalendarNote" ENABLE ROW LEVEL SECURITY;
-- No public policies: only the backend database role can access these tables.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "CalendarEvent", "CalendarNote" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "CalendarEvent", "CalendarNote" FROM authenticated;
  END IF;
END $$;
