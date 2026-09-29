/**
 * Parent invoice detail sheet (finance-safety, PAR-7 / PAR-8).
 * PAR-8: the focal figure is labelled "Sisa tagihan" and a Total / Sudah
 *        dibayar / Sisa block sits under Rincian.
 * PAR-7: an unpaid invoice with no payment link tells the parent how to reach
 *        the school (WhatsApp/tel when SCHOOL_CONTACT_PHONE is configured, always
 *        the invoice number to quote).
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { InvoiceDetailSheet } from "../invoice-detail-sheet";

const base = {
  id: "inv-3",
  invoiceNumber: "INV-2026-0003",
  periodLabel: "Feb-2026",
  dueDate: "2026-02-15",
  totalDue: 850000,
  totalPaid: 400000,
  status: "PARTIALLY_PAID",
  xenditPaymentUrl: null as string | null,
  schoolContactPhone: null as string | null,
  sentAt: "2026-02-01T00:00:00.000Z",
  paidAt: null as string | null,
  lines: [{ id: "l1", labelSnapshot: "SPP", amount: 850000, finalAmount: 850000, adjustmentAmount: 0, adjustmentNote: null }],
  payments: [
    { id: "p1", amount: 400000, method: "CASH", reference: "Cicilan-1", paidAt: "2026-02-05T03:00:00.000Z" },
  ],
  student: { name: "Aisyah Putri", nickname: "Aisyah", classSection: null },
};

function renderSheet(over: Partial<typeof base> = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ ...base, ...over }) })),
  );
  render(<InvoiceDetailSheet open onOpenChange={() => {}} invoiceId="inv-3" />);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("InvoiceDetailSheet — partial payment wording (PAR-8)", () => {
  it("labels the focal amount 'Sisa tagihan' and lists Total, Sudah dibayar, Sisa", async () => {
    renderSheet();
    const totals = await screen.findByTestId("invoice-totals");
    const text = (totals.textContent ?? "").replace(/\s/g, "");
    expect(text).toContain("Totaltagihan");
    expect(text).toMatch(/Totaltagihan.*850\.000/);
    expect(text).toMatch(/Sudahdibayar.*400\.000/);
    expect(text).toMatch(/Sisatagihan.*450\.000/);
    expect(screen.getAllByText("Sisa tagihan").length).toBeGreaterThanOrEqual(2); // caption + row
    expect(screen.queryByText(/sisa\s+jatuh tempo/i)).not.toBeInTheDocument();
  });

  it("does not show the admin's internal payment reference to the parent", async () => {
    renderSheet();
    await screen.findByTestId("invoice-totals");
    expect(screen.queryByText(/Cicilan-1/)).not.toBeInTheDocument();
  });

  it("a settled invoice shows Total tagihan and no Sisa row", async () => {
    renderSheet({ status: "PAID", totalPaid: 850000, paidAt: "2026-02-10T03:00:00.000Z" });
    const totals = await screen.findByTestId("invoice-totals");
    expect(within(totals).queryByText("Sisa tagihan")).not.toBeInTheDocument();
    expect(screen.getByText("Total tagihan", { selector: "p" })).toBeInTheDocument();
  });
});

describe("InvoiceDetailSheet — no payment link (PAR-7)", () => {
  it("offers WhatsApp + telephone links with the invoice number prefilled when the school contact is configured", async () => {
    renderSheet({ schoolContactPhone: "0812-8877-4402" });
    const box = await screen.findByTestId("contact-school");
    expect(box).toHaveTextContent("INV-2026-0003");

    const wa = within(box).getByRole("link", { name: /WhatsApp/ });
    expect(wa.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/6281288774402\?text=/);
    expect(decodeURIComponent(wa.getAttribute("href")!)).toContain("INV-2026-0003");
    expect(within(box).getByRole("link", { name: /Telepon/ })).toHaveAttribute("href", "tel:081288774402");
  });

  it("without a configured number still says to contact the school and quote the invoice number (no dead links)", async () => {
    renderSheet({ schoolContactPhone: null });
    const box = await screen.findByTestId("contact-school");
    expect(box).toHaveTextContent("hubungi admin sekolah");
    expect(box).toHaveTextContent("INV-2026-0003");
    expect(within(box).queryByRole("link")).not.toBeInTheDocument();
  });

  it("a live payment link keeps 'Bayar sekarang' and hides the contact box", async () => {
    renderSheet({ xenditPaymentUrl: "https://pay.example/abc" });
    await waitFor(() => expect(screen.getByRole("button", { name: /Bayar sekarang/ })).toBeInTheDocument());
    expect(screen.queryByTestId("contact-school")).not.toBeInTheDocument();
  });
});
