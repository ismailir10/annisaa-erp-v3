import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

/**
 * T-note-metadata — teacher week route surfaces `authorName` on notes.
 *
 * Route: GET /api/student-journal/students/[id]/week
 * Notes are enriched via enrichNotesWithAuthorMetadata (lib/student-journal/note-metadata.ts),
 * which resolves each note.authorUserId to a tenant-scoped user name.
 */

const mocks = vi.hoisted(() => ({
  enrollmentFindMany: vi.fn(),
  assignmentFindFirst: vi.fn(),
  templateFindUnique: vi.fn(),
  categoryFindMany: vi.fn(),
  entryFindMany: vi.fn(),
  noteFindMany: vi.fn(),
  auditFindMany: vi.fn(),
  userFindMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    studentEnrollment: { findMany: mocks.enrollmentFindMany },
    teachingAssignment: { findFirst: mocks.assignmentFindFirst },
    studentJournalTemplate: { findUnique: mocks.templateFindUnique },
    studentJournalCategory: { findMany: mocks.categoryFindMany },
    studentJournalEntry: { findMany: mocks.entryFindMany },
    studentJournalNote: { findMany: mocks.noteFindMany },
    studentJournalAudit: { findMany: mocks.auditFindMany },
    user: { findMany: mocks.userFindMany },
  },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getSession: vi.fn() };
});

import { getSession } from "@/lib/auth";
import { GET } from "@/app/api/student-journal/students/[id]/week/route";

const buildReq = (url: string): NextRequest =>
  ({
    url,
    headers: new Headers(),
  }) as unknown as NextRequest;

describe("GET /api/student-journal/students/[id]/week — author name enrichment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue({
      id: "teacher-1",
      email: "t@t",
      name: "Bu Guru",
      role: "TEACHER",
      tenantId: "tenant-1",
      employeeId: "emp-1",
      parentId: null,
      permissions: [],
      customRoleCode: null,
    } as never);

    mocks.enrollmentFindMany.mockResolvedValue([{ classSectionId: "class-1" }]);
    mocks.assignmentFindFirst.mockResolvedValue({ id: "assign-1" });
    mocks.templateFindUnique.mockResolvedValue({ id: "tmpl-1" });
    mocks.categoryFindMany.mockResolvedValue([]);
    mocks.entryFindMany.mockResolvedValue([]);
    mocks.auditFindMany.mockResolvedValue([]);
    mocks.userFindMany.mockResolvedValue([
      { id: "teacher-1", name: "Bu Sari", role: "TEACHER" },
    ]);
    mocks.noteFindMany.mockResolvedValue([
      {
        id: "note-1",
        date: "2026-07-14",
        authorRole: "TEACHER",
        authorUserId: "teacher-1",
        body: "Anak aktif hari ini.",
        createdAt: new Date("2026-07-14T01:00:00Z"),
        updatedAt: new Date("2026-07-14T02:00:00Z"),
      },
    ]);
  });

  it("returns authorName resolved from the note author's user record", async () => {
    const res = await GET(
      buildReq("http://localhost/api/student-journal/students/stu-1/week?weekStart=2026-07-13"),
      { params: Promise.resolve({ id: "stu-1" }) },
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.notes).toHaveLength(1);
    expect(json.data.notes[0].authorName).toBe("Bu Sari");
    expect(json.data.notes[0].authorUserId).toBe("teacher-1");
    expect(json.data.notes[0].updatedAt).toBe("2026-07-14T02:00:00.000Z");
  });

  it("falls back to role label when no user row matches the author", async () => {
    mocks.userFindMany.mockResolvedValue([]);

    const res = await GET(
      buildReq("http://localhost/api/student-journal/students/stu-1/week?weekStart=2026-07-13"),
      { params: Promise.resolve({ id: "stu-1" }) },
    );

    const json = await res.json();
    expect(json.data.notes[0].authorName).toBe("Guru");
  });
});
