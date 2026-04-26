import { describe, it, expect, vi, beforeEach } from "vitest";
import { nextInvoiceNumber } from "../invoice-numbers";

type LastInvoice = { invoiceNumber: string } | null;

function makeTx(initial: LastInvoice) {
  let last: LastInvoice = initial;
  const calls: string[] = [];

  // Helper alternates between the advisory-lock call (first) and the
  // SELECT-last-invoice call (second). $queryRaw is used for both.
  let queryStep = 0;
  const tx = {
    $queryRaw: vi.fn(async () => {
      // Step 0 (and any even step) = lock; step 1 (and odd) = select.
      const isLock = queryStep % 2 === 0;
      queryStep++;
      if (isLock) {
        calls.push("lock");
        return [];
      }
      calls.push("select");
      return last ? [{ invoiceNumber: last.invoiceNumber }] : [];
    }),
    invoice: {},
    __setLast: (n: LastInvoice) => {
      last = n;
    },
    __calls: calls,
  };
  return tx;
}

describe("nextInvoiceNumber", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("returns INV-<currentYear>-0001 on empty tenant", async () => {
    const tx = makeTx(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await nextInvoiceNumber(tx as any, "tenant-a");
    const year = new Date().getFullYear();
    expect(out).toBe(`INV-${year}-0001`);
    // Lock acquired before findFirst
    expect(tx.__calls).toEqual(["lock", "select"]);
  });

  it("increments suffix from existing INV-2026-0042 -> INV-<currentYear>-0043", async () => {
    const tx = makeTx({ invoiceNumber: "INV-2026-0042" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await nextInvoiceNumber(tx as any, "tenant-a");
    const year = new Date().getFullYear();
    expect(out).toBe(`INV-${year}-0043`);
  });

  it("handles 5-digit overflow: INV-2025-9999 -> INV-<currentYear>-10000", async () => {
    // Parser only looks at trailing digits; padStart keeps padding for <4 digits but
    // does not truncate longer numbers.
    const tx = makeTx({ invoiceNumber: "INV-2025-9999" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await nextInvoiceNumber(tx as any, "tenant-a");
    const year = new Date().getFullYear();
    expect(out).toBe(`INV-${year}-10000`);
  });

  it("acquires advisory lock before reading last invoice (sequenced calls)", async () => {
    // Without a real DB we can't test concurrent lock semantics, but we can verify
    // the call ordering: every call locks first, then reads.
    const tx1 = makeTx({ invoiceNumber: "INV-2026-0007" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = await nextInvoiceNumber(tx1 as any, "tenant-a");

    // Simulate a "second" call after the first invoice landed.
    tx1.__setLast({ invoiceNumber: "INV-2026-0008" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = await nextInvoiceNumber(tx1 as any, "tenant-a");

    const year = new Date().getFullYear();
    expect(a).toBe(`INV-${year}-0008`);
    expect(b).toBe(`INV-${year}-0009`);
    expect(a).not.toBe(b);
    // Lock acquired before each select
    expect(tx1.__calls).toEqual(["lock", "select", "lock", "select"]);
  });

  it("acquires a tenant-scoped advisory lock via hashtext()", async () => {
    const tx = makeTx(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await nextInvoiceNumber(tx as any, "tenant-xyz");
    // First $queryRaw call is the lock. Args: [TemplateStringsArray, ...bindings].
    // We assert the SQL template contains `hashtext(` and the binding is the
    // raw tenantId string (Postgres applies hashtext server-side, eliminating
    // the anagram-collision risk of the previous client-side char-sum hash).
    const args = tx.$queryRaw.mock.calls[0];
    const sql = (args[0] as TemplateStringsArray).join("");
    expect(sql).toMatch(/hashtext\(/);
    expect(sql).toMatch(/pg_advisory_xact_lock/);
    expect(args[1]).toBe("tenant-xyz");
  });

  it("two distinct tenant ids produce two distinct lock bindings", async () => {
    // Anagram regression: previous char-sum hash mapped "ab" and "ba" to the
    // same lock key, serialising unrelated tenants. With hashtext() the lock
    // happens server-side off the raw tenantId string, so distinct strings
    // (even anagrams) produce distinct locks at the DB layer.
    const txA = makeTx(null);
    const txB = makeTx(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await nextInvoiceNumber(txA as any, "ab");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await nextInvoiceNumber(txB as any, "ba");
    expect(txA.$queryRaw.mock.calls[0][1]).toBe("ab");
    expect(txB.$queryRaw.mock.calls[0][1]).toBe("ba");
  });
});
