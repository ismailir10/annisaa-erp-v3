import { describe, it, expect } from "vitest";
import { limit } from "../concurrency-limit";

describe("limit — constructor validation", () => {
  it("throws on zero", () => {
    expect(() => limit(0)).toThrow();
  });

  it("throws on negative", () => {
    expect(() => limit(-1)).toThrow();
  });

  it("throws on non-integer", () => {
    expect(() => limit(2.5)).toThrow();
  });

  it("throws on NaN", () => {
    expect(() => limit(Number.NaN)).toThrow();
  });

  it("accepts 1", () => {
    expect(() => limit(1)).not.toThrow();
  });

  it("accepts large positive integer", () => {
    expect(() => limit(100)).not.toThrow();
  });
});

describe("limit — concurrency cap", () => {
  it("never exceeds maxConcurrency=3 across 10 jobs", async () => {
    const runLimit = limit(3);
    let active = 0;
    let peak = 0;

    const job = async () => {
      active++;
      peak = Math.max(peak, active);
      // Yield twice — enough for any queued work that's ready to slip through.
      await Promise.resolve();
      await Promise.resolve();
      active--;
      return "ok";
    };

    const results = await Promise.all(Array.from({ length: 10 }, () => runLimit(job)));

    expect(peak).toBeLessThanOrEqual(3);
    expect(results).toHaveLength(10);
    expect(results.every((r) => r === "ok")).toBe(true);
  });

  it("processes all jobs even when fan-out > cap (throughput correct)", async () => {
    const runLimit = limit(2);
    const completed: number[] = [];

    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        runLimit(async () => {
          completed.push(i);
          return i;
        }),
      ),
    );

    expect(completed).toHaveLength(8);
    expect(completed.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("releases slot on rejection so queued work proceeds", async () => {
    const runLimit = limit(2);
    let resolved = 0;
    let rejected = 0;

    const settle = await Promise.allSettled([
      runLimit(async () => {
        rejected++;
        throw new Error("boom");
      }),
      runLimit(async () => {
        resolved++;
        return "ok";
      }),
      runLimit(async () => {
        resolved++;
        return "ok";
      }),
      runLimit(async () => {
        resolved++;
        return "ok";
      }),
    ]);

    expect(settle[0].status).toBe("rejected");
    expect(settle.slice(1).every((s) => s.status === "fulfilled")).toBe(true);
    expect(resolved).toBe(3);
    expect(rejected).toBe(1);
  });

  it("with maxConcurrency=1 runs jobs sequentially (peak = 1)", async () => {
    const runLimit = limit(1);
    let active = 0;
    let peak = 0;

    const job = async () => {
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active--;
    };

    await Promise.all(Array.from({ length: 5 }, () => runLimit(job)));

    expect(peak).toBe(1);
  });
});
