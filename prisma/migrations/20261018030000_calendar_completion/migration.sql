-- Phase 6: optional event-only collaboration and bounded derived recognition/search.
ALTER TABLE "CalendarEvent" ADD COLUMN "sharedCalendarId" TEXT;
ALTER TABLE "CalendarNote" ADD COLUMN "searchVector" tsvector;
ALTER TABLE "CalendarNote" ADD COLUMN "previewText" TEXT GENERATED ALWAYS AS (left(coalesce("document"->>'text',''),240)) STORED;
ALTER TABLE "CalendarNote" ADD COLUMN "hasInk" BOOLEAN GENERATED ALWAYS AS (CASE WHEN jsonb_typeof("document"->'ink'->'strokes')='array' THEN jsonb_array_length("document"->'ink'->'strokes')>0 ELSE false END) STORED;
ALTER TABLE "CalendarNote" ADD COLUMN "documentMode" TEXT GENERATED ALWAYS AS (coalesce("document"->>'mode','note')) STORED;
CREATE TABLE "SharedCalendar" (
    "id" TEXT NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SharedCalendar_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SharedCalendarMember" (
    "calendarId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'VIEWER',
    "status" TEXT NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "SharedCalendarMember_pkey" PRIMARY KEY ("calendarId","userId")
);

CREATE TABLE "CalendarNoteRecognition" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "selectionKey" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "strokeIds" JSONB NOT NULL,
    "text" TEXT NOT NULL,
    "engine" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarNoteRecognition_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SharedCalendar_ownerId_idx" ON "SharedCalendar"("ownerId");

CREATE INDEX "SharedCalendarMember_userId_status_idx" ON "SharedCalendarMember"("userId", "status");

CREATE UNIQUE INDEX "CalendarNoteRecognition_noteId_selectionKey_key" ON "CalendarNoteRecognition"("noteId", "selectionKey");

ALTER TABLE "SharedCalendar" ADD CONSTRAINT "SharedCalendar_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SharedCalendarMember" ADD CONSTRAINT "SharedCalendarMember_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "SharedCalendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SharedCalendarMember" ADD CONSTRAINT "SharedCalendarMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CalendarNoteRecognition" ADD CONSTRAINT "CalendarNoteRecognition_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "CalendarNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_sharedCalendarId_fkey" FOREIGN KEY ("sharedCalendarId") REFERENCES "SharedCalendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "CalendarEvent_sharedCalendarId_startDate_endDate_idx" ON "CalendarEvent"("sharedCalendarId","startDate","endDate");
CREATE INDEX "CalendarEvent_sharedCalendarId_recurrenceThrough_startDate_idx" ON "CalendarEvent"("sharedCalendarId","recurrenceThrough","startDate");
ALTER TABLE "SharedCalendarMember" ADD CONSTRAINT "SharedCalendarMember_role_check" CHECK ("role" IN ('VIEWER','EDITOR'));
ALTER TABLE "SharedCalendarMember" ADD CONSTRAINT "SharedCalendarMember_status_check" CHECK ("status" IN ('PENDING','ACTIVE'));
ALTER TABLE "CalendarNoteRecognition" ADD CONSTRAINT "CalendarNoteRecognition_text_check" CHECK (length("text")<=4000 AND length("sourceHash")=64 AND length("selectionKey")=64);
CREATE INDEX "CalendarNote_searchVector_idx" ON "CalendarNote" USING GIN ("searchVector");
-- Index only derived lexemes, never a second notebook document.
CREATE FUNCTION calendar_note_search_before() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF TG_OP='INSERT' OR NEW."title" IS DISTINCT FROM OLD."title" OR NEW."document"->>'text' IS DISTINCT FROM OLD."document"->>'text' THEN
    NEW."searchVector" := to_tsvector('simple',coalesce(NEW."title",'') || ' ' || coalesce(NEW."document"->>'text','') || ' ' || coalesce((SELECT string_agg(r."text",' ') FROM "CalendarNoteRecognition" r WHERE r."noteId"=NEW."id"),''));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "CalendarNote_search_before" BEFORE INSERT OR UPDATE OF "title","document" ON "CalendarNote" FOR EACH ROW EXECUTE FUNCTION calendar_note_search_before();
CREATE FUNCTION calendar_recognition_search_after() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE target TEXT;
BEGIN
  IF TG_OP='DELETE' THEN target:=OLD."noteId"; ELSE target:=NEW."noteId"; END IF;
  UPDATE "CalendarNote" n SET "searchVector"=to_tsvector('simple',coalesce(n."title",'') || ' ' || coalesce(n."document"->>'text','') || ' ' || coalesce((SELECT string_agg(r."text",' ') FROM "CalendarNoteRecognition" r WHERE r."noteId"=n."id"),'')) WHERE n."id"=target;
  RETURN NULL;
END $$;
CREATE TRIGGER "CalendarNoteRecognition_search_after" AFTER INSERT OR UPDATE OR DELETE ON "CalendarNoteRecognition" FOR EACH ROW EXECUTE FUNCTION calendar_recognition_search_after();
UPDATE "CalendarNote" SET "searchVector"=to_tsvector('simple',coalesce("title",'') || ' ' || coalesce("document"->>'text',''));

ALTER TABLE "SharedCalendar" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON "SharedCalendar" FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON "SharedCalendar" FROM authenticated; END IF;
END $$;

ALTER TABLE "SharedCalendarMember" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON "SharedCalendarMember" FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON "SharedCalendarMember" FROM authenticated; END IF;
END $$;

ALTER TABLE "CalendarNoteRecognition" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON "CalendarNoteRecognition" FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON "CalendarNoteRecognition" FROM authenticated; END IF;
END $$;

REVOKE ALL ON FUNCTION calendar_note_search_before(), calendar_recognition_search_after() FROM PUBLIC;
