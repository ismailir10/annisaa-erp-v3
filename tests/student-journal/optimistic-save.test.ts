import { describe, it, expect } from "vitest";
import {
  getJournalCellKey,
  applyJournalCellValue,
  shouldApplyJournalSaveResult,
  type GridState,
} from "@/lib/student-journal/optimistic-save";

describe("getJournalCellKey", () => {
  it("formats as studentId:indicatorId", () => {
    expect(getJournalCellKey("s1", "i1")).toBe("s1:i1");
  });
});

describe("applyJournalCellValue", () => {
  it("sets the value for a new student", () => {
    const state: GridState = {};
    const next = applyJournalCellValue(state, "s1", "i1", true);
    expect(next).toEqual({ s1: { i1: true } });
  });

  it("does not mutate the original state (immutability)", () => {
    const state: GridState = { s1: { i1: false } };
    const next = applyJournalCellValue(state, "s1", "i1", true);
    expect(state).toEqual({ s1: { i1: false } });
    expect(next).toEqual({ s1: { i1: true } });
    expect(next).not.toBe(state);
    expect(next.s1).not.toBe(state.s1);
  });

  it("preserves sibling indicators for the same student", () => {
    const state: GridState = { s1: { i1: true, i2: false } };
    const next = applyJournalCellValue(state, "s1", "i2", true);
    expect(next).toEqual({ s1: { i1: true, i2: true } });
  });

  it("preserves other students in the grid", () => {
    const state: GridState = { s1: { i1: true }, s2: { i1: false } };
    const next = applyJournalCellValue(state, "s2", "i1", true);
    expect(next).toEqual({ s1: { i1: true }, s2: { i1: true } });
  });
});

describe("shouldApplyJournalSaveResult", () => {
  it("returns true when the requestId matches the latest recorded for the cell", () => {
    const latest = { "s1:i1": 2 };
    expect(shouldApplyJournalSaveResult(latest, "s1:i1", 2)).toBe(true);
  });

  it("returns false when a newer request has since superseded it (stale response)", () => {
    const latest = { "s1:i1": 3 };
    expect(shouldApplyJournalSaveResult(latest, "s1:i1", 2)).toBe(false);
  });

  it("returns false when the cell key is absent", () => {
    const latest = {};
    expect(shouldApplyJournalSaveResult(latest, "s1:i1", 1)).toBe(false);
  });
});
