import { describe, it, expect } from "vitest";
import {
  createCategorySchema,
  updateIndicatorSchema,
  entryBatchSchema,
  noteBodySchema,
} from "@/lib/validations/student-journal";

describe("student-journal validations", () => {
  it("createCategorySchema accepts SCHOOL scope", () => {
    const r = createCategorySchema.safeParse({ name: "Ibadah", scope: "SCHOOL", order: 0 });
    expect(r.success).toBe(true);
  });
  it("createCategorySchema rejects bad scope", () => {
    const r = createCategorySchema.safeParse({ name: "X", scope: "FOO", order: 0 });
    expect(r.success).toBe(false);
  });
  it("entryBatchSchema requires classSectionId and date YYYY-MM-DD", () => {
    const r = entryBatchSchema.safeParse({
      classSectionId: "c1",
      date: "2026-04-21",
      entries: [{ studentId: "s1", indicatorId: "i1", checked: true }],
    });
    expect(r.success).toBe(true);
  });
  it("entryBatchSchema rejects malformed date", () => {
    const r = entryBatchSchema.safeParse({ classSectionId: "c1", date: "21/04/2026", entries: [] });
    expect(r.success).toBe(false);
  });
  it("noteBodySchema caps body at 2000 chars", () => {
    const r = noteBodySchema.safeParse({ studentId: "s1", date: "2026-04-21", body: "x".repeat(2001) });
    expect(r.success).toBe(false);
  });
  it("updateIndicatorSchema accepts partial with status", () => {
    const r = updateIndicatorSchema.safeParse({ status: "INACTIVE" });
    expect(r.success).toBe(true);
  });
});
