import { describe, it, expect } from "vitest";
import { diffJson } from "@/lib/student-journal/audit";

describe("diffJson", () => {
  it("captures before/after snapshots", () => {
    expect(diffJson({ checked: false }, { checked: true })).toEqual({
      before: { checked: false },
      after: { checked: true },
    });
  });

  it("handles null on one side", () => {
    expect(diffJson(null, { status: "INACTIVE" })).toEqual({
      before: null,
      after: { status: "INACTIVE" },
    });
  });

  it("handles both sides null", () => {
    expect(diffJson(null, null)).toEqual({ before: null, after: null });
  });

  it("preserves nested object structure", () => {
    const before = { checked: true, meta: { date: "2026-04-21" } };
    const after = { checked: false, meta: { date: "2026-04-21" } };
    expect(diffJson(before, after)).toEqual({ before, after });
  });

  it("preserves array values", () => {
    expect(diffJson([1, 2], [1, 2, 3])).toEqual({
      before: [1, 2],
      after: [1, 2, 3],
    });
  });
});
