import { describe, it, expect } from "vitest";

// Mirrors the inline logic in app/api/admin/seed/route.ts
function buildXenditUrl(
  status: "SENT" | "PARTIALLY_PAID" | "OVERDUE" | "PAID" | "DRAFT" | "CANCELLED",
  invoiceNumber: string,
): string | null {
  const needsPaymentLink =
    status === "SENT" || status === "PARTIALLY_PAID" || status === "OVERDUE";
  return needsPaymentLink
    ? `https://checkout-staging.xendit.co/web/demo-${invoiceNumber}`
    : null;
}

describe("seed invoice xenditPaymentUrl logic", () => {
  it("sets URL for SENT invoices", () => {
    const url = buildXenditUrl("SENT", "INV-2026-0001");
    expect(url).toBe("https://checkout-staging.xendit.co/web/demo-INV-2026-0001");
  });

  it("sets URL for PARTIALLY_PAID invoices", () => {
    const url = buildXenditUrl("PARTIALLY_PAID", "INV-2026-0004");
    expect(url).toBe(
      "https://checkout-staging.xendit.co/web/demo-INV-2026-0004",
    );
  });

  it("sets URL for OVERDUE invoices", () => {
    const url = buildXenditUrl("OVERDUE", "INV-2026-0007");
    expect(url).toBe("https://checkout-staging.xendit.co/web/demo-INV-2026-0007");
  });

  it("returns null for PAID invoices", () => {
    expect(buildXenditUrl("PAID", "INV-2026-0002")).toBeNull();
  });

  it("returns null for DRAFT invoices", () => {
    expect(buildXenditUrl("DRAFT", "INV-2026-0009")).toBeNull();
  });

  it("returns null for CANCELLED invoices", () => {
    expect(buildXenditUrl("CANCELLED", "INV-2026-0010")).toBeNull();
  });

  it("URL shape is deterministic for same input", () => {
    const a = buildXenditUrl("SENT", "INV-2026-0005");
    const b = buildXenditUrl("SENT", "INV-2026-0005");
    expect(a).toBe(b);
  });
});
