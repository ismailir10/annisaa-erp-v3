import { it, expect } from "vitest";

// run-bulk-generate.ts and run-bulk-retry.ts each define their own `chunk()`
// — byte-identical, but genuinely separate exports (neither re-exports the
// other's), so both need their own coverage. This shares the assertions so a
// future bugfix to the shared shape only needs writing once.
export function itBehavesLikeChunk(chunk: <T>(arr: T[], size: number) => T[][]) {
  it("slices an array into N-sized buckets", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns [] for an empty array", () => {
    expect(chunk([], 5)).toEqual([]);
  });

  it("throws on size <= 0", () => {
    expect(() => chunk([1], 0)).toThrow();
  });
}
