import { describe, it, expect, vi } from "vitest";
import { findStreamConflict, pickPrimaryEnrollment } from "./active";

// Minimal tx mock — mirrors the pattern in app/api/__tests__/enroll.test.ts:
// a plain object exposing just the Prisma methods under test as vi.fn().
function makeTx(existing: unknown) {
  return {
    studentEnrollment: {
      findFirst: vi.fn().mockResolvedValue(existing),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("findStreamConflict", () => {
  it("no conflict for one SEMESTER + one YEAR_ROUND enrollment in the same year", async () => {
    // The two streams don't collide, so the query for either type resolves to
    // no row — simulate the SEMESTER-type query finding nothing because the
    // student's only same-year row is YEAR_ROUND (and vice versa).
    const tx = makeTx(null);

    const conflict = await findStreamConflict(tx, {
      studentId: "s1",
      academicYearId: "ay-2025-2026",
      programType: "SEMESTER",
    });

    expect(conflict).toBeNull();
    expect(tx.studentEnrollment.findFirst).toHaveBeenCalledWith({
      where: {
        studentId: "s1",
        status: "ACTIVE",
        classSection: {
          academicYearId: "ay-2025-2026",
          program: { type: "SEMESTER" },
        },
      },
      select: {
        id: true,
        classSectionId: true,
        classSection: { select: { name: true } },
      },
    });
  });

  it("conflict when two SEMESTER enrollments exist in the same year", async () => {
    const existing = {
      id: "e1",
      classSectionId: "cs-kb",
      classSection: { name: "KB Aster" },
    };
    const tx = makeTx(existing);

    const conflict = await findStreamConflict(tx, {
      studentId: "s1",
      academicYearId: "ay-2025-2026",
      programType: "SEMESTER",
    });

    expect(conflict).toEqual(existing);
  });

  it("no conflict when the SEMESTER row is in an ARCHIVED prior year and the query targets the active year", async () => {
    // The query is scoped to ay-2025-2026 (ACTIVE); a stale ACTIVE row that
    // lives on ay-2024-2025 (ARCHIVED) must not satisfy this where clause —
    // simulated by the mock resolving to null because the real Prisma query
    // filters on classSection.academicYearId.
    const tx = makeTx(null);

    const conflict = await findStreamConflict(tx, {
      studentId: "s1",
      academicYearId: "ay-2025-2026",
      programType: "SEMESTER",
    });

    expect(conflict).toBeNull();
    expect(tx.studentEnrollment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          classSection: expect.objectContaining({
            academicYearId: "ay-2025-2026",
          }),
        }),
      }),
    );
  });
});

describe("pickPrimaryEnrollment", () => {
  it("returns the SEMESTER row when both a SEMESTER and a YEAR_ROUND row exist", () => {
    const semester = {
      id: "e-semester",
      enrollDate: "2025-07-10",
      classSection: { program: { type: "SEMESTER" } },
    };
    const daycare = {
      id: "e-daycare",
      enrollDate: "2025-07-01",
      classSection: { program: { type: "YEAR_ROUND" } },
    };

    expect(pickPrimaryEnrollment([daycare, semester])).toBe(semester);
    expect(pickPrimaryEnrollment([semester, daycare])).toBe(semester);
  });

  it("returns the daycare row for a daycare-only student", () => {
    const daycare = {
      id: "e-daycare",
      enrollDate: "2025-07-01",
      classSection: { program: { type: "YEAR_ROUND" } },
    };

    expect(pickPrimaryEnrollment([daycare])).toBe(daycare);
  });

  it("falls back to the earliest enrollDate when there is no SEMESTER row", () => {
    const later = {
      id: "e-later",
      enrollDate: "2025-08-01",
      classSection: { program: { type: "YEAR_ROUND" } },
    };
    const earlier = {
      id: "e-earlier",
      enrollDate: "2025-07-01",
      classSection: { program: { type: "SESSION" } },
    };

    expect(pickPrimaryEnrollment([later, earlier])).toBe(earlier);
  });

  it("breaks ties on id when enrollDates are equal", () => {
    const a = {
      id: "a",
      enrollDate: "2025-07-01",
      classSection: { program: { type: "YEAR_ROUND" } },
    };
    const b = {
      id: "b",
      enrollDate: "2025-07-01",
      classSection: { program: { type: "SESSION" } },
    };

    expect(pickPrimaryEnrollment([b, a])).toBe(a);
    expect(pickPrimaryEnrollment([a, b])).toBe(a);
  });

  it("returns null for an empty array", () => {
    expect(pickPrimaryEnrollment([])).toBeNull();
  });

  it("with TWO SEMESTER rows, the earliest-enrollDate tiebreak picks the EARLIER row — this is exactly why callers must exclude ARCHIVED-year rows before calling pickPrimaryEnrollment", () => {
    // Regression fixture for the T9 bug: a stale un-closed prior-year
    // ACTIVE row (bulk-import artifact) plus the real current-year row are
    // both SEMESTER, so both land in the SEMESTER-only pool and the
    // tiebreak is live — unlike every other case above, where the pool
    // never has two SEMESTER entries. `pickPrimaryEnrollment` itself is
    // correct (earliest `enrollDate` deterministically wins); the bug was
    // upstream callers feeding it an unfiltered, multi-year ACTIVE set.
    const staleArchivedYear = {
      id: "e-archived-2024",
      enrollDate: "2024-07-01", // earlier — archived year's enrollment date
      classSection: { program: { type: "SEMESTER" } },
    };
    const currentYear = {
      id: "e-current-2025",
      enrollDate: "2025-07-10", // later — this year's real enrollment
      classSection: { program: { type: "SEMESTER" } },
    };

    // Order-independent: the earlier enrollDate wins regardless of array order.
    expect(pickPrimaryEnrollment([staleArchivedYear, currentYear])).toBe(staleArchivedYear);
    expect(pickPrimaryEnrollment([currentYear, staleArchivedYear])).toBe(staleArchivedYear);
  });
});
