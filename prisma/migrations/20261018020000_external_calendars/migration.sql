-- Additive external calendar credentials, bounded projections and durable operations.
CREATE TABLE "CalendarConnection" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "credentials" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "credentialRevision" INTEGER NOT NULL DEFAULT 1,
    "refreshLeaseUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CalendarOAuthState" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "sessionHash" TEXT NOT NULL,
    "verifier" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarOAuthState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConnectedCalendar" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "remoteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'CYAN',
    "writable" BOOLEAN NOT NULL DEFAULT false,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "planning" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    "leaseId" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "watchId" TEXT,
    "watchSecret" TEXT,
    "watchResource" TEXT,
    "watchExpiresAt" TIMESTAMP(3),

    CONSTRAINT "ConnectedCalendar_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CalendarSyncWindow" (
    "id" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "cursor" TEXT,
    "nextPage" TEXT,
    "scanId" TEXT,
    "lastSuccessAt" TIMESTAMP(3),
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CalendarSyncWindow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExternalCalendarEvent" (
    "id" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "remoteId" TEXT NOT NULL,
    "etag" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3),
    "endsAt" TIMESTAMPTZ(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalCalendarEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CalendarSyncMember" (
    "windowId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,

    CONSTRAINT "CalendarSyncMember_pkey" PRIMARY KEY ("windowId","eventId")
);

CREATE TABLE "ExternalCalendarMutation" (
    "id" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "hash" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "result" JSONB,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalCalendarMutation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CalendarConnection_userId_provider_accountId_key" ON "CalendarConnection"("userId", "provider", "accountId");

CREATE INDEX "CalendarOAuthState_expiresAt_idx" ON "CalendarOAuthState"("expiresAt");

CREATE UNIQUE INDEX "ConnectedCalendar_watchId_key" ON "ConnectedCalendar"("watchId");

CREATE UNIQUE INDEX "ConnectedCalendar_connectionId_remoteId_key" ON "ConnectedCalendar"("connectionId", "remoteId");

CREATE INDEX "CalendarSyncWindow_nextRunAt_idx" ON "CalendarSyncWindow"("nextRunAt");

CREATE UNIQUE INDEX "CalendarSyncWindow_calendarId_month_key" ON "CalendarSyncWindow"("calendarId", "month");

CREATE INDEX "ExternalCalendarEvent_calendarId_startDate_endDate_idx" ON "ExternalCalendarEvent"("calendarId", "startDate", "endDate");

CREATE UNIQUE INDEX "ExternalCalendarEvent_calendarId_remoteId_key" ON "ExternalCalendarEvent"("calendarId", "remoteId");

CREATE INDEX "CalendarSyncMember_eventId_idx" ON "CalendarSyncMember"("eventId");

CREATE INDEX "ExternalCalendarMutation_state_nextRunAt_idx" ON "ExternalCalendarMutation"("state", "nextRunAt");

ALTER TABLE "CalendarConnection" ADD CONSTRAINT "CalendarConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CalendarOAuthState" ADD CONSTRAINT "CalendarOAuthState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConnectedCalendar" ADD CONSTRAINT "ConnectedCalendar_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "CalendarConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CalendarSyncWindow" ADD CONSTRAINT "CalendarSyncWindow_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "ConnectedCalendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExternalCalendarEvent" ADD CONSTRAINT "ExternalCalendarEvent_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "ConnectedCalendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CalendarSyncMember" ADD CONSTRAINT "CalendarSyncMember_windowId_fkey" FOREIGN KEY ("windowId") REFERENCES "CalendarSyncWindow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CalendarSyncMember" ADD CONSTRAINT "CalendarSyncMember_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ExternalCalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExternalCalendarMutation" ADD CONSTRAINT "ExternalCalendarMutation_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "ConnectedCalendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CalendarConnection" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "CalendarOAuthState" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "ConnectedCalendar" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "CalendarSyncWindow" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "ExternalCalendarEvent" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "CalendarSyncMember" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "ExternalCalendarMutation" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON "CalendarConnection", "CalendarOAuthState", "ConnectedCalendar", "CalendarSyncWindow", "ExternalCalendarEvent", "CalendarSyncMember", "ExternalCalendarMutation" FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON "CalendarConnection", "CalendarOAuthState", "ConnectedCalendar", "CalendarSyncWindow", "ExternalCalendarEvent", "CalendarSyncMember", "ExternalCalendarMutation" FROM authenticated; END IF;
END $$;

ALTER TABLE "ConnectedCalendar" ADD COLUMN "nextMaintenanceAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "ConnectedCalendar_nextMaintenanceAt_idx" ON "ConnectedCalendar"("nextMaintenanceAt");

ALTER TABLE "ConnectedCalendar" ADD COLUMN "incremental" BOOLEAN NOT NULL DEFAULT false;
