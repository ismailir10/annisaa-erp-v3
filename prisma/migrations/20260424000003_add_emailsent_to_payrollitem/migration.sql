-- Per-item idempotency flag for send-slips retry safety.
-- Set to true after successful slip email delivery so a retried run skips
-- already-sent items and survives serverless timeouts.
ALTER TABLE "PayrollItem" ADD COLUMN "emailSent" BOOLEAN NOT NULL DEFAULT false;
