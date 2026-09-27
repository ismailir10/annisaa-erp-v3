/**
 * POST /api/salary-components — F-15 (cycle 2026-09-27-admin-finish-standard):
 * validateBody (Indonesian field errors instead of `issues`) + widened
 * calcType (PCT_OF_BASE now allowed on create) + the gaji_pokok sortOrder
 * ordering rule (checkSalaryComponentOrdering).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { requirePermission, db } = vi.hoisted(() => {
  const db = {
    salaryComponentDef: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "new-id",
        ...data,
      })),
      findFirst: vi.fn(),
    },
  };
  return { requirePermission: vi.fn(), db };
});

vi.mock("@/lib/auth-guards", () => ({ requirePermission }));
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ success: true }),
  getClientIp: () => "127.0.0.1",
}));

import { POST } from "../route";

const ALLOW = { session: { tenantId: "t1", id: "u1", role: "SCHOOL_ADMIN" } };

function req(body: unknown) {
  return new Request("http://t/api/salary-components", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  requirePermission.mockResolvedValue(ALLOW);
  db.salaryComponentDef.findFirst.mockResolvedValue(null);
});

describe("POST /api/salary-components", () => {
  it("creates a PCT_OF_BASE component ordered after gaji_pokok (201)", async () => {
    db.salaryComponentDef.findFirst.mockResolvedValue({ id: "gp1", sortOrder: 1 });

    const res = await POST(
      req({
        code: "insentif",
        label: "Insentif",
        category: "INCOME",
        calcType: "PCT_OF_BASE",
        sortOrder: 5,
      })
    );

    expect(res.status).toBe(201);
    expect(db.salaryComponentDef.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ calcType: "PCT_OF_BASE", sortOrder: 5 }),
    });
  });

  it("rejects a PCT_OF_BASE component whose sortOrder is not after gaji_pokok's (400, field sortOrder)", async () => {
    db.salaryComponentDef.findFirst.mockResolvedValue({ id: "gp1", sortOrder: 5 });

    const res = await POST(
      req({
        code: "insentif",
        label: "Insentif",
        category: "INCOME",
        calcType: "PCT_OF_BASE",
        sortOrder: 5,
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validasi gagal");
    expect(body.errors[0].field).toBe("sortOrder");
    expect(db.salaryComponentDef.create).not.toHaveBeenCalled();
  });

  it("allows a PCT_OF_BASE create when no gaji_pokok is configured", async () => {
    db.salaryComponentDef.findFirst.mockResolvedValue(null);

    const res = await POST(
      req({
        code: "insentif",
        label: "Insentif",
        category: "INCOME",
        calcType: "PCT_OF_BASE",
        sortOrder: 0,
      })
    );

    expect(res.status).toBe(201);
  });

  it("rejects an invalid calcType with a field error (400, errors[])", async () => {
    const res = await POST(
      req({
        code: "insentif",
        label: "Insentif",
        category: "INCOME",
        calcType: "NOT_A_TYPE",
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validasi gagal");
    expect(Array.isArray(body.errors)).toBe(true);
    expect(body.errors.some((e: { field: string }) => e.field === "calcType")).toBe(true);
    expect(db.salaryComponentDef.create).not.toHaveBeenCalled();
  });
});
