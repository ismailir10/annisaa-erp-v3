import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    invoice: { findUnique: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("@/lib/xendit/client", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/xendit/client")>(
      "@/lib/xendit/client",
    );
  return {
    ...actual,
    createXenditSession: vi.fn(),
    stripQuery: (url: string | null | undefined) => {
      if (!url) return null;
      try {
        const u = new URL(url);
        return u.origin + u.pathname;
      } catch {
        return null;
      }
    },
  };
});

import { resolveAppOrigin } from "../xendit/helpers";

describe("resolveAppOrigin", () => {
  const original = process.env.NEXT_PUBLIC_APP_URL;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = original;
  });

  it("returns requestOrigin when provided (wins over env)", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://prod.example.com";
    expect(resolveAppOrigin("https://preview-abc.vercel.app")).toBe(
      "https://preview-abc.vercel.app",
    );
  });

  it("falls back to NEXT_PUBLIC_APP_URL when requestOrigin missing", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://prod.example.com";
    expect(resolveAppOrigin()).toBe("https://prod.example.com");
  });

  it("throws descriptive error when both requestOrigin and env are missing", () => {
    expect(() => resolveAppOrigin()).toThrow(/No origin available/);
    expect(() => resolveAppOrigin(undefined)).toThrow(/NEXT_PUBLIC_APP_URL/);
  });

  // Pinned per cycle 2026-04-27-finance-ui-polish T7. Without this, a future
  // refactor that drops the requestOrigin parameter or reorders the priority
  // chain could silently route preview/staging traffic back to prod.
  it("preview/staging origin survives even when prod env is set (priority pin)", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://annisaa-erp-v3.vercel.app";
    const stagingOrigin =
      "https://annisaa-erp-v3-git-staging-ismails-projects-196d40d3.vercel.app";
    expect(resolveAppOrigin(stagingOrigin)).toBe(stagingOrigin);
    const previewOrigin = "https://annisaa-erp-v3-git-feat-x-ismails-projects.vercel.app";
    expect(resolveAppOrigin(previewOrigin)).toBe(previewOrigin);
  });
});

describe("createXenditSessionForInvoice — withXenditRetry wrapping", () => {
  const originalEnv = process.env.NEXT_PUBLIC_APP_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "https://annisaa-erp-v3.vercel.app";
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalEnv === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = originalEnv;
  });

  // Pinned per cycle 2026-04-27-invoice-create-auto-retry T3. The wrap around
  // createXenditSession() must surface the typed XenditApiError after the retry
  // budget is exhausted so route-handler callers (T4) can prefix-tag
  // paymentLinkError on `error.code`. Regression here would silently re-throw
  // a generic Error and the prefix tagger would fall through to "unknown:".
  it("propagates XenditApiError with code:'5xx' after 3 retry attempts", async () => {
    vi.useFakeTimers();

    const { createXenditSession } = await import("@/lib/xendit/client");
    const { XenditApiError } = await import("@/lib/xendit/client");
    const { prisma } = await import("@/lib/db");

    const transient5xx = new XenditApiError({
      status: 503,
      code: "5xx",
      retriable: true,
      message: "Xendit returned 503",
    });
    vi.mocked(createXenditSession).mockRejectedValue(transient5xx);

    vi.mocked(prisma.invoice.findUnique).mockResolvedValue({
      id: "inv-5xx",
      tenantId: "tnt-1",
      status: "SENT",
      totalDue: 1000,
      totalPaid: 0,
      invoiceNumber: "INV-5XX",
      periodLabel: "Apr 2026",
      student: { name: "Aisy", guardians: [] },
      lines: [],
    } as never);
    vi.mocked(prisma.invoice.update).mockResolvedValue({} as never);

    const { createXenditSessionForInvoice } = await import("../xendit/helpers");

    const promise = createXenditSessionForInvoice("inv-5xx", "tnt-1");
    // Backoffs: 250ms (after attempt 1) + 1000ms (after attempt 2) = 1250ms
    // Use a bare `.catch` to swallow the rejection while we drive timers,
    // then assert the rejection on the original promise below.
    promise.catch(() => {});
    await vi.advanceTimersByTimeAsync(1250);

    await expect(promise).rejects.toBeInstanceOf(XenditApiError);
    await expect(promise).rejects.toMatchObject({ code: "5xx", status: 503 });

    // Exactly 3 attempts — the retry budget is MAX_ATTEMPTS=3. A 4th would
    // breach the per-request budget math in the cycle spec.
    expect(vi.mocked(createXenditSession)).toHaveBeenCalledTimes(3);
    // DB persist (step 4) must NOT run when the wrapped call throws — the
    // `await` on the wrap short-circuits before `prisma.invoice.update`.
    expect(vi.mocked(prisma.invoice.update)).not.toHaveBeenCalled();
  });
});
