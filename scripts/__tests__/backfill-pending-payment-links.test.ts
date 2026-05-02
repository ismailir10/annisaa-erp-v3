import { describe, it, expect, vi, beforeEach } from "vitest";

// `@/lib/db` and `@/lib/finance/xendit-retry` are imported by the script at
// module load. Stub both so importing the script in tests doesn't try to
// connect Prisma or fire Xendit. The test injects mock dependencies into
// `runBackfill` directly — these stubs are only here to make the import work.
vi.mock("@/lib/db", () => ({
  prisma: { $disconnect: vi.fn(), $queryRaw: vi.fn() },
}));

vi.mock("@/lib/finance/xendit-retry", () => ({
  retryPaymentLinks: vi.fn(),
}));

vi.mock("@/lib/finance/pending-breakdown", () => ({
  getPendingPaymentLinkBreakdown: vi.fn(),
}));

import {
  parseArgs,
  runBackfill,
  MAX_ITERATIONS,
  type BackfillDeps,
} from "../backfill-pending-payment-links";
import type { RetryOutcome } from "@/lib/finance/xendit-retry";
import type { PendingPaymentLinkBreakdown } from "@/lib/finance/pending-breakdown";

beforeEach(() => {
  vi.clearAllMocks();
});

function emptyBreakdown(total = 0): PendingPaymentLinkBreakdown {
  return {
    total,
    byPrefix: {
      "5xx": 0,
      "429": 0,
      "408": 0,
      network: 0,
      "401": 0,
      "403": 0,
      "422": 0,
      "4xx": 0,
      untagged: 0,
      unknown: 0,
    },
  };
}

function makeDeps(overrides: Partial<BackfillDeps> = {}): BackfillDeps & {
  logs: string[];
} {
  const logs: string[] = [];
  return {
    retry: vi.fn().mockResolvedValue({
      retried: 0,
      succeeded: 0,
      stillFailed: 0,
      results: [],
    } satisfies RetryOutcome),
    fetchBreakdown: vi.fn().mockResolvedValue(emptyBreakdown(0)),
    log: (msg: string) => logs.push(msg),
    logs,
    ...overrides,
  };
}

describe("parseArgs", () => {
  it("parses --tenant and --confirm", () => {
    expect(parseArgs(["--tenant", "tnt-1", "--confirm"])).toEqual({
      tenantId: "tnt-1",
      confirm: true,
    });
  });

  it("treats --dry-run as no-confirm", () => {
    expect(parseArgs(["--tenant", "tnt-1", "--dry-run"])).toEqual({
      tenantId: "tnt-1",
      confirm: false,
    });
  });

  it("--dry-run after --confirm wins (last flag)", () => {
    expect(parseArgs(["--tenant", "tnt-1", "--confirm", "--dry-run"])).toEqual({
      tenantId: "tnt-1",
      confirm: false,
    });
  });

  it("--confirm after --dry-run wins (last flag)", () => {
    expect(parseArgs(["--tenant", "tnt-1", "--dry-run", "--confirm"])).toEqual({
      tenantId: "tnt-1",
      confirm: true,
    });
  });

  it("returns tenantId=null when --tenant is missing", () => {
    expect(parseArgs(["--confirm"])).toEqual({
      tenantId: null,
      confirm: true,
    });
  });

  it("defaults to no-confirm when no flags provided", () => {
    expect(parseArgs([])).toEqual({ tenantId: null, confirm: false });
  });
});

describe("runBackfill — guards", () => {
  it("returns exitCode=2 when tenantId is missing", async () => {
    const deps = makeDeps();
    const result = await runBackfill({ tenantId: null, confirm: true }, deps);
    expect(result.exitCode).toBe(2);
    expect(deps.fetchBreakdown).not.toHaveBeenCalled();
    expect(deps.retry).not.toHaveBeenCalled();
    expect(deps.logs.some((l) => l.includes("--tenant <id> is required"))).toBe(true);
  });
});

describe("runBackfill — dry-run gate", () => {
  it("does NOT call retryPaymentLinks when --confirm is absent", async () => {
    const deps = makeDeps({
      fetchBreakdown: vi.fn().mockResolvedValue({
        ...emptyBreakdown(5),
        byPrefix: { ...emptyBreakdown(5).byPrefix, "5xx": 5 },
      }),
    });

    const result = await runBackfill(
      { tenantId: "tnt-1", confirm: false },
      deps,
    );

    expect(result.exitCode).toBe(0);
    expect(result.iterations).toBe(0);
    expect(deps.retry).not.toHaveBeenCalled();
    expect(deps.fetchBreakdown).toHaveBeenCalledTimes(1);
    expect(deps.logs.some((l) => l.includes("DRY-RUN"))).toBe(true);
    expect(deps.logs.some((l) => l.includes("mode=dry-run"))).toBe(true);
  });

  it("dry-run still prints the initial breakdown", async () => {
    const breakdown = {
      ...emptyBreakdown(7),
      byPrefix: { ...emptyBreakdown(7).byPrefix, "5xx": 5, "401": 2 },
    };
    const deps = makeDeps({
      fetchBreakdown: vi.fn().mockResolvedValue(breakdown),
    });

    await runBackfill({ tenantId: "tnt-1", confirm: false }, deps);

    const initialLog = deps.logs.find((l) => l.includes("initial pendingTotal=7"));
    expect(initialLog).toBeDefined();
    expect(initialLog).toContain('"5xx":5');
    expect(initialLog).toContain('"401":2');
  });
});

describe("runBackfill — empty pending", () => {
  it("exits cleanly when initial pending count is 0 even with --confirm", async () => {
    const deps = makeDeps({
      fetchBreakdown: vi.fn().mockResolvedValue(emptyBreakdown(0)),
    });

    const result = await runBackfill(
      { tenantId: "tnt-1", confirm: true },
      deps,
    );

    expect(result.exitCode).toBe(0);
    expect(result.iterations).toBe(0);
    expect(deps.retry).not.toHaveBeenCalled();
    expect(deps.logs.some((l) => l.includes("nothing to do"))).toBe(true);
  });
});

describe("runBackfill — live mode happy path", () => {
  it("runs one iteration when retry clears all pending", async () => {
    const fetchBreakdown = vi
      .fn()
      .mockResolvedValueOnce({
        ...emptyBreakdown(5),
        byPrefix: { ...emptyBreakdown(5).byPrefix, "5xx": 5 },
      })
      .mockResolvedValueOnce(emptyBreakdown(0));

    const retry = vi.fn().mockResolvedValue({
      retried: 5,
      succeeded: 5,
      stillFailed: 0,
      results: [],
    } satisfies RetryOutcome);

    const deps = makeDeps({ fetchBreakdown, retry });

    const result = await runBackfill(
      { tenantId: "tnt-1", confirm: true },
      deps,
    );

    expect(result.exitCode).toBe(0);
    expect(result.iterations).toBe(1);
    expect(result.cleared).toBe(5);
    expect(result.stalled).toBe(false);
    expect(retry).toHaveBeenCalledTimes(1);
    expect(retry).toHaveBeenCalledWith("tnt-1", null);
    expect(fetchBreakdown).toHaveBeenCalledTimes(2);
    expect(
      deps.logs.some(
        (l) => l.includes("iteration=1") && l.includes("retried=5") && l.includes("succeeded=5"),
      ),
    ).toBe(true);
    expect(deps.logs.some((l) => l.includes("DONE — all cleared"))).toBe(true);
  });

  it("loops until cleared when retries chip away progressively", async () => {
    const breakdown = (n: number) => ({
      ...emptyBreakdown(n),
      byPrefix: { ...emptyBreakdown(n).byPrefix, "5xx": n },
    });
    const fetchBreakdown = vi
      .fn()
      .mockResolvedValueOnce(breakdown(10)) // initial
      .mockResolvedValueOnce(breakdown(6)) // after iter 1
      .mockResolvedValueOnce(breakdown(2)) // after iter 2
      .mockResolvedValueOnce(emptyBreakdown(0)); // after iter 3

    const retry = vi.fn().mockResolvedValue({
      retried: 4,
      succeeded: 4,
      stillFailed: 0,
      results: [],
    } satisfies RetryOutcome);

    const deps = makeDeps({ fetchBreakdown, retry });

    const result = await runBackfill(
      { tenantId: "tnt-1", confirm: true },
      deps,
    );

    expect(result.exitCode).toBe(0);
    expect(result.iterations).toBe(3);
    expect(result.cleared).toBe(10);
    expect(result.stalled).toBe(false);
    expect(retry).toHaveBeenCalledTimes(3);
  });
});

describe("runBackfill — stall detection", () => {
  it("breaks the loop and reports stalled when no progress between iterations", async () => {
    const stuck = {
      ...emptyBreakdown(3),
      byPrefix: { ...emptyBreakdown(3).byPrefix, "401": 3 },
    };
    const fetchBreakdown = vi
      .fn()
      .mockResolvedValueOnce(stuck) // initial
      .mockResolvedValueOnce(stuck); // after iter 1 — no progress

    const retry = vi.fn().mockResolvedValue({
      retried: 3,
      succeeded: 0,
      stillFailed: 3,
      results: [],
    } satisfies RetryOutcome);

    const deps = makeDeps({ fetchBreakdown, retry });

    const result = await runBackfill(
      { tenantId: "tnt-1", confirm: true },
      deps,
    );

    expect(result.exitCode).toBe(0);
    expect(result.iterations).toBe(1);
    expect(result.stalled).toBe(true);
    expect(result.finalBreakdown?.total).toBe(3);
    expect(retry).toHaveBeenCalledTimes(1);
    expect(deps.logs.some((l) => l.includes("STALLED"))).toBe(true);
  });

  it("respects MAX_ITERATIONS cap as belt-and-suspenders", async () => {
    // Each iteration drops by exactly 1 — would loop forever without cap.
    let n = MAX_ITERATIONS + 5;
    const fetchBreakdown = vi.fn().mockImplementation(() => {
      const out = {
        ...emptyBreakdown(n),
        byPrefix: { ...emptyBreakdown(n).byPrefix, "5xx": n },
      };
      // The first call is the initial fetch; subsequent calls run after retry,
      // and retry is what nominally "clears" 1. We mimic the post-retry shape
      // directly via the n-- below — caller doesn't track which call is which.
      return Promise.resolve(out);
    });

    const retry = vi.fn().mockImplementation(async () => {
      n -= 1;
      return {
        retried: 1,
        succeeded: 1,
        stillFailed: 0,
        results: [],
      } satisfies RetryOutcome;
    });

    const deps = makeDeps({ fetchBreakdown, retry });

    const result = await runBackfill(
      { tenantId: "tnt-1", confirm: true },
      deps,
    );

    expect(result.iterations).toBe(MAX_ITERATIONS);
    expect(retry).toHaveBeenCalledTimes(MAX_ITERATIONS);
    expect(deps.logs.some((l) => l.includes("HALTED"))).toBe(true);
  });
});
