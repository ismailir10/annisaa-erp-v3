import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { nextInvoiceNumber, reserveInvoiceNumbers } from "../invoice-numbers";

/**
 * The new allocator issues a single `tx.$queryRaw` call:
 *   INSERT INTO "InvoiceNumberSequence" … VALUES (tenantId, year, 1)
 *   ON CONFLICT (tenantId, year) DO UPDATE SET "lastNumber" = … + 1
 *   RETURNING "lastNumber";
 *
 * The mock returns a configurable `lastNumber` so tests can simulate first
 * allocation (1), Nth allocation (N), or empty rows (defensive fallback).
 */
function makeTx(lastNumber: number | null) {
  const tx = {
    $queryRaw: vi.fn(async (..._args: unknown[]) => {
      if (lastNumber === null) return [];
      return [{ lastNumber }];
    }),
  };
  return tx;
}

describe("nextInvoiceNumber", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("happy path: lastNumber=1 returns INV-<year>-0001", async () => {
    const tx = makeTx(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await nextInvoiceNumber(tx as any, "tenant-a");
    const year = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
    }).format(new Date());
    expect(out).toBe(`INV-${year}-0001`);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("subsequent allocation: lastNumber=2 returns INV-<year>-0002", async () => {
    const tx = makeTx(2);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await nextInvoiceNumber(tx as any, "tenant-a");
    const year = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
    }).format(new Date());
    expect(out).toBe(`INV-${year}-0002`);
  });

  it("issues exactly one $queryRaw call (atomic INSERT … RETURNING — no MAX scan, no advisory lock)", async () => {
    const tx = makeTx(7);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await nextInvoiceNumber(tx as any, "tenant-a");
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    const args = tx.$queryRaw.mock.calls[0];
    const sql = (args[0] as TemplateStringsArray).join("");
    expect(sql).toMatch(/INSERT INTO "InvoiceNumberSequence"/);
    expect(sql).toMatch(/ON CONFLICT \("tenantId", "year"\)/);
    expect(sql).toMatch(/RETURNING "lastNumber"/);
    // Bindings (tagged-template substitutions): tenantId, year, count, count.
    // count appears twice — once in VALUES (..., ${count}) and once in
    // DO UPDATE SET lastNumber = ... + ${count}.
    expect(args[1]).toBe("tenant-a");
    expect(args[2]).toBe(
      Number(
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Jakarta",
          year: "numeric",
        }).format(new Date())
      )
    );
    expect(args[3]).toBe(1);
    expect(args[4]).toBe(1);
  });

  it("year boundary: UTC=2025-12-31T17:30Z (= 2026-01-01T00:30 WIB) → year is 2026", async () => {
    // 2025-12-31 17:30 UTC + 7h Jakarta offset = 2026-01-01 00:30 WIB.
    // The allocator MUST format in Asia/Jakarta, so getFullYear() (which would
    // return 2025) is unacceptable. This test pins the WIB calculation.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-12-31T17:30:00Z"));
    const tx = makeTx(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await nextInvoiceNumber(tx as any, "tenant-a");
    expect(out).toBe("INV-2026-0001");
    // The bound year must also be 2026 (the row gets seeded under the WIB year).
    const args = tx.$queryRaw.mock.calls[0];
    expect(args[2]).toBe(2026);
  });

  it("year boundary inverse: UTC=2026-01-01T16:00Z (= 2026-01-01T23:00 WIB) → still 2026", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T16:00:00Z"));
    const tx = makeTx(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await nextInvoiceNumber(tx as any, "tenant-a");
    expect(out).toBe("INV-2026-0001");
  });

  it("padding: lastNumber=12345 returns INV-<year>-12345 (no truncation past 4 digits)", async () => {
    const tx = makeTx(12345);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await nextInvoiceNumber(tx as any, "tenant-a");
    const year = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
    }).format(new Date());
    expect(out).toBe(`INV-${year}-12345`);
  });

  it("padding: lastNumber=42 zero-pads to 0042", async () => {
    const tx = makeTx(42);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await nextInvoiceNumber(tx as any, "tenant-a");
    const year = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
    }).format(new Date());
    expect(out).toBe(`INV-${year}-0042`);
  });

  it("defensive fallback: empty rows returned → INV-<year>-0001", async () => {
    // Postgres should never return zero rows from an INSERT … ON CONFLICT
    // DO UPDATE … RETURNING — but the nullish coalesce protects against
    // unexpected driver behaviour without throwing into the caller's tx.
    const tx = makeTx(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await nextInvoiceNumber(tx as any, "tenant-a");
    const year = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
    }).format(new Date());
    expect(out).toBe(`INV-${year}-0001`);
  });

  it("binds tenantId verbatim (no client-side hashing)", async () => {
    const tx = makeTx(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await nextInvoiceNumber(tx as any, "tenant-xyz");
    const args = tx.$queryRaw.mock.calls[0];
    expect(args[1]).toBe("tenant-xyz");
  });
});

describe("reserveInvoiceNumbers", () => {
  it("count=5 returns 5 contiguous numbers ending at lastNumber", async () => {
    // DB returned lastNumber=15 → 5 numbers were just reserved → range [11..15]
    const tx = makeTx(15);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nums = await reserveInvoiceNumbers(tx as any, "tenant-a", 5);
    const year = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
    }).format(new Date());
    expect(nums).toEqual([
      `INV-${year}-0011`,
      `INV-${year}-0012`,
      `INV-${year}-0013`,
      `INV-${year}-0014`,
      `INV-${year}-0015`,
    ]);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("count=1 first allocation: returns single INV-<year>-0001", async () => {
    const tx = makeTx(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nums = await reserveInvoiceNumbers(tx as any, "tenant-a", 1);
    const year = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
    }).format(new Date());
    expect(nums).toEqual([`INV-${year}-0001`]);
  });

  it("rejects non-positive count", async () => {
    const tx = makeTx(1);
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reserveInvoiceNumbers(tx as any, "tenant-a", 0)
    ).rejects.toThrow(/positive integer/);
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reserveInvoiceNumbers(tx as any, "tenant-a", -3)
    ).rejects.toThrow(/positive integer/);
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reserveInvoiceNumbers(tx as any, "tenant-a", 1.5)
    ).rejects.toThrow(/positive integer/);
  });

  it("count=25 produces 25 numbers (matches BATCH_SIZE)", async () => {
    const tx = makeTx(25);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nums = await reserveInvoiceNumbers(tx as any, "tenant-a", 25);
    expect(nums).toHaveLength(25);
    expect(nums[0]).toMatch(/-0001$/);
    expect(nums[24]).toMatch(/-0025$/);
  });
});
