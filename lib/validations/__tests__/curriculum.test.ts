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
  promesImportRequestSchema,
  objectiveCreateSchema,
  indicatorCreateSchema,
  objectiveUpdateSchema,
  indicatorAdminCreateSchema,
  indicatorUpdateSchema,
  indicatorThemeLinkToggleSchema,
  type ObjectiveCreateInput,
  type IndicatorCreateInput,
  type IndicatorAdminCreateInput,
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

describe("promesImportRequestSchema", () => {
  it("accepts a valid (semesterId, ageGroup=A) pair", () => {
    const r = promesImportRequestSchema.safeParse({
      semesterId: "sem_123",
      ageGroup: "A",
    });
    expect(r.success).toBe(true);
  });

  it("accepts ageGroup=B", () => {
    const r = promesImportRequestSchema.safeParse({
      semesterId: "sem_123",
      ageGroup: "B",
    });
    expect(r.success).toBe(true);
  });

  it("rejects empty semesterId", () => {
    const r = promesImportRequestSchema.safeParse({
      semesterId: "",
      ageGroup: "A",
    });
    expect(r.success).toBe(false);
  });

  it("rejects unknown ageGroup", () => {
    const r = promesImportRequestSchema.safeParse({
      semesterId: "sem_123",
      ageGroup: "C",
    });
    expect(r.success).toBe(false);
  });
});

describe("objectiveCreateSchema", () => {
  const valid: ObjectiveCreateInput = {
    semesterId: "sem_123",
    ageGroup: "A",
    element: "RELIGIOUS_MORAL",
    number: 1,
    competencyText: "Mengenal Allah melalui ciptaan-Nya",
    content: "Anak mengenal rukun iman dan rukun Islam dasar",
  };

  it("accepts the canonical happy-path objective row", () => {
    expect(objectiveCreateSchema.safeParse(valid).success).toBe(true);
  });

  it("trims whitespace on text fields before length checks", () => {
    const parsed = objectiveCreateSchema.parse({
      ...valid,
      competencyText: "   Mengenal Allah   ",
      content: "  Anak ibadah  ",
    });
    expect(parsed.competencyText).toBe("Mengenal Allah");
    expect(parsed.content).toBe("Anak ibadah");
  });

  it("rejects empty competencyText after trim", () => {
    const r = objectiveCreateSchema.safeParse({
      ...valid,
      competencyText: "    ",
    });
    expect(r.success).toBe(false);
  });

  it("rejects non-positive number", () => {
    expect(
      objectiveCreateSchema.safeParse({ ...valid, number: 0 }).success,
    ).toBe(false);
    expect(
      objectiveCreateSchema.safeParse({ ...valid, number: -3 }).success,
    ).toBe(false);
  });

  it("rejects non-integer number", () => {
    expect(
      objectiveCreateSchema.safeParse({ ...valid, number: 1.5 }).success,
    ).toBe(false);
  });

  it("rejects unknown element", () => {
    const r = objectiveCreateSchema.safeParse({
      ...valid,
      element: "UNKNOWN_ELEMENT",
    });
    expect(r.success).toBe(false);
  });

  it("rejects unrealistically large numbers", () => {
    expect(
      objectiveCreateSchema.safeParse({ ...valid, number: 1000 }).success,
    ).toBe(false);
  });
});

describe("indicatorCreateSchema", () => {
  const valid: IndicatorCreateInput = {
    semesterId: "sem_123",
    ageGroup: "A",
    element: "RELIGIOUS_MORAL",
    objectiveNumber: 1,
    content: "Menyebutkan rukun iman dengan urutan benar",
    order: 1,
  };

  it("accepts the canonical happy-path indicator row", () => {
    expect(indicatorCreateSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects empty content after trim", () => {
    expect(
      indicatorCreateSchema.safeParse({ ...valid, content: "   " }).success,
    ).toBe(false);
  });

  it("rejects order < 1", () => {
    expect(
      indicatorCreateSchema.safeParse({ ...valid, order: 0 }).success,
    ).toBe(false);
  });

  it("rejects objectiveNumber < 1", () => {
    expect(
      indicatorCreateSchema.safeParse({ ...valid, objectiveNumber: 0 })
        .success,
    ).toBe(false);
  });

  it("rejects non-integer objectiveNumber", () => {
    expect(
      indicatorCreateSchema.safeParse({ ...valid, objectiveNumber: 1.5 })
        .success,
    ).toBe(false);
  });
});

describe("objectiveUpdateSchema", () => {
  it("accepts a competencyText-only patch", () => {
    expect(
      objectiveUpdateSchema.safeParse({ competencyText: "Capaian baru" })
        .success,
    ).toBe(true);
  });

  it("accepts a content-only patch", () => {
    expect(
      objectiveUpdateSchema.safeParse({ content: "Tujuan baru" }).success,
    ).toBe(true);
  });

  it("accepts a status transition to INACTIVE", () => {
    expect(
      objectiveUpdateSchema.safeParse({ status: "INACTIVE" }).success,
    ).toBe(true);
  });

  it("accepts an empty patch (no-op PUT)", () => {
    expect(objectiveUpdateSchema.safeParse({}).success).toBe(true);
  });

  it("rejects blank competencyText after trim", () => {
    expect(
      objectiveUpdateSchema.safeParse({ competencyText: "   " }).success,
    ).toBe(false);
  });

  it("rejects invalid status enum value", () => {
    expect(
      objectiveUpdateSchema.safeParse({ status: "ARCHIVED" }).success,
    ).toBe(false);
  });

  it("rejects competencyText > 2000 chars", () => {
    expect(
      objectiveUpdateSchema.safeParse({ competencyText: "a".repeat(2001) })
        .success,
    ).toBe(false);
  });
});

describe("indicatorAdminCreateSchema", () => {
  const valid: IndicatorAdminCreateInput = {
    objectiveId: "obj_123",
    content: "Hafal doa sebelum makan",
    order: 1,
  };

  it("accepts the happy-path admin-create body", () => {
    expect(indicatorAdminCreateSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects missing objectiveId", () => {
    expect(
      indicatorAdminCreateSchema.safeParse({ ...valid, objectiveId: "" })
        .success,
    ).toBe(false);
  });

  it("rejects blank content after trim", () => {
    expect(
      indicatorAdminCreateSchema.safeParse({ ...valid, content: "   " })
        .success,
    ).toBe(false);
  });

  it("rejects order < 1", () => {
    expect(
      indicatorAdminCreateSchema.safeParse({ ...valid, order: 0 }).success,
    ).toBe(false);
  });

  it("rejects content > 2000 chars", () => {
    expect(
      indicatorAdminCreateSchema.safeParse({
        ...valid,
        content: "a".repeat(2001),
      }).success,
    ).toBe(false);
  });
});

describe("indicatorUpdateSchema", () => {
  it("accepts a content-only patch", () => {
    expect(
      indicatorUpdateSchema.safeParse({ content: "Hafal doa makan" }).success,
    ).toBe(true);
  });

  it("accepts an order-only reorder patch", () => {
    expect(indicatorUpdateSchema.safeParse({ order: 5 }).success).toBe(true);
  });

  it("accepts a deactivate patch", () => {
    expect(
      indicatorUpdateSchema.safeParse({ status: "INACTIVE" }).success,
    ).toBe(true);
  });

  it("accepts a reactivate patch", () => {
    expect(
      indicatorUpdateSchema.safeParse({ status: "ACTIVE" }).success,
    ).toBe(true);
  });

  it("accepts an empty patch", () => {
    expect(indicatorUpdateSchema.safeParse({}).success).toBe(true);
  });

  it("rejects blank content after trim", () => {
    expect(
      indicatorUpdateSchema.safeParse({ content: "   " }).success,
    ).toBe(false);
  });

  it("rejects order < 1", () => {
    expect(indicatorUpdateSchema.safeParse({ order: 0 }).success).toBe(false);
  });

  it("rejects invalid status enum", () => {
    expect(
      indicatorUpdateSchema.safeParse({ status: "DELETED" }).success,
    ).toBe(false);
  });

  it("rejects content > 2000 chars", () => {
    expect(
      indicatorUpdateSchema.safeParse({ content: "a".repeat(2001) }).success,
    ).toBe(false);
  });
});

describe("indicatorThemeLinkToggleSchema", () => {
  it("accepts linked: true", () => {
    expect(
      indicatorThemeLinkToggleSchema.safeParse({
        indicatorId: "ind_1",
        themeId: "thm_1",
        linked: true,
      }).success,
    ).toBe(true);
  });

  it("accepts linked: false", () => {
    expect(
      indicatorThemeLinkToggleSchema.safeParse({
        indicatorId: "ind_1",
        themeId: "thm_1",
        linked: false,
      }).success,
    ).toBe(true);
  });

  it("rejects missing indicatorId", () => {
    expect(
      indicatorThemeLinkToggleSchema.safeParse({
        indicatorId: "",
        themeId: "thm_1",
        linked: true,
      }).success,
    ).toBe(false);
  });

  it("rejects missing themeId", () => {
    expect(
      indicatorThemeLinkToggleSchema.safeParse({
        indicatorId: "ind_1",
        themeId: "",
        linked: true,
      }).success,
    ).toBe(false);
  });

  it("rejects non-boolean linked", () => {
    expect(
      indicatorThemeLinkToggleSchema.safeParse({
        indicatorId: "ind_1",
        themeId: "thm_1",
        linked: "yes",
      }).success,
    ).toBe(false);
  });
});
