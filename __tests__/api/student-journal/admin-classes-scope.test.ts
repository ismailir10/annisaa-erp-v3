import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `GET /api/student-journal/admin/classes` — academic-year scope + honest counts.
 *
 * Cross-role QA 2026-08-04 found this monitor listed every ClassSection in the
 * tenant, archived cohorts included: staging showed 15 classes (7 from the
 * archived 2024/2025 year) and 37 "active students" against 21 real ones,
 * because the KPI summed per-class enrolment counts. `/api/admin/penilaian`
 * already scoped by the ACTIVE AcademicYear; these pin that this route agrees.
 *
 * `checkedCount` is returned raw so the client stops back-computing the entry
 * total from a ROUNDED percentage (4 entries → 3% → displayed as 1).
 */

// `vi.mock` is hoisted above module scope, so the spies it closes over have to
// be created with `vi.hoisted` rather than plain top-level consts.
const { findFirstAcademicYear, findManyClassSections, findManyEnrollments } =
  vi.hoisted(() => ({
    findFirstAcademicYear: vi.fn(),
    findManyClassSections: vi.fn(),
    findManyEnrollments: vi.fn(),
  }));

vi.mock("@/lib/student-journal/guards", () => ({
  requireAdmin: vi.fn(async () => ({
    session: { id: "u-admin", tenantId: "t-1" },
    error: null,
  })),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    academicYear: { findFirst: findFirstAcademicYear },
    classSection: { findMany: findManyClassSections },
    studentEnrollment: { findMany: findManyEnrollments },
    studentJournalTemplate: { findUnique: vi.fn(async () => ({ id: "tmpl-1" })) },
    studentJournalIndicator: { count: vi.fn(async () => 6) },
    studentJournalEntry: {
      groupBy: vi.fn(async ({ _count }: { _count?: unknown }) =>
        _count
          ? [{ classSectionId: "cs-active", _count: { id: 4 } }]
          : [{ classSectionId: "cs-active", _max: { updatedAt: new Date(0) } }],
      ),
    },
  },
}));

import { GET } from "@/app/api/student-journal/admin/classes/route";

function makeRequest(weekStart = "2026-08-03") {
  return {
    nextUrl: {
      searchParams: new URLSearchParams({ weekStart }),
    },
  } as unknown as import("next/server").NextRequest;
}

describe("GET /api/student-journal/admin/classes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findFirstAcademicYear.mockResolvedValue({ id: "ay-active" });
    findManyClassSections.mockResolvedValue([
      {
        id: "cs-active",
        name: "DCARE",
        program: { name: "D'Care (Day Care)" },
      },
    ]);
    // One student holds two active enrolments in the year — the tenant-level
    // KPI must count them once.
    findManyEnrollments.mockResolvedValue([
      { studentId: "s-1", classSectionId: "cs-active" },
      { studentId: "s-2", classSectionId: "cs-active" },
      { studentId: "s-1", classSectionId: "cs-active" },
    ]);
  });

  it("filters class sections by the ACTIVE academic year", async () => {
    await GET(makeRequest());

    expect(findManyClassSections).toHaveBeenCalledTimes(1);
    const where = findManyClassSections.mock.calls[0][0].where;
    expect(where).toMatchObject({
      tenantId: "t-1",
      academicYearId: "ay-active",
      status: "ACTIVE",
    });
  });

  it("returns a raw checkedCount alongside the rounded percentage", async () => {
    const res = await GET(makeRequest());
    const body = await res.json();

    const row = body.data[0];
    expect(row.checkedCount).toBe(4);
    // 4 / (3 enrolments * 6 indicators * 5 days) = 4.44% → 4%. Recovering the
    // entry count back out of that rounded figure — round(0.04 * 3 * 5) = 1 —
    // is exactly what produced the wrong KPI, hence checkedCount being carried
    // explicitly rather than derived.
    expect(row.completionPct).toBe(4);
    expect(Math.round((row.completionPct / 100) * row.studentCount * 5)).toBe(1);
  });

  it("counts DISTINCT active students, not enrolment rows", async () => {
    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.summary.activeStudentCount).toBe(2);
    expect(body.data[0].studentCount).toBe(3); // per-class rows are unchanged
  });

  it("422s when no academic year is active", async () => {
    findFirstAcademicYear.mockResolvedValue(null);

    const res = await GET(makeRequest());
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toContain("Tahun ajaran aktif");
  });

  it("returns a zeroed summary when the active year has no classes", async () => {
    findManyClassSections.mockResolvedValue([]);

    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.data).toEqual([]);
    expect(body.summary.activeStudentCount).toBe(0);
  });

  it("rejects a malformed weekStart before touching the DB", async () => {
    const res = await GET(makeRequest("04-08-2026"));
    expect(res.status).toBe(400);
    expect(findManyClassSections).not.toHaveBeenCalled();
  });
});
