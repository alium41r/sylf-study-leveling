-- Additive metadata-only Notes broker. Apply through the normal deployment migration process.
CREATE TABLE "NotesConnection" (
 "id" TEXT PRIMARY KEY, "userId" INTEGER NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE CASCADE,
 "libraryId" TEXT NOT NULL UNIQUE, "accountId" TEXT NOT NULL, "rootId" TEXT, "label" TEXT NOT NULL,
 "credentials" TEXT NOT NULL, "vaultKey" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PROVISIONING',
 "bindingGeneration" INTEGER NOT NULL DEFAULT 1, "credentialRevision" INTEGER NOT NULL DEFAULT 1,
 "refreshLeaseUntil" TIMESTAMP(3), "verifiedAt" TIMESTAMP(3), "probeHash" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "NotesOAuthState" (
 "id" TEXT PRIMARY KEY, "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
 "sessionHash" TEXT NOT NULL, "verifier" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "NotesOAuthState_expiresAt_idx" ON "NotesOAuthState"("expiresAt");
ALTER TABLE "NotesConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotesOAuthState" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON "NotesConnection", "NotesOAuthState" FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON "NotesConnection", "NotesOAuthState" FROM authenticated; END IF;
END $$;
