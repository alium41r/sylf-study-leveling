-- CreateTable
CREATE TABLE IF NOT EXISTS "WaitlistEntry" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "targetExam" TEXT,
    "scholarClass" TEXT,
    "referralCode" TEXT NOT NULL,
    "referredBy" TEXT,
    "referralCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "WaitlistEntry_email_key" ON "WaitlistEntry"("email");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "WaitlistEntry_referralCode_key" ON "WaitlistEntry"("referralCode");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WaitlistEntry_email_idx" ON "WaitlistEntry"("email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WaitlistEntry_referralCode_idx" ON "WaitlistEntry"("referralCode");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WaitlistEntry_createdAt_idx" ON "WaitlistEntry"("createdAt" DESC);
