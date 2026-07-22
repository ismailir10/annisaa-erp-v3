import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

/**
 * T-note-metadata — author-side note mutations (POST/PUT/DELETE) write a
 * StudentJournalAudit row inside the same transaction as the mutation,
 * mirroring the admin note DELETE pattern
 * (app/api/student-journal/admin/notes/[id]/route.ts).
 */

const mocks = vi.hoisted(() => ({
  studentFindUnique: vi.fn(),
  studentFindFirst: vi.fn(),
  enrollmentFindMany: vi.fn(),
  assignmentFindFirst: vi.fn(),
  noteFindUnique: vi.fn(),
  txNoteCreate: vi.fn(),
  txNoteUpdate: vi.fn(),
  txAuditCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    student: {
      findUnique: mocks.studentFindUnique,
      findFirst: mocks.studentFindFirst,
    },
    studentEnrollment: { findMany: mocks.enrollmentFindMany },
    teachingAssignment: { findFirst: mocks.assignmentFindFirst },
    studentJournalNote: { findUnique: mocks.noteFindUnique },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getSession: vi.fn() };
});

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ success: true }),
  getClientIp: () => "127.0.0.1",
}));

import { getSession } from "@/lib/auth";
import { POST } from "@/app/api/student-journal/notes/route";
import { PUT, DELETE } from "@/app/api/student-journal/notes/[id]/route";

const teacherSession = {
  id: "teacher-1",
  email: "t@t",
  name: "Bu Guru",
  role: "TEACHER",
  tenantId: "tenant-1",
  employeeId: "emp-1",
  parentId: null,
  permissions: [],
  customRoleCode: null,
} as never;

const buildJsonReq = (body: unknown): NextRequest =>
  ({
    json: async () => body,
    headers: new Headers(),
  }) as unknown as NextRequest;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(teacherSession);

  // Wire $transaction to invoke the callback with a tx object backed by the
  // same spies, mirroring app/api/leave/requests/route.ts test conventions.
  mocks.transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({
      studentJournalNote: {
        create: mocks.txNoteCreate,
        update: mocks.txNoteUpdate,
      },
      studentJournalAudit: { create: mocks.txAuditCreate },
    }),
  );
});

describe("POST /api/student-journal/notes — audit write", () => {
  beforeEach(() => {
    mocks.studentFindUnique.mockResolvedValue({ tenantId: "tenant-1" });
    mocks.enrollmentFindMany.mockResolvedValue([{ classSectionId: "class-1" }]);
    mocks.assignmentFindFirst.mockResolvedValue({ id: "assign-1" });
    mocks.txNoteCreate.mockResolvedValue({
      id: "note-1",
      date: "2026-07-14",
      authorRole: "TEACHER",
      body: "Anak semangat belajar.",
      createdAt: new Date("2026-07-14T01:00:00Z"),
    });
  });

  it("creates a NOTE/CREATE audit row inside the same transaction as the note", async () => {
    const res = await POST(
      buildJsonReq({
        studentId: "stu-1",
        date: "2026-07-14",
        body: "Anak semangat belajar.",
      }),
    );

    expect(res.status).toBe(201);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.txNoteCreate).toHaveBeenCalledTimes(1);
    expect(mocks.txAuditCreate).toHaveBeenCalledTimes(1);

    const auditData = mocks.txAuditCreate.mock.calls[0][0].data;
    expect(auditData).toMatchObject({
      tenantId: "tenant-1",
      entityType: "NOTE",
      entityId: "note-1",
      action: "CREATE",
      changedByUserId: "teacher-1",
    });
    expect(auditData.afterJson).toMatchObject({ body: "Anak semangat belajar." });
  });
});

describe("PUT /api/student-journal/notes/[id] — audit write", () => {
  beforeEach(() => {
    mocks.noteFindUnique.mockResolvedValue({
      id: "note-1",
      tenantId: "tenant-1",
      authorUserId: "teacher-1",
      body: "Catatan lama.",
    });
    mocks.txNoteUpdate.mockResolvedValue({
      id: "note-1",
      date: "2026-07-14",
      authorRole: "TEACHER",
      body: "Catatan baru.",
      createdAt: new Date("2026-07-14T01:00:00Z"),
    });
  });

  it("creates a NOTE/UPDATE audit row with before/after body snapshot", async () => {
    const res = await PUT(buildJsonReq({ body: "Catatan baru." }), {
      params: Promise.resolve({ id: "note-1" }),
    });

    expect(res.status).toBe(200);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.txNoteUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.txAuditCreate).toHaveBeenCalledTimes(1);

    const auditData = mocks.txAuditCreate.mock.calls[0][0].data;
    expect(auditData).toMatchObject({
      tenantId: "tenant-1",
      entityType: "NOTE",
      entityId: "note-1",
      action: "UPDATE",
      beforeJson: { body: "Catatan lama." },
      afterJson: { body: "Catatan baru." },
      changedByUserId: "teacher-1",
    });
  });

  it("does not write an audit row when the author check fails (403, no transaction)", async () => {
    mocks.noteFindUnique.mockResolvedValue({
      id: "note-1",
      tenantId: "tenant-1",
      authorUserId: "someone-else",
      body: "Catatan lama.",
    });

    const res = await PUT(buildJsonReq({ body: "Catatan baru." }), {
      params: Promise.resolve({ id: "note-1" }),
    });

    expect(res.status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/student-journal/notes/[id] — audit write", () => {
  beforeEach(() => {
    mocks.noteFindUnique.mockResolvedValue({
      id: "note-1",
      tenantId: "tenant-1",
      authorUserId: "teacher-1",
      status: "ACTIVE",
    });
    mocks.txNoteUpdate.mockResolvedValue({ id: "note-1", status: "INACTIVE" });
  });

  it("creates a NOTE/DELETE audit row with the pre-delete status snapshot", async () => {
    const res = await DELETE(buildJsonReq(undefined), {
      params: Promise.resolve({ id: "note-1" }),
    });

    expect(res.status).toBe(200);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.txNoteUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.txAuditCreate).toHaveBeenCalledTimes(1);

    const auditData = mocks.txAuditCreate.mock.calls[0][0].data;
    expect(auditData).toMatchObject({
      tenantId: "tenant-1",
      entityType: "NOTE",
      entityId: "note-1",
      action: "DELETE",
      beforeJson: { status: "ACTIVE" },
      changedByUserId: "teacher-1",
    });
  });
});
