// Billing Run wizard (bulk invoice wizard arc, Cycle B1 —
// docs/cycles/2026-08-14-billing-run-wizard.md, Task T8). Shared types for
// the wizard shell + step 1. Task T9 adds the step 2/3 row, line, run-detail
// and commit-response types below.

export type WizardStep = 1 | 2 | 3;

// Mirrors `createBillingRunSchema` in lib/validations/billing-run.ts — kept
// as a plain type (not imported from the zod schema) since this is the
// wire payload shape, not the parsed/validated shape.
export type CreateBillingRunPayload = {
  periodLabel: string;
  dueDate: string;
  academicYearId: string;
  classSectionIds: string[];
  includeStudentIds: string[];
  excludeStudentIds: string[];
};

export type CreateBillingRunResponse = {
  id: string;
  summary: {
    total: number;
    pending: number;
    excluded: number;
    skippedAlreadyInvoiced: number;
    skippedNoFeeStructure: number;
    withAdjustments: number;
  };
};

// The 409 payload from POST /api/billing-runs when a DRAFT already exists.
export type DuplicateDraftConflict = {
  id: string;
  periodLabel: string;
};

// ------------------------------------------------------------------
// Steps 2 + 3 (Task T9) — mirror GET/PATCH /api/billing-runs/[id] and
// POST /api/billing-runs/[id]/commit response shapes. Money fields
// (`totalDue`, `amount`, `adjustmentAmount`, `finalAmount`) are typed
// `number` but read through `Number(...)` at call sites, matching how
// invoices-client.tsx handles Prisma `Decimal` fields coming back through
// `NextResponse.json` — see `Number(inv.totalDue)` there.
// ------------------------------------------------------------------

export type BillingRunLineData = {
  id: string;
  feeComponentId: string;
  labelSnapshot: string;
  amount: number;
  adjustmentAmount: number;
  adjustmentNote: string | null;
  finalAmount: number;
  source: string;
};

export type BillingRunRowStatus =
  | "PENDING"
  | "EXCLUDED"
  | "SKIPPED_ALREADY_INVOICED"
  | "SKIPPED_NO_FEE_STRUCTURE"
  | "COMMITTED"
  | "FAILED";

export type BillingRunRowData = {
  id: string;
  billingRunId: string;
  studentId: string;
  studentNameSnapshot: string;
  classLabelSnapshot: string | null;
  parentId: string | null;
  totalDue: number;
  status: BillingRunRowStatus;
  invoiceId: string | null;
  error: string | null;
  lines: BillingRunLineData[];
};

export type BillingRunRowsPage = {
  data: BillingRunRowData[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

// `GET /api/billing-runs/[id]` response — the run plus one paginated page
// of its rows, per Assumption 4 (server-side pagination).
export type BillingRunDetail = {
  id: string;
  periodLabel: string;
  dueDate: string;
  academicYearId: string;
  status: "DRAFT" | "COMMITTING" | "COMMITTED" | "CANCELLED";
  scope: unknown;
  createdAt: string;
  committedAt: string | null;
  rows: BillingRunRowsPage;
};

export type CommitBillingRunResultRow =
  | { rowId: string; studentId: string; studentName: string; status: "SKIPPED_ALREADY_INVOICED" }
  | {
      rowId: string;
      studentId: string;
      studentName: string;
      invoiceId: string;
      invoiceNumber: string;
      status: "SENT";
      paymentUrl: string;
    }
  | {
      rowId: string;
      studentId: string;
      studentName: string;
      invoiceId: string;
      invoiceNumber: string;
      status: "PENDING_PAYMENT_LINK";
      error: string;
    };

// `POST /api/billing-runs/[id]/commit` response — one chunk's result.
export type CommitBillingRunResponse = {
  created: number;
  skipped: number;
  results: CommitBillingRunResultRow[];
};
