import { describe, it, expect } from "vitest";
import { entryBatchSchema } from "@/lib/validations/student-journal";

/**
 * T4 — Teacher class-grid API tests.
 *
 * Route-level integration tests (GET /api/student-journal/class-grid and
 * POST /api/student-journal/entries/batch) are stubbed as todos — there is
 * no route test harness yet (will be wired in T11).
 *
 * Concrete Zod contract tests run immediately with no DB required.
 */

// ── Route stubs (T11 will wire these) ───────────────────────────────────────

describe("class-grid + entries/batch routes (integration — T11)", () => {
  it.todo("teacher without assignment gets 403 on GET class-grid");
  it.todo("teacher without assignment gets 403 on POST entries/batch");
  it.todo("teacher with assignment creates entries successfully");
  it.todo("second batch POST upserts instead of duplicating (idempotent)");
  it.todo("HOME-scope indicator rejected with 400");
  it.todo("unenrolled student rejected with 400");
});

// ── entryBatchSchema contract tests ─────────────────────────────────────────

describe("entryBatchSchema", () => {
  it("accepts a valid batch with one entry", () => {
    const result = entryBatchSchema.safeParse({
      classSectionId: "cls_abc123",
      date: "2026-04-21",
      entries: [
        { studentId: "stu_001", indicatorId: "ind_001", checked: true },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty entries array (save with nothing ticked)", () => {
    const result = entryBatchSchema.safeParse({
      classSectionId: "cls_abc123",
      date: "2026-04-21",
      entries: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects when date is missing", () => {
    const result = entryBatchSchema.safeParse({
      classSectionId: "cls_abc123",
      entries: [{ studentId: "s1", indicatorId: "i1", checked: false }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects malformed date (DD/MM/YYYY)", () => {
    const result = entryBatchSchema.safeParse({
      classSectionId: "cls_abc123",
      date: "21/04/2026",
      entries: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects when classSectionId is missing", () => {
    const result = entryBatchSchema.safeParse({
      date: "2026-04-21",
      entries: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects entry missing studentId", () => {
    const result = entryBatchSchema.safeParse({
      classSectionId: "cls_abc123",
      date: "2026-04-21",
      entries: [{ indicatorId: "i1", checked: true }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects entry where checked is not boolean", () => {
    const result = entryBatchSchema.safeParse({
      classSectionId: "cls_abc123",
      date: "2026-04-21",
      entries: [{ studentId: "s1", indicatorId: "i1", checked: "yes" }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts multiple entries in one batch", () => {
    const result = entryBatchSchema.safeParse({
      classSectionId: "cls_abc123",
      date: "2026-04-21",
      entries: [
        { studentId: "s1", indicatorId: "i1", checked: true },
        { studentId: "s1", indicatorId: "i2", checked: false },
        { studentId: "s2", indicatorId: "i1", checked: true },
      ],
    });
    expect(result.success).toBe(true);
  });
});
