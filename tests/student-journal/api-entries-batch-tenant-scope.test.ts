import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  templateFindUnique: vi.fn(),
  indicatorFindMany: vi.fn(),
  enrollmentFindMany: vi.fn(),
  entryUpsert: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    studentJournalTemplate: { findUnique: mocks.templateFindUnique },
    studentJournalIndicator: { findMany: mocks.indicatorFindMany },
    studentEnrollment: { findMany: mocks.enrollmentFindMany },
    studentJournalEntry: { upsert: mocks.entryUpsert },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/student-journal/guards", () => ({
  requireTeacherForClass: vi.fn(async () => ({
    session: { id: "u1", tenantId: "tenant-1", role: "TEACHER" },
  })),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ success: true }),
}));

import { POST } from "@/app/api/student-journal/entries/batch/route";

const buildReq = (body: unknown): NextRequest =>
  ({
    json: async () => body,
    headers: new Headers(),
  }) as unknown as NextRequest;

const validBody = {
  classSectionId: "class-1",
  date: "2026-05-01",
  entries: [
    { studentId: "s1", indicatorId: "ind-1", checked: true },
    { studentId: "s1", indicatorId: "ind-2", checked: false },
  ],
};

describe("POST /entries/batch — tenant scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.templateFindUnique.mockResolvedValue({ id: "tmpl-1", tenantId: "tenant-1" });
    mocks.indicatorFindMany.mockResolvedValue([{ id: "ind-1" }, { id: "ind-2" }]);
    mocks.enrollmentFindMany.mockResolvedValue([{ studentId: "s1" }]);
    mocks.transaction.mockResolvedValue([{}, {}]);
  });

  it("indicator findMany where-clause includes nested template.tenantId scope", async () => {
    await POST(buildReq(validBody));
    expect(mocks.indicatorFindMany).toHaveBeenCalledTimes(1);
    const call = mocks.indicatorFindMany.mock.calls[0][0];
    expect(call.where.category.template).toEqual({ tenantId: "tenant-1" });
  });

  it("enrollment findMany where-clause includes student.tenantId scope", async () => {
    await POST(buildReq(validBody));
    expect(mocks.enrollmentFindMany).toHaveBeenCalledTimes(1);
    const call = mocks.enrollmentFindMany.mock.calls[0][0];
    expect(call.where.student).toEqual({ tenantId: "tenant-1" });
  });

  it("rejects when indicator IDs don't all match (cross-tenant indicator returns 400 'Indikator tidak valid')", async () => {
    mocks.indicatorFindMany.mockResolvedValue([{ id: "ind-1" }]); // missing ind-2

    const res = await POST(buildReq(validBody));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Indikator tidak valid");
  });

  it("returns Indonesian error for invalid JSON body", async () => {
    const req = {
      json: async () => {
        throw new Error("bad json");
      },
      headers: new Headers(),
    } as unknown as NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("JSON tidak valid");
  });

  it("returns Indonesian error for missing students in class", async () => {
    mocks.enrollmentFindMany.mockResolvedValue([]); // no enrollments
    const res = await POST(buildReq(validBody));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Beberapa siswa tidak terdaftar di kelas ini");
  });
});
