import { describe, it, expect, vi } from "vitest";

// The module imports `@/lib/db` at load time; only the pure calendar helpers
// are under test here, so a bare stub is enough to let it import.
vi.mock("@/lib/db", () => ({ prisma: {} }));

const { pickCurrentTerm, pickPenilaianTerms, currentJakartaMonth } = await import(
  "@/lib/student/dossier-aggregates"
);

type T = { id: string; startDate: string; endDate: string; academicYearStatus: string };

const terms: T[] = [
  { id: "tw1", startDate: "2025-07-14", endDate: "2025-09-30", academicYearStatus: "ACTIVE" },
  { id: "tw2", startDate: "2025-10-01", endDate: "2025-12-19", academicYearStatus: "ACTIVE" },
  { id: "tw3", startDate: "2026-01-05", endDate: "2026-03-27", academicYearStatus: "ACTIVE" },
];

const archived: T[] = [
  { id: "old1", startDate: "2024-07-15", endDate: "2024-09-30", academicYearStatus: "ARCHIVED" },
  { id: "old2", startDate: "2024-10-01", endDate: "2024-12-20", academicYearStatus: "ARCHIVED" },
];

describe("pickCurrentTerm", () => {
  it("picks the term whose window contains today", () => {
    expect(pickCurrentTerm(terms, "2025-11-03")?.id).toBe("tw2");
  });

  it("falls back to the last term that has started when today sits in a gap", () => {
    // Terms do not tile the year — the December-to-January holiday is a real
    // gap, and an admin finishing TW2's raports on 27 December should still be
    // told they are on TW2.
    expect(pickCurrentTerm(terms, "2025-12-27")?.id).toBe("tw2");
  });

  it("falls back to the first upcoming term before the year has begun", () => {
    expect(pickCurrentTerm(terms, "2025-07-01")?.id).toBe("tw1");
  });

  it("is null for an empty calendar", () => {
    expect(pickCurrentTerm([], "2025-11-03")).toBeNull();
  });
});

describe("pickPenilaianTerms", () => {
  it("covers every term of the ACTIVE academic year", () => {
    expect(pickPenilaianTerms([...archived, ...terms]).map((t) => t.id)).toEqual([
      "tw1",
      "tw2",
      "tw3",
    ]);
  });

  it("falls back to the current term alone when no year is marked ACTIVE", () => {
    // Bounded on purpose: coverage costs one aggregate query per term, so a
    // tenant with no ACTIVE year must not fan out over its whole history.
    const out = pickPenilaianTerms(archived);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("old2");
  });

  it("is empty for an empty calendar", () => {
    expect(pickPenilaianTerms([])).toEqual([]);
  });
});

describe("currentJakartaMonth", () => {
  it("returns a YYYY-MM string", () => {
    expect(currentJakartaMonth()).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
  });

  it("uses the Jakarta day, not UTC — 31 Jan 22:00 UTC is already February there", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-31T22:00:00.000Z"));
      expect(currentJakartaMonth()).toBe("2026-02");
    } finally {
      vi.useRealTimers();
    }
  });
});
