import { describe, it, expect } from "vitest";
import {
  assessmentEntryCreateSchema,
  assessmentEntryBulkCreateSchema,
  assessmentEntryUpdateSchema,
  MAX_BULK_ENTRIES,
} from "@/lib/validations/assessment-entry";

const validHomeroom = {
  studentId: "stu1",
  indicatorId: "ind1",
  date: "2026-05-14",
  source: "HOMEROOM" as const,
  level: "CONSISTENT" as const,
};

const validCenter = {
  studentId: "stu1",
  indicatorId: "ind1",
  date: "2026-05-14",
  source: "CENTER" as const,
  center: "WORSHIP" as const,
  activity: "Doa pagi",
  level: "EMERGING" as const,
};

describe("assessmentEntryCreateSchema", () => {
  it("accepts a valid HOMEROOM entry", () => {
    const r = assessmentEntryCreateSchema.safeParse(validHomeroom);
    expect(r.success).toBe(true);
  });

  it("accepts a valid CENTER entry", () => {
    const r = assessmentEntryCreateSchema.safeParse(validCenter);
    expect(r.success).toBe(true);
  });

  it("rejects HOMEROOM entry that includes a center", () => {
    const r = assessmentEntryCreateSchema.safeParse({
      ...validHomeroom,
      center: "WORSHIP",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("center"))).toBe(true);
    }
  });

  it("rejects CENTER entry without a center", () => {
    const { center: _ignored, ...without } = validCenter;
    const r = assessmentEntryCreateSchema.safeParse(without);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("center"))).toBe(true);
    }
  });

  it("rejects malformed date", () => {
    const r = assessmentEntryCreateSchema.safeParse({
      ...validHomeroom,
      date: "14-05-2026",
    });
    expect(r.success).toBe(false);
  });

  it("rejects unknown level", () => {
    const r = assessmentEntryCreateSchema.safeParse({
      ...validHomeroom,
      level: "BSH",
    });
    expect(r.success).toBe(false);
  });

  it("rejects unknown center value", () => {
    const r = assessmentEntryCreateSchema.safeParse({
      ...validCenter,
      center: "FOO",
    });
    expect(r.success).toBe(false);
  });

  it("rejects activity over 200 chars", () => {
    const r = assessmentEntryCreateSchema.safeParse({
      ...validCenter,
      activity: "x".repeat(201),
    });
    expect(r.success).toBe(false);
  });

  it("rejects note over 500 chars", () => {
    const r = assessmentEntryCreateSchema.safeParse({
      ...validHomeroom,
      note: "x".repeat(501),
    });
    expect(r.success).toBe(false);
  });
});

describe("assessmentEntryBulkCreateSchema", () => {
  it("accepts a 1-entry bulk", () => {
    const r = assessmentEntryBulkCreateSchema.safeParse({
      entries: [validHomeroom],
    });
    expect(r.success).toBe(true);
  });

  it("accepts a max-size bulk", () => {
    const entries = Array.from({ length: MAX_BULK_ENTRIES }, (_, i) => ({
      ...validHomeroom,
      studentId: `stu${i}`,
    }));
    const r = assessmentEntryBulkCreateSchema.safeParse({ entries });
    expect(r.success).toBe(true);
  });

  it("rejects an empty bulk", () => {
    const r = assessmentEntryBulkCreateSchema.safeParse({ entries: [] });
    expect(r.success).toBe(false);
  });

  it("rejects a bulk over the cap", () => {
    const entries = Array.from({ length: MAX_BULK_ENTRIES + 1 }, (_, i) => ({
      ...validHomeroom,
      studentId: `stu${i}`,
    }));
    const r = assessmentEntryBulkCreateSchema.safeParse({ entries });
    expect(r.success).toBe(false);
  });

  it("rejects when any entry violates the source/center rule", () => {
    const r = assessmentEntryBulkCreateSchema.safeParse({
      entries: [validHomeroom, { ...validHomeroom, center: "WORSHIP" }],
    });
    expect(r.success).toBe(false);
  });
});

describe("assessmentEntryUpdateSchema", () => {
  it("accepts level-only patch", () => {
    const r = assessmentEntryUpdateSchema.safeParse({ level: "CONSISTENT" });
    expect(r.success).toBe(true);
  });

  it("accepts note clearing via null", () => {
    const r = assessmentEntryUpdateSchema.safeParse({ note: null });
    expect(r.success).toBe(true);
  });

  it("accepts empty patch (no-op)", () => {
    const r = assessmentEntryUpdateSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it("rejects unknown level on patch", () => {
    const r = assessmentEntryUpdateSchema.safeParse({ level: "BSH" });
    expect(r.success).toBe(false);
  });
});
