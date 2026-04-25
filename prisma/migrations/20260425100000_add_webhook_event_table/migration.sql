-- WebhookEvent: audit + DB-level dedup for inbound provider webhooks.
-- Used by app/api/xendit/webhook/route.ts. UNIQUE on eventId is the
-- race-free dedup primitive (Prisma P2002 → 200 noop on duplicate).
-- FAILED rows are DELETED by the handler so provider retries succeed.

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "invoiceId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_eventId_key" ON "WebhookEvent"("eventId");

-- CreateIndex
CREATE INDEX "WebhookEvent_provider_createdAt_idx" ON "WebhookEvent"("provider", "createdAt");

-- CreateIndex
CREATE INDEX "WebhookEvent_invoiceId_idx" ON "WebhookEvent"("invoiceId");

-- Enable RLS to match the repo-wide default. No policies = deny-all to
-- non-service-role connections. The webhook handler runs with the
-- service-role bypass (Prisma adapter), so no SELECT/INSERT policy needed.
ALTER TABLE "WebhookEvent" ENABLE ROW LEVEL SECURITY;
