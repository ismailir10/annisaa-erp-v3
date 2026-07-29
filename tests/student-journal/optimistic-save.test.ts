import { describe, it, expect } from "vitest";
import {
  getJournalCellKey,
  applyJournalCellValue,
  shouldApplyJournalSaveResult,
  enqueuePerKey,
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

describe("enqueuePerKey", () => {
  it("runs tasks for the same key strictly in submission order", async () => {
    const queues: Record<string, Promise<void> | undefined> = {};
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => (releaseFirst = resolve));

    const first = enqueuePerKey(queues, "s1:i1", async () => {
      await firstGate; // hold the first task open
      order.push("first");
    });
    const second = enqueuePerKey(queues, "s1:i1", async () => {
      order.push("second");
    });

    releaseFirst();
    await Promise.all([first, second]);
    expect(order).toEqual(["first", "second"]);
  });

  it("still runs the next task after a previous one rejects", async () => {
    const queues: Record<string, Promise<void> | undefined> = {};
    const order: string[] = [];

    const first = enqueuePerKey(queues, "s1:i1", async () => {
      order.push("first");
      throw new Error("boom");
    });
    const second = enqueuePerKey(queues, "s1:i1", async () => {
      order.push("second");
    });

    await expect(first).rejects.toThrow("boom");
    await second;
    expect(order).toEqual(["first", "second"]);
  });

  it("does not serialize tasks across different keys", async () => {
    const queues: Record<string, Promise<void> | undefined> = {};
    const order: string[] = [];
    let releaseA!: () => void;
    const gateA = new Promise<void>((resolve) => (releaseA = resolve));

    const a = enqueuePerKey(queues, "s1:i1", async () => {
      await gateA;
      order.push("a");
    });
    const b = enqueuePerKey(queues, "s2:i1", async () => {
      order.push("b");
    });

    await b;
    expect(order).toEqual(["b"]);
    releaseA();
    await a;
    expect(order).toEqual(["b", "a"]);
  });

  it("cleans up the queue entry after all tasks for a key settle", async () => {
    const queues: Record<string, Promise<void> | undefined> = {};
    await enqueuePerKey(queues, "s1:i1", async () => {});
    await Promise.resolve(); // allow the cleanup microtask to run
    await Promise.resolve();
    expect(queues["s1:i1"]).toBeUndefined();
  });
});
