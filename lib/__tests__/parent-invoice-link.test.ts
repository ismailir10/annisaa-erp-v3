import { describe, it, expect } from "vitest";
import { paymentLinkState } from "@/lib/parent-invoice-link";

describe("paymentLinkState", () => {
  const NOW = new Date("2026-05-12T10:00:00Z");

  it("returns 'ready' when xenditPaymentUrl is present", () => {
    expect(paymentLinkState(true, "2026-05-12T09:00:00Z", NOW)).toBe("ready");
    // Even when sentAt is null — a present link wins.
    expect(paymentLinkState(true, null, NOW)).toBe("ready");
  });

  it("returns 'pending' when no link and invoice was sent < 24h ago", () => {
    expect(
      paymentLinkState(false, "2026-05-12T09:00:00Z", NOW), // 1h ago
    ).toBe("pending");
    expect(
      paymentLinkState(false, "2026-05-11T11:00:00Z", NOW), // 23h ago
    ).toBe("pending");
  });

  it("returns 'stale' when no link and invoice was sent > 24h ago", () => {
    expect(
      paymentLinkState(false, "2026-05-11T09:00:00Z", NOW), // 25h ago
    ).toBe("stale");
    expect(
      paymentLinkState(false, "2026-05-01T10:00:00Z", NOW), // 11 days ago
    ).toBe("stale");
  });

  it("treats the exact 24h boundary as pending (uses > not >=)", () => {
    // 24h - 1ms is still pending; 24h + 1ms is stale.
    expect(
      paymentLinkState(false, "2026-05-11T10:00:00Z", NOW), // exactly 24h
    ).toBe("pending");
    expect(
      paymentLinkState(false, "2026-05-11T09:59:59Z", NOW), // 24h + 1s
    ).toBe("stale");
  });

  it("returns 'stale' when no link and sentAt is missing entirely", () => {
    // Missing sentAt means we can't tell how long it's been pending; fail
    // safe so the parent gets actionable copy ("Hubungi admin") instead
    // of an indefinitely-optimistic "coba lagi" message.
    expect(paymentLinkState(false, null, NOW)).toBe("stale");
  });

  it("returns 'stale' when sentAt is unparseable", () => {
    expect(paymentLinkState(false, "not-a-date", NOW)).toBe("stale");
  });
});
