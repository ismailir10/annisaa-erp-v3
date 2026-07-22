import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

/**
 * T-note-metadata — admin audit route surfaces `changedByName` on each row.
 *
 * Route: GET /api/student-journal/admin/audit
 * Rows are enriched via enrichAuditsWithChangerNames (lib/student-journal/note-metadata.ts).
 */

const mocks = vi.hoisted(() => ({
  auditFindMany: vi.fn(),
  studentFindFirst: vi.fn(),
  entryFindMany: vi.fn(),
  noteFindMany: vi.fn(),
  userFindMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    studentJournalAudit: { findMany: mocks.auditFindMany },
    student: { findFirst: mocks.studentFindFirst },
    studentJournalEntry: { findMany: mocks.entryFindMany },
    studentJournalNote: { findMany: mocks.noteFindMany },
    user: { findMany: mocks.userFindMany },
  },
}));

vi.mock("@/lib/student-journal/guards", () => ({
  requireAdmin: vi.fn(async () => ({
    session: { id: "admin-1", tenantId: "tenant-1", role: "SCHOOL_ADMIN" },
  })),
}));

import { GET } from "@/app/api/student-journal/admin/audit/route";

const buildReq = (url: string): NextRequest =>
  ({
    nextUrl: new URL(url),
    headers: new Headers(),
  }) as unknown as NextRequest;

describe("GET /api/student-journal/admin/audit — changer name enrichment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auditFindMany.mockResolvedValue([
      {
        id: "audit-1",
        entityType: "NOTE",
        entityId: "note-1",
        action: "DELETE",
        beforeJson: { status: "ACTIVE" },
        afterJson: { status: "INACTIVE" },
        changedByUserId: "admin-1",
        changedAt: new Date("2026-07-14T03:00:00Z"),
      },
    ]);
    mocks.userFindMany.mockResolvedValue([
      { id: "admin-1", name: "Pak Budi", role: "SCHOOL_ADMIN" },
    ]);
  });

  it("returns changedByName resolved from the actor's user record", async () => {
    const res = await GET(
      buildReq(
        "http://localhost/api/student-journal/admin/audit?entityType=NOTE&entityId=note-1",
      ),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(1);
    expect(json.data[0].changedByName).toBe("Pak Budi");
    expect(json.data[0].changedByUserId).toBe("admin-1");
  });

  it("falls back to a generic label when the actor's user row is missing", async () => {
    mocks.userFindMany.mockResolvedValue([]);

    const res = await GET(
      buildReq(
        "http://localhost/api/student-journal/admin/audit?entityType=NOTE&entityId=note-1",
      ),
    );

    const json = await res.json();
    expect(json.data[0].changedByName).toBe("Pengguna admin-1");
  });
});
