/**
 * Guard coverage for `GET /api/guardian/invoices/[id]/pdf` — the kuitansi
 * (paid-invoice receipt) PDF. Mirrors guardian-invoice-detail.test.ts but for
 * the PDF sibling, which shipped the same #397 null-email guard yet had zero
 * regression tests (payments-module-hardening audit, 2026-07-27).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { getSession, renderToBuffer, db } = vi.hoisted(() => ({
  getSession: vi.fn(),
  renderToBuffer: vi.fn(),
  db: {
    parent: { findFirst: vi.fn() },
    invoice: { findUnique: vi.fn() },
    tenant: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ getSession }));
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@react-pdf/renderer", () => ({
  renderToBuffer,
  StyleSheet: { create: (x: unknown) => x },
  Document: "Document",
  Page: "Page",
  Text: "Text",
  View: "View",
  Image: "Image",
}));
vi.mock("@/lib/pdf/invoice-receipt", () => ({ InvoiceReceiptPdf: "InvoiceReceiptPdf" }));

import { GET } from "../guardian/invoices/[id]/pdf/route";

const ctx = { params: Promise.resolve({ id: "inv-1" }) };

function guardianSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "u-1",
    email: "g@g.com",
    name: "G",
    role: "GUARDIAN",
    tenantId: "t-1",
    employeeId: null,
    parentId: "par-1",
    permissions: [] as string[],
    customRoleCode: null,
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/guardian/invoices/[id]/pdf", () => {
  it("401 when unauthenticated", async () => {
    getSession.mockResolvedValue(null);
    expect((await GET({} as never, ctx)).status).toBe(401);
    expect(db.parent.findFirst).not.toHaveBeenCalled();
  });

  it("403 for non-guardian role", async () => {
    getSession.mockResolvedValue(guardianSession({ role: "SCHOOL_ADMIN" }));
    expect((await GET({} as never, ctx)).status).toBe(403);
    expect(db.parent.findFirst).not.toHaveBeenCalled();
  });

  it("404 when session has neither parentId nor email — never queries (null-email leak regression, #397)", async () => {
    getSession.mockResolvedValue(guardianSession({ parentId: null, email: null }));
    const res = await GET({} as never, ctx);
    expect(res.status).toBe(404);
    expect(db.parent.findFirst).not.toHaveBeenCalled();
    expect(renderToBuffer).not.toHaveBeenCalled();
  });

  it("404 when session has empty-string email and no parentId (null-email leak regression, #397)", async () => {
    getSession.mockResolvedValue(guardianSession({ parentId: null, email: "" }));
    const res = await GET({} as never, ctx);
    expect(res.status).toBe(404);
    expect(db.parent.findFirst).not.toHaveBeenCalled();
  });

  it("404 when invoice belongs to another parent's child (cross-family guard)", async () => {
    getSession.mockResolvedValue(guardianSession());
    db.parent.findFirst.mockResolvedValue({ guardians: [{ studentId: "stu-1" }] });
    db.invoice.findUnique.mockResolvedValue({
      id: "inv-1",
      tenantId: "t-1",
      studentId: "stu-other",
      status: "PAID",
      lines: [],
      payments: [],
      student: { name: "X", nickname: null, enrollments: [] },
    });
    const res = await GET({} as never, ctx);
    expect(res.status).toBe(404);
    expect(renderToBuffer).not.toHaveBeenCalled();
  });

  it("404 for a non-PAID invoice — no unpaid receipt leaks", async () => {
    getSession.mockResolvedValue(guardianSession());
    db.parent.findFirst.mockResolvedValue({ guardians: [{ studentId: "stu-1" }] });
    db.invoice.findUnique.mockResolvedValue({
      id: "inv-1",
      tenantId: "t-1",
      studentId: "stu-1",
      status: "SENT",
      lines: [],
      payments: [],
      student: { name: "X", nickname: null, enrollments: [] },
    });
    const res = await GET({} as never, ctx);
    expect(res.status).toBe(404);
    expect(renderToBuffer).not.toHaveBeenCalled();
  });
});
