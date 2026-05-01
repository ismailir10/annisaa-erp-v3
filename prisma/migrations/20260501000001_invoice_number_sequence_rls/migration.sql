-- InvoiceNumberSequence is tenant-scoped (tenantId is part of the composite PK).
-- It was added in 20260426000001_invoice_number_sequence/migration.sql without
-- an RLS migration, which the static coverage check (scripts/verify-rls-coverage.sh)
-- has been flagging on every CI run since. Internal table — only the invoice
-- allocator (service-role) writes/reads it; no end-user surface. Service-role
-- bypass policy matches the rest of the finance models.

ALTER TABLE "InvoiceNumberSequence" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoicenumbersequence_service_all" ON "InvoiceNumberSequence"
  AS PERMISSIVE FOR ALL TO service_role USING (true);
