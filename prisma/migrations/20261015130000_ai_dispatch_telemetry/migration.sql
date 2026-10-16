-- Nullable additions preserve historical and durable Planner V2 receipts.
ALTER TABLE "AiUsageLog"
  ADD COLUMN "requestedModel" TEXT,
  ADD COLUMN "modelVerified" BOOLEAN,
  ADD COLUMN "usageKnown" BOOLEAN,
  ADD COLUMN "cacheUsageKnown" BOOLEAN,
  ADD COLUMN "reasoningTokens" INTEGER,
  ADD COLUMN "latencyMs" INTEGER,
  ADD COLUMN "dispatchIndex" INTEGER,
  ADD COLUMN "retryIndex" INTEGER,
  ADD COLUMN "outcome" TEXT,
  ADD COLUMN "finishReason" TEXT,
  ADD COLUMN "pricingVersion" TEXT,
  ADD COLUMN "grounding" BOOLEAN;
-- Unpriced legacy rows are unknown, not free. Do not reprice historical calls.
UPDATE "AiUsageLog" SET "estimatedCostUsd"=NULL
WHERE "requestId" IS NULL AND "estimatedCostUsd"=0;
ALTER TABLE "AiUsageLog" ALTER COLUMN "estimatedCostUsd" DROP DEFAULT;
