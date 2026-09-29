import { describe, expect, it } from "vitest";
import {
  bulkScopeIndicatorIds,
  chunkItems,
  decodeBulkScope,
  encodeBulkScope,
  planBulkChange,
  planBulkUndo,
  type BulkCategory,
} from "@/lib/student-journal/bulk";

const categories: BulkCategory[] = [
  { id: "c-ibadah", name: "Ibadah", indicators: [{ id: "i1", label: "Sholat" }, { id: "i2", label: "Doa" }] },
  { id: "c-akhlak", name: "Akhlak", indicators: [{ id: "i3", label: "Sopan" }] },
];
const students = ["s1", "s2"];

describe("bulkScopeIndicatorIds", () => {
  it("resolves all / category / single indicator, and nothing for an unknown id", () => {
    expect(bulkScopeIndicatorIds(categories, { kind: "all" })).toEqual(["i1", "i2", "i3"]);
    expect(bulkScopeIndicatorIds(categories, { kind: "category", categoryId: "c-ibadah" })).toEqual(["i1", "i2"]);
    expect(bulkScopeIndicatorIds(categories, { kind: "indicator", indicatorId: "i3" })).toEqual(["i3"]);
    expect(bulkScopeIndicatorIds(categories, { kind: "indicator", indicatorId: "nope" })).toEqual([]);
    expect(bulkScopeIndicatorIds(categories, { kind: "category", categoryId: "nope" })).toEqual([]);
  });

  it("round-trips through the select value", () => {
    for (const scope of [
      { kind: "all" } as const,
      { kind: "category", categoryId: "c-ibadah" } as const,
      { kind: "indicator", indicatorId: "i2" } as const,
    ]) {
      expect(decodeBulkScope(encodeBulkScope(scope))).toEqual(scope);
    }
    expect(decodeBulkScope("garbage")).toEqual({ kind: "all" });
  });
});

describe("planBulkChange", () => {
  it("marks every student x indicator when nothing is ticked (full class, one action)", () => {
    const plan = planBulkChange({ categories, state: {}, scope: { kind: "all" }, studentIds: students, checked: true });
    expect(plan.cells).toHaveLength(6);
    expect(plan.cells.every((c) => c.checked)).toBe(true);
    expect(plan.previous.every((c) => c.checked === false)).toBe(true);
  });

  it("skips cells that already hold the value, so a re-apply writes nothing", () => {
    const state = { s1: { i1: true, i2: true, i3: true }, s2: { i1: true } };
    const plan = planBulkChange({ categories, state, scope: { kind: "all" }, studentIds: students, checked: true });
    expect(plan.cells.map((c) => `${c.studentId}:${c.indicatorId}`)).toEqual(["s2:i2", "s2:i3"]);
    const again = planBulkChange({
      categories,
      state: { s1: { i1: true, i2: true, i3: true }, s2: { i1: true, i2: true, i3: true } },
      scope: { kind: "all" },
      studentIds: students,
      checked: true,
    });
    expect(again.cells).toEqual([]);
  });

  it("limits to a category and to the chosen students", () => {
    const plan = planBulkChange({
      categories,
      state: {},
      scope: { kind: "category", categoryId: "c-akhlak" },
      studentIds: ["s2"],
      checked: true,
    });
    expect(plan.cells).toEqual([{ studentId: "s2", indicatorId: "i3", checked: true }]);
  });

  it("can clear, touching only ticked cells and remembering them as ticked", () => {
    const state = { s1: { i1: true, i2: false } };
    const plan = planBulkChange({ categories, state, scope: { kind: "all" }, studentIds: ["s1"], checked: false });
    expect(plan.cells).toEqual([{ studentId: "s1", indicatorId: "i1", checked: false }]);
    expect(plan.previous).toEqual([{ studentId: "s1", indicatorId: "i1", checked: true }]);
  });
});

describe("planBulkUndo", () => {
  it("restores what the bulk changed", () => {
    const plan = planBulkChange({ categories, state: { s1: { i1: true } }, scope: { kind: "all" }, studentIds: ["s1"], checked: true });
    const after = { s1: { i1: true, i2: true, i3: true } };
    expect(planBulkUndo(after, plan)).toEqual([
      { studentId: "s1", indicatorId: "i2", checked: false },
      { studentId: "s1", indicatorId: "i3", checked: false },
    ]);
  });

  it("leaves a cell alone when the teacher has changed it by hand since", () => {
    const plan = planBulkChange({ categories, state: {}, scope: { kind: "all" }, studentIds: ["s1"], checked: true });
    const after = { s1: { i1: true, i2: false, i3: true } }; // i2 un-ticked by hand afterwards
    expect(planBulkUndo(after, plan).map((c) => c.indicatorId)).toEqual(["i1", "i3"]);
  });
});

describe("chunkItems", () => {
  it("splits into request-sized pieces", () => {
    expect(chunkItems([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkItems([], 3)).toEqual([]);
    expect(chunkItems([1, 2], 5)).toEqual([[1, 2]]);
  });

  it("rejects a non-positive size instead of looping forever", () => {
    expect(() => chunkItems([1], 0)).toThrow(RangeError);
  });
});
