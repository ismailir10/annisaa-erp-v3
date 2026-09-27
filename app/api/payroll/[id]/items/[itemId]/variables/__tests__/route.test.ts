/**
 * PUT /api/payroll/[id]/items/[itemId]/variables — F-15
 * (cycle 2026-09-27-admin-finish-standard): `calculateEmployeePayroll` does
 * not run `assertGajiPokokSortOrder` itself, so this route needs its own
 * guard against a misordered PCT_OF_BASE component (400 instead of a wrong
 * silent recalculation against 0).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { requirePermission, db } = vi.hoisted(() => {
  const db = {
    payrollRun: { findUnique: vi.fn() },
    salaryComponentDef: { findMany: vi.fn(), findUnique: vi.fn() },
    payrollItem: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  };
  return { requirePermission: vi.fn(), db };
});

vi.mock("@/lib/auth-guards", () => ({ requirePermission }));
vi.mock("@/lib/db", () => ({ prisma: db }));

import { PUT } from "../route";

const ALLOW = { session: { tenantId: "t1", id: "u1", role: "SCHOOL_ADMIN" } };

function req(body: unknown) {
  return new Request("http://t/api/payroll/run1/items/item1/variables", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

const params = Promise.resolve({ id: "run1", itemId: "item1" });

beforeEach(() => {
  vi.clearAllMocks();
  requirePermission.mockResolvedValue(ALLOW);
  db.payrollRun.findUnique.mockResolvedValue({
    id: "run1",
    tenantId: "t1",
    status: "DRAFT",
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
    actualWorkDays: 20,
  });
  // verifyTenantOwnership("payrollItem", ...) reads this via `@/lib/auth-guard`,
  // which imports the same `@/lib/db` mock — give it the shape that helper
  // expects (an include of the parent payrollRun's tenantId).
  db.payrollItem.findUnique.mockResolvedValue({
    id: "item1",
    payrollRun: { tenantId: "t1" },
  });
});

describe("PUT .../variables — F-15 ordering guard", () => {
  it("returns 400 naming the component instead of recalculating against a misordered PCT_OF_BASE", async () => {
    db.salaryComponentDef.findMany.mockResolvedValue([
      { id: "gp1", code: "gaji_pokok", label: "Gaji Pokok", category: "INCOME", calcType: "FIXED", isProRated: false, sortOrder: 1 },
      { id: "pct1", code: "insentif_persen", label: "Insentif Persen", category: "INCOME", calcType: "PCT_OF_BASE", isProRated: false, sortOrder: 1 },
    ]);

    const res = await PUT(req({ overtimeHours: 2 }), { params } as never);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Insentif Persen");
    expect(body.error).toContain("Gaji Pokok");
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
