import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createXenditSession } from "@/lib/payments/xendit/client";
import type { CreateSessionParams } from "@/lib/payments/types";

/**
 * Cycle 2026-08-20-invoice-due-date-to-gateway T1.
 *
 * Xendit's `expires_at` is already an absolute instant, so the adapter's only
 * job is to serialise `params.expiresAt` unchanged. Trivial logic, but it is
 * the half of the port with no arithmetic to catch a mistake — a future
 * refactor of the body builder could drop or recompute the field and every
 * other test would still pass. This is the test that would notice.
 */

const baseParams: CreateSessionParams = {
  referenceId: "inv-xendit-expiry",
  amount: 250_000,
  description: "SPP Oktober — Fulan",
  customerName: "Wali Murid",
  successReturnUrl: "https://talib.test/payment/success",
  cancelReturnUrl: "https://talib.test/payment/cancel",
};

describe("createXenditSession — expiresAt passthrough", () => {
  let capturedBody: Record<string, unknown>;

  beforeEach(() => {
    vi.stubEnv("DEMO_MODE", "");
    vi.stubEnv("XENDIT_SECRET_KEY", "xnd_test_key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        capturedBody = JSON.parse(init.body as string);
        return new Response(
          JSON.stringify({
            session_id: "sess-1",
            payment_link_url: "https://checkout.xendit.co/web/sess-1",
            status: "ACTIVE",
            expires_at: capturedBody.expires_at,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends the caller's exact instant as ISO, without recomputing it", async () => {
    // End of 10 Nov 2026 in WIB — the shape `resolveSessionExpiry` produces
    // for Bu Shanti's 27→10 collection window.
    const expiresAt = new Date("2026-11-10T16:59:59.000Z");

    await createXenditSession({ ...baseParams, expiresAt });

    expect(capturedBody.expires_at).toBe("2026-11-10T16:59:59.000Z");
  });

  it("falls back to 7 days out when the caller supplies no instant", async () => {
    const before = Date.now();
    await createXenditSession(baseParams);
    const after = Date.now();

    const sent = new Date(capturedBody.expires_at as string).getTime();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    expect(sent).toBeGreaterThanOrEqual(before + sevenDays);
    expect(sent).toBeLessThanOrEqual(after + sevenDays);
  });
});
