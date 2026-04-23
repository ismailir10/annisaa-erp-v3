import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InvoicesClient } from "../client";

vi.mock("../invoice-detail-sheet", () => ({
  InvoiceDetailSheet: ({
    open,
    invoiceId,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    invoiceId: string | null;
  }) => (
    <div data-testid="invoice-detail-sheet">
      {open && <div>Sheet open: {invoiceId}</div>}
    </div>
  ),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

const mockInvoices = [
  {
    id: "inv-1",
    invoiceNumber: "INV-2024-001",
    periodLabel: "Agustus 2024",
    dueDate: "2024-08-31",
    totalDue: 1000000,
    totalPaid: 0,
    status: "SENT",
    xenditPaymentUrl: null,
    sentAt: "2024-08-01",
    paidAt: null,
    createdAt: "2024-08-01",
  },
  {
    id: "inv-2",
    invoiceNumber: "INV-2024-002",
    periodLabel: "September 2024",
    dueDate: "2024-09-30",
    totalDue: 1000000,
    totalPaid: 500000,
    status: "PARTIALLY_PAID",
    xenditPaymentUrl: null,
    sentAt: "2024-09-01",
    paidAt: null,
    createdAt: "2024-09-01",
  },
  {
    id: "inv-3",
    invoiceNumber: "INV-2024-003",
    periodLabel: "Juli 2024",
    dueDate: "2024-07-31",
    totalDue: 1000000,
    totalPaid: 1000000,
    status: "PAID",
    xenditPaymentUrl: null,
    sentAt: "2024-07-01",
    paidAt: "2024-07-15",
    createdAt: "2024-07-01",
  },
];

describe("InvoicesClient (cycle-4)", () => {
  describe("Loading State", () => {
    it("shows skeleton when data is null", () => {
      render(<InvoicesClient data={null} />);
      const skeletons = document.querySelectorAll(".animate-pulse");
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe("Page Header", () => {
    it("renders Tagihan h1", () => {
      render(<InvoicesClient data={mockInvoices} />);
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Tagihan");
    });
  });

  describe("Outstanding state — Frame 4", () => {
    it("renders focal card with display-size due total", () => {
      render(<InvoicesClient data={mockInvoices} />);
      // SENT 1_000_000 unpaid + PARTIAL remaining 500_000 = 1.500.000
      expect(screen.getByText(/1\.500\.000/)).toBeInTheDocument();
    });

    it("shows count of outstanding tagihan", () => {
      render(<InvoicesClient data={mockInvoices} />);
      // Two outstanding (SENT + PARTIALLY_PAID)
      expect(screen.getByText(/2 tagihan/)).toBeInTheDocument();
    });

    it("renders Belum dibayar eyebrow group", () => {
      render(<InvoicesClient data={mockInvoices} />);
      // Eyebrow appears twice: inside focal card + as section heading
      expect(screen.getAllByText("Belum dibayar").length).toBeGreaterThan(0);
    });

    it("renders due rows with period label", () => {
      render(<InvoicesClient data={mockInvoices} />);
      expect(screen.getByText("Agustus 2024")).toBeInTheDocument();
      expect(screen.getByText("September 2024")).toBeInTheDocument();
    });

    it("renders Riwayat pembayaran eyebrow when paid history exists", () => {
      render(<InvoicesClient data={mockInvoices} />);
      expect(screen.getByText("Riwayat pembayaran")).toBeInTheDocument();
      expect(screen.getByText("Juli 2024")).toBeInTheDocument();
    });
  });

  describe("All-paid state — Frame 5", () => {
    it("renders Lunas semua celebration when no outstanding", () => {
      const allPaid = mockInvoices.map((inv) => ({
        ...inv,
        status: "PAID",
        totalPaid: inv.totalDue,
      }));
      render(<InvoicesClient data={allPaid} />);
      expect(screen.getByText("Lunas semua")).toBeInTheDocument();
      expect(screen.getByText(/Jazakumullahu khairan/)).toBeInTheDocument();
    });

    it("still shows Riwayat pembayaran with paid rows", () => {
      const allPaid = mockInvoices.map((inv) => ({
        ...inv,
        status: "PAID",
        totalPaid: inv.totalDue,
      }));
      render(<InvoicesClient data={allPaid} />);
      expect(screen.getByText("Riwayat pembayaran")).toBeInTheDocument();
    });
  });

  describe("Empty state", () => {
    it("shows neutral 'Belum ada tagihan' when no invoices ever issued", () => {
      // Spec: data === [] is the no-invoice case, not the all-paid case.
      render(<InvoicesClient data={[]} />);
      expect(screen.getByText("Belum ada tagihan")).toBeInTheDocument();
      expect(screen.queryByText("Lunas semua")).not.toBeInTheDocument();
    });
  });

  describe("Row click opens sheet", () => {
    it("opens detail sheet when an invoice row is clicked", async () => {
      const user = userEvent.setup();
      render(<InvoicesClient data={mockInvoices} />);
      const row = screen.getByRole("button", { name: /Agustus 2024/ });
      await user.click(row);
      expect(screen.getByText(/Sheet open: inv-1/)).toBeInTheDocument();
    });
  });
});
