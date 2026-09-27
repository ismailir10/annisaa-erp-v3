/**
 * T7 (cycle 2026-09-26, admin-ui-standard-c1) — the invoices list's student
 * cell is now a `DataTableLinkCell` `<Link>` to the invoice detail page;
 * `DataTableRowActions` no longer gets `onView` for this list (the row's
 * "Coba Lagi Link" / "Batalkan" menu is unaffected).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { InvoicesClient } from "@/app/admin/invoices/invoices-client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

const invoice = {
  id: "inv1",
  invoiceNumber: "INV-0001",
  periodLabel: "September 2026",
  dueDate: "2026-09-30",
  totalDue: 500000,
  totalPaid: 0,
  status: "SENT",
  createdAt: "2026-09-01T00:00:00.000Z",
  student: { name: "Aisyah Putri", nickname: null },
  _count: { payments: 0 },
};

function stubFetch() {
  return vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/invoices/stats")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          total: 1, draft: 0, sent: 1, partiallyPaid: 0, paid: 0, overdue: 0, cancelled: 0, pendingPaymentLink: 0,
        }),
      } as Response);
    }
    if (url.includes("/api/billing-runs")) {
      return Promise.resolve({ ok: true, json: async () => ({ data: [] }) } as Response);
    }
    if (url.includes("/api/academic-years")) {
      return Promise.resolve({ ok: true, json: async () => [] } as Response);
    }
    if (url.includes("/api/invoices?")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: [invoice],
          pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        }),
      } as Response);
    }
    return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
  });
}

describe("InvoicesClient — name is the link (T7)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", stubFetch());
  });

  it("renders the student name as a link to the invoice detail page and drops the separate Lihat button", async () => {
    render(
      <InvoicesClient
        gatewayId="xendit"
        capabilities={{ create: true, recordPayment: true, void: true }}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByText("Belum ada tagihan")).not.toBeInTheDocument();
    });

    const nameLink = await screen.findByRole("link", { name: /Aisyah Putri/ });
    expect(nameLink).toHaveAttribute("href", "/admin/invoices/inv1");
    expect(screen.queryByRole("button", { name: /^Lihat/ })).not.toBeInTheDocument();
  });
});
