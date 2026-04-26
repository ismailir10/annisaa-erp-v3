CREATE TABLE "InvoiceNumberSequence" (
  "tenantId" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "lastNumber" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "InvoiceNumberSequence_pkey" PRIMARY KEY ("tenantId", "year")
);

-- FK to Tenant — Restrict cascade matches the rest of the finance model
-- (financial config rows must not silently disappear when a tenant row is
-- modified; explicit cleanup is required).
ALTER TABLE "InvoiceNumberSequence"
  ADD CONSTRAINT "InvoiceNumberSequence_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed from existing invoices. Tenants with zero invoices get no row;
-- the allocator will INSERT them on first call with VALUES (..., 1).
INSERT INTO "InvoiceNumberSequence" ("tenantId", "year", "lastNumber")
SELECT
  "tenantId",
  CAST(SUBSTRING("invoiceNumber" FROM 'INV-(\d{4})-') AS INTEGER) AS year,
  MAX(CAST(SUBSTRING("invoiceNumber" FROM 'INV-\d{4}-(\d+)$') AS INTEGER)) AS last_num
FROM "Invoice"
WHERE "invoiceNumber" ~ '^INV-\d{4}-\d+$'
GROUP BY "tenantId", year
ON CONFLICT ("tenantId", "year") DO NOTHING;
