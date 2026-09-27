/**
 * PUT /api/salary-components/[id] — F-15 (cycle 2026-09-27-admin-finish-standard):
 * validateBody + updateSalaryComponentSchema (all fields optional, keeps the
 * `{ isEnabled }`-only toggle working) + the gaji_pokok sortOrder ordering
 * rule, in both directions.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { requirePermission, db } = vi.hoisted(() => {
  const db = {
    salaryComponentDef: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "sc1",
        ...data,
      })),
    },
  };
  return { requirePermission: vi.fn(), db };
});

vi.mock("@/lib/auth-guards", () => ({ requirePermission }));
vi.mock("@/lib/db", () => ({ prisma: db }));

import { PUT } from "../route";

const ALLOW = { session: { tenantId: "t1", id: "u1", role: "SCHOOL_ADMIN" } };

function req(body: unknown) {
  return new Request("http://t/api/salary-components/sc1", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

const params = Promise.resolve({ id: "sc1" });

const EXISTING = {
  id: "sc1",
  tenantId: "t1",
  code: "tunjangan_transport",
  label: "Tunjangan Transport",
  category: "INCOME",
  calcType: "FIXED",
  isProRated: false,
  isEnabled: true,
  sortOrder: 3,
};

beforeEach(() => {
  vi.clearAllMocks();
  requirePermission.mockResolvedValue(ALLOW);
  db.salaryComponentDef.findUnique.mockResolvedValue(EXISTING);
  db.salaryComponentDef.findFirst.mockResolvedValue(null);
});

describe("PUT /api/salary-components/[id]", () => {
  it("the { isEnabled }-only toggle still updates only isEnabled", async () => {
    const res = await PUT(req({ isEnabled: false }), { params } as never);

    expect(res.status).toBe(200);
    expect(db.salaryComponentDef.update).toHaveBeenCalledWith({
      where: { id: "sc1" },
      data: { isEnabled: false },
    });
  });

  it("a full edit with a valid PCT_OF_BASE ordering succeeds", async () => {
    db.salaryComponentDef.findFirst.mockResolvedValue({ id: "gp1", sortOrder: 1 });

    const res = await PUT(
      req({
        label: "Insentif",
        category: "INCOME",
        calcType: "PCT_OF_BASE",
        isProRated: false,
        sortOrder: 5,
      }),
      { params } as never
    );

    expect(res.status).toBe(200);
    expect(db.salaryComponentDef.update).toHaveBeenCalledWith({
      where: { id: "sc1" },
      data: expect.objectContaining({ calcType: "PCT_OF_BASE", sortOrder: 5 }),
    });
  });

  it("rejects editing a component to PCT_OF_BASE with a sortOrder not after gaji_pokok's (400, field sortOrder)", async () => {
    db.salaryComponentDef.findFirst.mockResolvedValue({ id: "gp1", sortOrder: 5 });

    const res = await PUT(
      req({ calcType: "PCT_OF_BASE", sortOrder: 5 }),
      { params } as never
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validasi gagal");
    expect(body.errors[0].field).toBe("sortOrder");
    expect(db.salaryComponentDef.update).not.toHaveBeenCalled();
  });

  it("rejects moving gaji_pokok's own sortOrder to be >= an existing PCT_OF_BASE component (400, field sortOrder)", async () => {
    db.salaryComponentDef.findUnique.mockResolvedValue({
      ...EXISTING,
      code: "gaji_pokok",
      label: "Gaji Pokok",
      calcType: "FIXED",
      sortOrder: 1,
    });
    // The reverse-direction lookup: an enabled PCT_OF_BASE component whose
    // sortOrder would no longer be after the new gaji_pokok sortOrder.
    db.salaryComponentDef.findFirst.mockResolvedValue({ id: "pct1" });

    const res = await PUT(req({ sortOrder: 4 }), { params } as never);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validasi gagal");
    expect(body.errors[0].field).toBe("sortOrder");
    expect(db.salaryComponentDef.update).not.toHaveBeenCalled();
  });

  it("rejects an invalid calcType with a field error (400, errors[])", async () => {
    const res = await PUT(req({ calcType: "NOT_A_TYPE" }), { params } as never);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validasi gagal");
    expect(Array.isArray(body.errors)).toBe(true);
    expect(body.errors.some((e: { field: string }) => e.field === "calcType")).toBe(true);
    expect(db.salaryComponentDef.update).not.toHaveBeenCalled();
  });

  it("404s when the component belongs to another tenant", async () => {
    db.salaryComponentDef.findUnique.mockResolvedValue({ ...EXISTING, tenantId: "other" });

    const res = await PUT(req({ isEnabled: false }), { params } as never);

    expect(res.status).toBe(404);
    expect(db.salaryComponentDef.update).not.toHaveBeenCalled();
  });
});
