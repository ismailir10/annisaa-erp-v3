import { describe, it, expect, vi, beforeEach } from "vitest";
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

const toastFn = Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() });
vi.mock("sonner", () => ({
  get toast() {
    return toastFn;
  },
}));

const replaceFn = vi.fn();
const refreshFn = vi.fn();
let mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceFn, push: vi.fn(), refresh: refreshFn }),
  useSearchParams: () => mockSearchParams,
}));

beforeEach(() => {
  toastFn.mockClear();
  toastFn.error.mockClear();
  toastFn.success.mockClear();
  replaceFn.mockClear();
  refreshFn.mockClear();
  mockSearchParams = new URLSearchParams();
});

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

  describe("Xendit return-URL handler", () => {
    it("opens detail sheet, fires success toast, and clears params on ?invoice=&xenditStatus=paid", () => {
      mockSearchParams = new URLSearchParams("invoice=inv-1&xenditStatus=paid");
      render(<InvoicesClient data={mockInvoices} />);
      expect(toastFn.success).toHaveBeenCalledWith(
        expect.stringContaining("Alhamdulillah"),
      );
      expect(toastFn.success).toHaveBeenCalledWith(
        expect.stringContaining("Agustus 2024"),
      );
      expect(replaceFn).toHaveBeenCalledWith("/parent/invoices", { scroll: false });
      expect(screen.getByText(/Sheet open: inv-1/)).toBeInTheDocument();
    });

    it("fires neutral cancel toast on ?invoice=&xenditStatus=cancel", () => {
      mockSearchParams = new URLSearchParams("invoice=inv-1&xenditStatus=cancel");
      render(<InvoicesClient data={mockInvoices} />);
      expect(toastFn).toHaveBeenCalledWith(
        expect.stringContaining("Pembayaran belum selesai"),
      );
      expect(replaceFn).toHaveBeenCalledWith("/parent/invoices", { scroll: false });
    });

    it("does nothing when invoice id is foreign / not in data", () => {
      mockSearchParams = new URLSearchParams("invoice=inv-foreign&xenditStatus=paid");
      render(<InvoicesClient data={mockInvoices} />);
      expect(toastFn.success).not.toHaveBeenCalled();
      expect(toastFn).not.toHaveBeenCalled();
      expect(replaceFn).not.toHaveBeenCalled();
      expect(screen.queryByText(/Sheet open:/)).not.toBeInTheDocument();
    });

    it("does nothing when xenditStatus is missing", () => {
      mockSearchParams = new URLSearchParams("invoice=inv-1");
      render(<InvoicesClient data={mockInvoices} />);
      expect(toastFn.success).not.toHaveBeenCalled();
      expect(replaceFn).not.toHaveBeenCalled();
    });

    it("does nothing when invoice param is missing", () => {
      mockSearchParams = new URLSearchParams("xenditStatus=paid");
      render(<InvoicesClient data={mockInvoices} />);
      expect(toastFn.success).not.toHaveBeenCalled();
      expect(replaceFn).not.toHaveBeenCalled();
    });
  });

  describe("Webhook → list freshness poll", () => {
    it("polls router.refresh every 30s when an invoice has an active xendit session", () => {
      vi.useFakeTimers();
      const inFlight = mockInvoices.map((inv) =>
        inv.id === "inv-1"
          ? { ...inv, xenditPaymentUrl: "https://checkout.xendit.co/abc" }
          : inv,
      );
      render(<InvoicesClient data={inFlight} />);
      expect(refreshFn).not.toHaveBeenCalled();
      vi.advanceTimersByTime(30_000);
      expect(refreshFn).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(30_000);
      expect(refreshFn).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    });

    it("does not poll when no invoice has an active xendit session", () => {
      vi.useFakeTimers();
      render(<InvoicesClient data={mockInvoices} />);
      vi.advanceTimersByTime(60_000);
      expect(refreshFn).not.toHaveBeenCalled();
      vi.useRealTimers();
    });
  });

  describe("Status flip → PAID emits one-shot toast", () => {
    it("fires success toast when an invoice transitions from non-PAID to PAID", () => {
      const { rerender } = render(<InvoicesClient data={mockInvoices} />);
      // First render: no flip, no toast (prevDataRef seeds with current data)
      expect(toastFn.success).not.toHaveBeenCalled();
      // Second render: inv-1 (SENT) flips to PAID
      const flipped = mockInvoices.map((inv) =>
        inv.id === "inv-1"
          ? { ...inv, status: "PAID", totalPaid: inv.totalDue, paidAt: "2024-09-01" }
          : inv,
      );
      rerender(<InvoicesClient data={flipped} />);
      expect(toastFn.success).toHaveBeenCalledWith(
        expect.stringContaining("baru saja terbayar"),
      );
      expect(toastFn.success).toHaveBeenCalledWith(
        expect.stringContaining("Agustus 2024"),
      );
    });

    it("does not fire toast on initial mount even if data has PAID rows", () => {
      render(<InvoicesClient data={mockInvoices} />);
      // mockInvoices includes inv-3 PAID — no toast since there's no prior render
      // showing it as non-PAID.
      expect(toastFn.success).not.toHaveBeenCalled();
    });
  });
});
