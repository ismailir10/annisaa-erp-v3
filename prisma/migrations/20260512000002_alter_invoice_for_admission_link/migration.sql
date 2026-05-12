-- AlterTable: make studentId nullable on Invoice
-- Invoices can now belong to either a Student (regular tuition) or an
-- Admission (registration fee). When linked to an Admission the FK lives on
-- Admission.registrationInvoiceId — this table only relaxes the NOT NULL
-- constraint on studentId.
ALTER TABLE "Invoice" ALTER COLUMN "studentId" DROP NOT NULL;

-- Invariant: every Invoice references either a Student OR an Admission
-- (registration invoice). The Admission side owns the FK
-- (Admission.registrationInvoiceId), so we cannot reference admissionId
-- directly in a row-level CHECK here. The application layer enforces this
-- invariant; the comment serves as documentation for future maintainers.
-- NOTE: A deferred trigger or application-level guard should be added if
-- stricter enforcement is required.
