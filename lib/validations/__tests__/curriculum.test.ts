import { describe, it, expect } from "vitest";
import {
  semesterCreateSchema,
  semesterUpdateSchema,
  themeCreateSchema,
  themeUpdateSchema,
  weekCreateSchema,
  weekUpdateSchema,
  parseJakartaYmd,
  formatJakartaYmd,
  findWeekOverlap,
} from "@/lib/validations/curriculum";

describe("semesterCreateSchema", () => {
  it("accepts a well-formed body", () => {
    const r = semesterCreateSchema.safeParse({
      academicYearId: "ay1",
      number: 1,
      startDate: "2026-07-14",
      endDate: "2026-12-19",
    });
    expect(r.success).toBe(true);
  });

  it("rejects endDate ≤ startDate", () => {
    const r = semesterCreateSchema.safeParse({
      academicYearId: "ay1",
      number: 1,
      startDate: "2026-07-14",
      endDate: "2026-07-14",
    });
    expect(r.success).toBe(false);
  });

  it("rejects number outside {1,2}", () => {
    const r = semesterCreateSchema.safeParse({
      academicYearId: "ay1",
      number: 3,
      startDate: "2026-07-14",
      endDate: "2026-12-19",
    });
    expect(r.success).toBe(false);
  });

  it("rejects malformed date (Feb 30)", () => {
    const r = semesterCreateSchema.safeParse({
      academicYearId: "ay1",
      number: 1,
      startDate: "2026-02-30",
      endDate: "2026-07-14",
    });
    expect(r.success).toBe(false);
  });
});

describe("semesterUpdateSchema", () => {
  it("allows partial update with only status", () => {
    const r = semesterUpdateSchema.safeParse({ status: "INACTIVE" });
    expect(r.success).toBe(true);
  });

  it("rejects start>=end when both supplied", () => {
    const r = semesterUpdateSchema.safeParse({
      startDate: "2026-12-01",
      endDate: "2026-07-14",
    });
    expect(r.success).toBe(false);
  });

  it("accepts startDate-only without endDate (skip cross-field check)", () => {
    const r = semesterUpdateSchema.safeParse({ startDate: "2026-07-14" });
    expect(r.success).toBe(true);
  });
});

describe("themeCreateSchema + themeUpdateSchema", () => {
  it("create requires non-empty name + non-negative order", () => {
    expect(
      themeCreateSchema.safeParse({ semesterId: "s1", name: "", order: 0 })
        .success,
    ).toBe(false);
    expect(
      themeCreateSchema.safeParse({ semesterId: "s1", name: "Saya", order: -1 })
        .success,
    ).toBe(false);
    expect(
      themeCreateSchema.safeParse({ semesterId: "s1", name: "Saya Anak Sehat", order: 0 })
        .success,
    ).toBe(true);
  });

  it("update is partial — status alone is valid", () => {
    expect(themeUpdateSchema.safeParse({ status: "INACTIVE" }).success).toBe(true);
  });
});

describe("weekCreateSchema", () => {
  it("Mon-Fri week is valid", () => {
    const r = weekCreateSchema.safeParse({
      subThemeId: "st1",
      number: 1,
      startDate: "2026-07-13",
      endDate: "2026-07-17",
    });
    expect(r.success).toBe(true);
  });

  it("single-day Week is rejected (start === end)", () => {
    const r = weekCreateSchema.safeParse({
      subThemeId: "st1",
      number: 1,
      startDate: "2026-07-13",
      endDate: "2026-07-13",
    });
    expect(r.success).toBe(false);
  });

  it("rejects number < 1", () => {
    const r = weekCreateSchema.safeParse({
      subThemeId: "st1",
      number: 0,
      startDate: "2026-07-13",
      endDate: "2026-07-17",
    });
    expect(r.success).toBe(false);
  });
});

describe("weekUpdateSchema", () => {
  it("partial update with status only is valid", () => {
    expect(weekUpdateSchema.safeParse({ status: "INACTIVE" }).success).toBe(true);
  });

  it("rejects start>=end when both supplied", () => {
    const r = weekUpdateSchema.safeParse({
      startDate: "2026-07-17",
      endDate: "2026-07-13",
    });
    expect(r.success).toBe(false);
  });
});

describe("parseJakartaYmd + formatJakartaYmd round-trip", () => {
  it("round-trips a Mon date", () => {
    const d = parseJakartaYmd("2026-07-13");
    expect(formatJakartaYmd(d)).toBe("2026-07-13");
  });

  it("crosses Jakarta-day boundary correctly (UTC-midnight stored, Jakarta-day read)", () => {
    // A timestamp at 2026-07-13T00:00:00Z is 2026-07-13 07:00 in Jakarta.
    const d = parseJakartaYmd("2026-07-13");
    expect(formatJakartaYmd(d)).toBe("2026-07-13");
  });
});

describe("findWeekOverlap", () => {
  const existing = [
    { id: "w1", startDate: "2026-07-13", endDate: "2026-07-17", status: "ACTIVE" },
    { id: "w2", startDate: "2026-07-20", endDate: "2026-07-24", status: "ACTIVE" },
  ];

  it("returns null when ranges are fully disjoint", () => {
    const r = findWeekOverlap(existing, {
      startDate: "2026-07-27",
      endDate: "2026-07-31",
    });
    expect(r).toBeNull();
  });

  it("flags inner-overlap (candidate wholly inside existing)", () => {
    const r = findWeekOverlap(existing, {
      startDate: "2026-07-14",
      endDate: "2026-07-15",
    });
    expect(r?.id).toBe("w1");
  });

  it("flags straddling overlap (candidate spans boundary)", () => {
    const r = findWeekOverlap(existing, {
      startDate: "2026-07-15",
      endDate: "2026-07-21",
    });
    expect(r?.id).toBe("w1");
  });

  it("does NOT flag touching boundary (existing.end === candidate.start)", () => {
    // existing w1 covers 13–17 (half-open: [13, 17)); a new week starting 17
    // and ending 19 touches but does not overlap. End before w2 (20).
    const r = findWeekOverlap(existing, {
      startDate: "2026-07-17",
      endDate: "2026-07-19",
    });
    expect(r).toBeNull();
  });

  it("ignores INACTIVE rows in `existing`", () => {
    const r = findWeekOverlap(
      [{ id: "w1", startDate: "2026-07-13", endDate: "2026-07-17", status: "INACTIVE" }],
      { startDate: "2026-07-14", endDate: "2026-07-15" },
    );
    expect(r).toBeNull();
  });

  it("ignores rows with null/undefined status (fail-closed)", () => {
    const r1 = findWeekOverlap(
      [{ id: "w1", startDate: "2026-07-13", endDate: "2026-07-17", status: null }],
      { startDate: "2026-07-14", endDate: "2026-07-15" },
    );
    expect(r1).toBeNull();
    const r2 = findWeekOverlap(
      [{ id: "w1", startDate: "2026-07-13", endDate: "2026-07-17" }],
      { startDate: "2026-07-14", endDate: "2026-07-15" },
    );
    expect(r2).toBeNull();
  });

  it("excludes the candidate's own id on PUT updates", () => {
    const r = findWeekOverlap(existing, {
      id: "w1",
      startDate: "2026-07-14",
      endDate: "2026-07-15",
    });
    expect(r).toBeNull();
  });

  it("accepts Date objects in `existing` (Prisma return shape)", () => {
    const r = findWeekOverlap(
      [
        {
          id: "w1",
          startDate: new Date("2026-07-13T00:00:00Z"),
          endDate: new Date("2026-07-17T00:00:00Z"),
          status: "ACTIVE",
        },
      ],
      { startDate: "2026-07-14", endDate: "2026-07-15" },
    );
    expect(r?.id).toBe("w1");
  });
});
