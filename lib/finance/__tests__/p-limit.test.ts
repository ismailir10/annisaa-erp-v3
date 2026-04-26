import { describe, it, expect } from "vitest";
import { pLimit } from "../p-limit";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe("pLimit", () => {
  it("caps in-flight to n; with n=2 and 5 jobs of 50ms each, max parallelism is 2", async () => {
    const limit = pLimit(2);
    let inFlight = 0;
    let peak = 0;

    const job = async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await sleep(50);
      inFlight--;
    };

    const start = Date.now();
    await Promise.all(Array.from({ length: 5 }, () => limit(job)));
    const elapsed = Date.now() - start;

    expect(peak).toBe(2);
    // 5 jobs in waves of 2 = ~3 waves at 50ms each = ~150ms, with timer slop allow
    // a wide margin upward but never below the theoretical minimum.
    expect(elapsed).toBeGreaterThanOrEqual(140);
    expect(elapsed).toBeLessThan(400);
  });

  it("propagates rejections", async () => {
    const limit = pLimit(2);
    const err = new Error("boom");
    await expect(limit(() => Promise.reject(err))).rejects.toBe(err);
  });

  it("propagates resolved values", async () => {
    const limit = pLimit(3);
    const out = await limit(async () => 42);
    expect(out).toBe(42);
  });

  it("throws synchronously when n <= 0", () => {
    expect(() => pLimit(0)).toThrow(/n must be > 0/);
    expect(() => pLimit(-1)).toThrow(/n must be > 0/);
  });

  it("a rejecting job does not stall the queue", async () => {
    const limit = pLimit(1);
    const settled: Array<"ok" | "fail"> = [];

    const p1 = limit(async () => {
      await sleep(10);
      throw new Error("nope");
    }).catch(() => settled.push("fail"));

    const p2 = limit(async () => {
      await sleep(10);
      return "done";
    }).then(() => settled.push("ok"));

    await Promise.all([p1, p2]);
    expect(settled).toEqual(["fail", "ok"]);
  });
});
