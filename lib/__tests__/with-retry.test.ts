/**
 * Tests for `withXenditRetry` — the inline retry helper.
 *
 * Covers Task 2 acceptance:
 * (a) success-on-attempt-1
 * (b) success-after-1-retry on 5xx
 * (c) terminal failure after 3 attempts on persistent 5xx
 * (d) immediate fail on hard 401 (1 attempt only)
 * (e) 429 with Retry-After: 2 (2000ms) waits ~2s
 * (f) 429 with Retry-After: 99 capped at 3s (Task 1 already caps at 3000ms)
 * (g) 429 with no Retry-After uses default backoff (BACKOFFS_MS[0] = 250ms)
 *
 * Uses fake timers + `vi.advanceTimersByTimeAsync` so backoff sleeps don't
 * actually consume wall clock. Pattern: kick off the helper, await microtasks
 * to let attempt N's catch block schedule its setTimeout, advance timers,
 * await microtasks again so attempt N+1's fn() resolves.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { XenditApiError } from "../xendit/client";
import {
  BACKOFF_429_MS,
  BACKOFFS_MS,
  MAX_ATTEMPTS,
  MAX_ATTEMPTS_429,
  withXenditRetry,
} from "../xendit/with-retry";

const ctx = { invoiceId: "inv-1", tenantId: "tenant-1" };

function transient5xx(): XenditApiError {
  return new XenditApiError({
    status: 503,
    code: "5xx",
    retriable: true,
    message: "Xendit returned 503",
  });
}

function hard401(): XenditApiError {
  return new XenditApiError({
    status: 401,
    code: "401",
    retriable: false,
    message: "Xendit returned 401",
  });
}

function rateLimited(retryAfterMs?: number): XenditApiError {
  return new XenditApiError({
    status: 429,
    code: "429",
    retriable: true,
    message: "Xendit returned 429",
    retryAfterMs,
  });
}

let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  logSpy.mockRestore();
  vi.useRealTimers();
});

describe("withXenditRetry — exported constants", () => {
  it("exports MAX_ATTEMPTS = 3 and BACKOFFS_MS = [250, 1000]", () => {
    expect(MAX_ATTEMPTS).toBe(3);
    expect(BACKOFFS_MS).toEqual([250, 1000]);
  });

  it("exports MAX_ATTEMPTS_429 = 2 and BACKOFF_429_MS = 1500 (cycle 2026-04-28 T3)", () => {
    expect(MAX_ATTEMPTS_429).toBe(2);
    expect(BACKOFF_429_MS).toBe(1500);
  });
});

describe("withXenditRetry — happy path", () => {
  it("(a) returns value on attempt 1 with one success log", async () => {
    const fn = vi.fn().mockResolvedValue("ok");

    const result = await withXenditRetry(fn, ctx);

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledTimes(1);
    const logLine = logSpy.mock.calls[0][0] as string;
    expect(logLine).toContain("[XENDIT ATTEMPT]");
    expect(logLine).toContain("tenantId=tenant-1");
    expect(logLine).toContain("invoiceId=inv-1");
    expect(logLine).toContain("attempt=1");
    expect(logLine).toContain("result=success");
    expect(logLine).toContain("status=null");
    expect(logLine).toMatch(/durationMs=\d+/);
  });
});

describe("withXenditRetry — retry behavior", () => {
  it("(b) succeeds on attempt 2 after one 5xx; logs transient then success", async () => {
    vi.useFakeTimers();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(transient5xx())
      .mockResolvedValueOnce("ok");

    const promise = withXenditRetry(fn, ctx);
    // Let attempt 1's rejection settle and the catch schedule the backoff
    await vi.advanceTimersByTimeAsync(0);
    // Advance past the 250ms backoff
    await vi.advanceTimersByTimeAsync(BACKOFFS_MS[0]);
    const result = await promise;

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(logSpy).toHaveBeenCalledTimes(2);
    expect(logSpy.mock.calls[0][0]).toMatch(/attempt=1 result=transient status=503/);
    expect(logSpy.mock.calls[1][0]).toMatch(/attempt=2 result=success status=null/);
  });

  it("(c) throws last XenditApiError after 3 attempts on persistent 5xx", async () => {
    vi.useFakeTimers();
    const err = transient5xx();
    const fn = vi.fn().mockRejectedValue(err);

    const promise = withXenditRetry(fn, ctx).catch((e) => e);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(BACKOFFS_MS[0]); // backoff 1 → 2
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(BACKOFFS_MS[1]); // backoff 2 → 3
    const caught = await promise;

    expect(caught).toBeInstanceOf(XenditApiError);
    expect((caught as XenditApiError).code).toBe("5xx");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(logSpy).toHaveBeenCalledTimes(3);
    // All three logs are transient (retriable error, just out of budget)
    expect(logSpy.mock.calls[0][0]).toMatch(/attempt=1 result=transient/);
    expect(logSpy.mock.calls[1][0]).toMatch(/attempt=2 result=transient/);
    expect(logSpy.mock.calls[2][0]).toMatch(/attempt=3 result=transient/);
  });
});

describe("withXenditRetry — hard errors skip retry", () => {
  it("(d) re-throws hard 401 after exactly 1 attempt with hard log", async () => {
    const err = hard401();
    const fn = vi.fn().mockRejectedValue(err);

    await expect(withXenditRetry(fn, ctx)).rejects.toBe(err);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toMatch(/attempt=1 result=hard status=401/);
  });

  it("re-throws non-XenditApiError as hard immediately", async () => {
    const err = new Error("programmer bug");
    const fn = vi.fn().mockRejectedValue(err);

    await expect(withXenditRetry(fn, ctx)).rejects.toBe(err);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toMatch(/attempt=1 result=hard status=null/);
  });
});

describe("withXenditRetry — Retry-After honored", () => {
  it("(e) 429 with retryAfterMs=2000 waits ~2s before retry", async () => {
    vi.useFakeTimers();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(rateLimited(2000))
      .mockResolvedValueOnce("ok");

    const promise = withXenditRetry(fn, ctx);
    await vi.advanceTimersByTimeAsync(0);

    // Advancing by less than 2000ms should NOT trigger attempt 2 yet
    await vi.advanceTimersByTimeAsync(1999);
    expect(fn).toHaveBeenCalledTimes(1);

    // Cross the 2000ms threshold
    await vi.advanceTimersByTimeAsync(1);
    const result = await promise;

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("(f) 429 with retryAfterMs=3000 (already capped by Task 1) waits ~3s", async () => {
    vi.useFakeTimers();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(rateLimited(3000))
      .mockResolvedValueOnce("ok");

    const promise = withXenditRetry(fn, ctx);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2999);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    const result = await promise;

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("(g) 429 with no Retry-After falls back to BACKOFF_429_MS = 1500ms (cycle 2026-04-28 T3)", async () => {
    vi.useFakeTimers();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(rateLimited(undefined))
      .mockResolvedValueOnce("ok");

    const promise = withXenditRetry(fn, ctx);
    await vi.advanceTimersByTimeAsync(0);

    // Advancing by less than 1500ms should NOT trigger attempt 2 yet
    await vi.advanceTimersByTimeAsync(1499);
    expect(fn).toHaveBeenCalledTimes(1);
    // Cross the 1500ms threshold
    await vi.advanceTimersByTimeAsync(1);
    const result = await promise;

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

// --------------------------------------------------------------------------
// withXenditRetry — 429 attempt cap (cycle 2026-04-28 T3)
// --------------------------------------------------------------------------

describe("withXenditRetry — 429 attempt cap", () => {
  it("(h) 429-storm exhausts at exactly 2 attempts (1 retry), not 3", async () => {
    vi.useFakeTimers();
    const err = rateLimited(undefined);
    const fn = vi.fn().mockRejectedValue(err);

    const promise = withXenditRetry(fn, ctx).catch((e) => e);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(BACKOFF_429_MS); // backoff after attempt 1
    const caught = await promise;

    // Re-throws on attempt 2 (no third attempt scheduled).
    expect(caught).toBeInstanceOf(XenditApiError);
    expect((caught as XenditApiError).code).toBe("429");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(logSpy).toHaveBeenCalledTimes(2);
    expect(logSpy.mock.calls[0][0]).toMatch(/attempt=1 result=transient status=429/);
    expect(logSpy.mock.calls[1][0]).toMatch(/attempt=2 result=transient status=429/);
  });

  it("(i) 429 then 200 succeeds on retry (single retry budget honored)", async () => {
    vi.useFakeTimers();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(rateLimited(undefined))
      .mockResolvedValueOnce("ok");

    const promise = withXenditRetry(fn, ctx);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(BACKOFF_429_MS);
    const result = await promise;

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("(j) 5xx storm regression guard — still uses 3 attempts despite 429 trim", async () => {
    vi.useFakeTimers();
    const err = transient5xx();
    const fn = vi.fn().mockRejectedValue(err);

    const promise = withXenditRetry(fn, ctx).catch((e) => e);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(BACKOFFS_MS[0]);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(BACKOFFS_MS[1]);
    const caught = await promise;

    // 5xx must still get the full 3-attempt budget — only 429 was trimmed.
    expect(caught).toBeInstanceOf(XenditApiError);
    expect((caught as XenditApiError).code).toBe("5xx");
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
