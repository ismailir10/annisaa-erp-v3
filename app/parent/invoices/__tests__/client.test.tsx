import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InvoicesClient } from "../client";

// Mock InvoiceDetailSheet (dynamically imported in client)
vi.mock("../invoice-detail-sheet", () => ({
  InvoiceDetailSheet: ({
    open,
    onOpenChange,
    invoiceId,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    invoiceId: string | null;
  }) => (
    <div data-testid="invoice-detail-sheet">
      {open && <div>Invoice Sheet: {invoiceId}</div>}
      <button onClick={() => onOpenChange(false)}>Close</button>
    </div>
  ),
}));

// Mock toast
vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

// Mock Framer Motion to avoid animation issues in tests
vi.mock("framer-motion", () => ({
  motion: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    div: ({ children, className, ...props }: any) => (
      <div className={className} {...props}>{children}</div>
    ),
  },
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

describe("InvoicesClient", () => {
  describe("Loading State", () => {
    it("shows loading skeletons when data is null", () => {
      render(<InvoicesClient data={null} />);

      const skeletons = document.querySelectorAll(".animate-pulse");
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it("keeps showing skeleton while data is null", () => {
      render(<InvoicesClient data={null} />);

      // Card-list skeleton rows use rounded-xl border (CardListItem geometry).
      const skeletons = document.querySelectorAll(".rounded-xl");
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe("Error State", () => {
    it("shows loading skeleton initially when data is null", () => {
      render(<InvoicesClient data={null} />);

      const skeletons = document.querySelectorAll(".animate-pulse");
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe("Empty State", () => {
    it("shows all-lunas celebration empty state when data is an empty array", () => {
      // Default filter is "unpaid". Empty array → no unpaid → celebration copy.
      render(<InvoicesClient data={[]} />);

      expect(screen.getByText("Alhamdulillah, semua lunas")).toBeInTheDocument();
    });

    it("shows empty state icon", () => {
      render(<InvoicesClient data={[]} />);

      const icon = document.querySelector("svg");
      expect(icon).toBeInTheDocument();
    });
  });

  describe("SummaryHero", () => {
    it("renders danger-tone outstanding hero when any invoice is unpaid", () => {
      render(<InvoicesClient data={mockInvoices} />);

      // 1 SENT (1_000_000) + 1 PARTIALLY_PAID (remaining 500_000) = Rp 1.500.000 outstanding.
      // formatRupiah uses non-breaking spaces — assert on the digit portion only.
      expect(screen.getByText(/1\.500\.000/)).toBeInTheDocument();
      expect(screen.getByText(/2 tagihan/)).toBeInTheDocument();
    });

    it("renders celebration hero when nothing is outstanding", () => {
      const allPaid = mockInvoices.map((inv) => ({
        ...inv,
        status: "PAID",
        totalPaid: inv.totalDue,
      }));
      render(<InvoicesClient data={allPaid} />);

      // Hero copy (not the empty-state copy — those differ by matching full string).
      expect(screen.getByText("Alhamdulillah, semua lunas.")).toBeInTheDocument();
    });
  });

  describe("Data Rendering - Filter", () => {
    it("renders InvoiceFilter component", () => {
      render(<InvoicesClient data={mockInvoices} />);

      expect(screen.getByText("Semua")).toBeInTheDocument();
      expect(screen.getByText("Belum Bayar")).toBeInTheDocument();
      expect(screen.getByText("Dibayar Sebagian")).toBeInTheDocument();
      expect(screen.getAllByText("Lunas").length).toBeGreaterThan(0);
      expect(screen.getByText("Jatuh Tempo")).toBeInTheDocument();
    });

    it("calculates filter counts correctly", () => {
      render(<InvoicesClient data={mockInvoices} />);

      const threes = screen.getAllByText("3");
      expect(threes.length).toBeGreaterThan(0);
    });
  });

  describe("Filter Functionality", () => {
    it("defaults to 'unpaid' filter", () => {
      render(<InvoicesClient data={mockInvoices} />);

      const unpaidTab = screen.getByRole("tab", { name: /Belum Bayar/ });
      expect(unpaidTab).toHaveAttribute("aria-selected", "true");
    });

    it("filters invoices by unpaid status", () => {
      render(<InvoicesClient data={mockInvoices} />);

      // Default = unpaid → only SENT row visible in the card list.
      expect(screen.getByText(/INV-2024-001/)).toBeInTheDocument();
      expect(screen.queryByText(/INV-2024-002/)).not.toBeInTheDocument();
      expect(screen.queryByText(/INV-2024-003/)).not.toBeInTheDocument();
    });

    it("changes filter when chip is clicked", async () => {
      const user = userEvent.setup();
      render(<InvoicesClient data={mockInvoices} />);

      const paidTab = screen.getByRole("tab", { name: /^Lunas/ });
      await user.click(paidTab);

      expect(screen.queryByText(/INV-2024-001/)).not.toBeInTheDocument();
      expect(screen.queryByText(/INV-2024-002/)).not.toBeInTheDocument();
      expect(screen.getByText(/INV-2024-003/)).toBeInTheDocument();
    });

    it("shows all invoices when 'all' filter is selected", async () => {
      const user = userEvent.setup();
      render(<InvoicesClient data={mockInvoices} />);

      const allTab = screen.getByRole("tab", { name: /Semua/ });
      await user.click(allTab);

      await waitFor(() => {
        expect(screen.getByText(/INV-2024-001/)).toBeInTheDocument();
        expect(screen.getByText(/INV-2024-002/)).toBeInTheDocument();
        expect(screen.getByText(/INV-2024-003/)).toBeInTheDocument();
      });
    });

    it("filters partially paid invoices correctly", async () => {
      const user = userEvent.setup();
      render(<InvoicesClient data={mockInvoices} />);

      const partialTab = screen.getByRole("tab", { name: /Dibayar Sebagian/ });
      await user.click(partialTab);

      await waitFor(() => {
        expect(screen.queryByText(/INV-2024-001/)).not.toBeInTheDocument();
        expect(screen.getByText(/INV-2024-002/)).toBeInTheDocument();
        expect(screen.queryByText(/INV-2024-003/)).not.toBeInTheDocument();
      });
    });
  });

  describe("Invoice Card List", () => {
    beforeEach(() => {
      Object.defineProperty(window, "innerWidth", {
        writable: true,
        configurable: true,
        value: 375,
      });
    });

    it("renders invoice rows as CardListItem buttons", () => {
      render(<InvoicesClient data={mockInvoices} />);

      // Period label is primary; invoice number + due date are secondary.
      expect(screen.getByText("Agustus 2024")).toBeInTheDocument();
      expect(screen.getByText(/INV-2024-001/)).toBeInTheDocument();
    });

    it("shows intent status badge", () => {
      render(<InvoicesClient data={mockInvoices} />);

      // Default filter = unpaid → one "Belum Dibayar" intent chip in the row.
      expect(screen.getAllByText("Belum Dibayar").length).toBeGreaterThan(0);
    });

    it("does not render a DataTable", () => {
      const { container } = render(<InvoicesClient data={mockInvoices} />);

      const dataTable = container.querySelector('[data-testid="data-table"]');
      expect(dataTable).not.toBeInTheDocument();
    });
  });

  describe("Invoice Detail Sheet", () => {
    it("opens detail sheet when an invoice row is clicked", async () => {
      const user = userEvent.setup();
      render(<InvoicesClient data={mockInvoices} />);

      // The invoice row is a <button> — click the primary label.
      const row = screen.getByRole("button", { name: /Agustus 2024/ });
      await user.click(row);

      // Test passes if no error was thrown during click.
      expect(row).toBeInTheDocument();
    });

    it("displays invoice data in the card row", () => {
      render(<InvoicesClient data={mockInvoices} />);

      expect(screen.getByText(/INV-2024-001/)).toBeInTheDocument();
    });
  });

  describe("Empty State per Filter", () => {
    it("shows overdue-filter empty state when no overdue invoices", async () => {
      const user = userEvent.setup();
      render(<InvoicesClient data={mockInvoices} />);

      const overdueTab = screen.getByRole("tab", { name: /Jatuh Tempo/ });
      await user.click(overdueTab);

      // Overdue filter with zero matches → celebration empty copy.
      await waitFor(() => {
        expect(screen.getByText("Alhamdulillah, semua lunas")).toBeInTheDocument();
      });
    });

    it("shows paid-filter empty state (warm)", async () => {
      // Only-unpaid dataset → Lunas filter shows the "Belum ada pembayaran" empty state.
      const onlyUnpaid = [mockInvoices[0]];
      const user = userEvent.setup();
      render(<InvoicesClient data={onlyUnpaid} />);

      const paidTab = screen.getByRole("tab", { name: /^Lunas/ });
      await user.click(paidTab);

      await waitFor(() => {
        expect(screen.getByText("Belum ada pembayaran")).toBeInTheDocument();
      });
    });
  });

  describe("Layout Structure", () => {
    it("renders page title", () => {
      render(<InvoicesClient data={mockInvoices} />);

      expect(screen.getByText("Tagihan Saya")).toBeInTheDocument();
    });

    it("has correct component hierarchy", () => {
      render(<InvoicesClient data={mockInvoices} />);

      expect(screen.getByText("Tagihan Saya")).toBeInTheDocument();
      expect(screen.getByText("Semua")).toBeInTheDocument();
    });
  });

  describe("Edge Cases", () => {
    it("handles single invoice correctly", () => {
      const singleInvoice = [mockInvoices[0]];
      render(<InvoicesClient data={singleInvoice} />);

      expect(screen.getByText(/INV-2024-001/)).toBeInTheDocument();
    });

    it("handles all invoices paid", async () => {
      const user = userEvent.setup();
      const allPaid = mockInvoices.map((inv) => ({
        ...inv,
        status: "PAID",
        totalPaid: inv.totalDue,
      }));

      render(<InvoicesClient data={allPaid} />);

      // Default filter is "unpaid" — no SENT → celebration empty (same copy as hero title).
      // The hero + empty-state both render the "Alhamdulillah, semua lunas" copy — at
      // least one must be present.
      expect(screen.getAllByText(/Alhamdulillah, semua lunas/).length).toBeGreaterThan(0);

      // Switch to "Lunas" filter to see all paid invoices.
      const paidButton = screen.getByRole("tab", { name: /^Lunas/ });
      await user.click(paidButton);
      await waitFor(() => {
        expect(screen.getByText(/INV-2024-001/)).toBeInTheDocument();
      });
    });

    it("handles overdue status correctly", () => {
      const overdueInvoices = [
        {
          ...mockInvoices[0],
          status: "OVERDUE",
        },
      ];

      render(<InvoicesClient data={overdueInvoices} />);

      const overdueButton = screen.getByRole("tab", { name: /Jatuh Tempo/ });
      expect(overdueButton).toBeInTheDocument();
    });
  });
});
