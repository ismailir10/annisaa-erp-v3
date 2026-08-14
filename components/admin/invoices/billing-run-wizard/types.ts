// Billing Run wizard (bulk invoice wizard arc, Cycle B1 —
// docs/cycles/2026-08-14-billing-run-wizard.md, Task T8). Shared types for
// the wizard shell + step 1. Steps 2 and 3 (Task T9) will add their own
// row/line types here as they're built.

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
