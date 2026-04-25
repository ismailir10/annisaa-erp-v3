-- Add paymentLinkError diagnostic column for invoices whose Xendit checkout
-- session failed during creation. Nullable, no backfill required.
ALTER TABLE "Invoice" ADD COLUMN "paymentLinkError" TEXT;
