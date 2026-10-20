ALTER TABLE "CalendarEvent"
  ADD COLUMN "category" TEXT NOT NULL DEFAULT 'personal',
  ADD COLUMN "recurrence" JSONB,
  ADD COLUMN "recurrenceThrough" TEXT,
  ADD COLUMN "reminders" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  ADD COLUMN "lastMutationId" TEXT,
  ADD COLUMN "lastMutationHash" TEXT;
CREATE INDEX "CalendarEvent_userId_recurrenceThrough_startDate_idx" ON "CalendarEvent"("userId", "recurrenceThrough", "startDate");
CREATE TABLE "CalendarEventException" (
  "eventId" TEXT NOT NULL REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "originalDate" TEXT NOT NULL, "cancelled" BOOLEAN NOT NULL DEFAULT false, "data" JSONB,
  "startDate" TEXT NOT NULL, "endDate" TEXT NOT NULL,
  PRIMARY KEY ("eventId", "originalDate"),
  CONSTRAINT "CalendarEventException_content_check" CHECK ("cancelled" OR "data" IS NOT NULL)
);
CREATE INDEX "CalendarEventException_startDate_endDate_idx" ON "CalendarEventException"("startDate", "endDate");
CREATE TABLE "CalendarReminderReceipt" (
  "eventId" TEXT NOT NULL REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "key" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("eventId", "key")
);
CREATE INDEX "CalendarReminderReceipt_createdAt_idx" ON "CalendarReminderReceipt"("createdAt");
ALTER TABLE "CalendarEventException" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CalendarReminderReceipt" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "CalendarPreference" (
  "userId" INTEGER PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "settings" JSONB NOT NULL, "revision" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "CalendarPreference_revision_check" CHECK ("revision" > 0)
);
ALTER TABLE "CalendarPreference" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "CalendarEventException", "CalendarReminderReceipt", "CalendarPreference" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "CalendarEventException", "CalendarReminderReceipt", "CalendarPreference" FROM authenticated;
  END IF;
END $$;
