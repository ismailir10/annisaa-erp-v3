import { describe, it, expect } from "vitest";
import {
  summarizeStudentInvoices,
  UNPAID_INVOICE_STATUSES,
  EMPTY_INVOICE_SUMMARY,
  type SummarisableInvoice,
} from "@/lib/finance/student-invoice-summary";

function inv(over: Partial<SummarisableInvoice> & { status: string }): SummarisableInvoice {
  return { totalDue: 0, totalPaid: 0, dueDate: "2026-01-31", ...over };
}

describe("summarizeStudentInvoices", () => {
  it("returns the empty summary for no invoices", () => {
    expect(summarizeStudentInvoices([])).toEqual(EMPTY_INVOICE_SUMMARY);
  });

  it("sums billed and paid across non-cancelled invoices", () => {
    const s = summarizeStudentInvoices([
      inv({ status: "PAID", totalDue: 500_000, totalPaid: 500_000 }),
      inv({ status: "SENT", totalDue: 300_000, totalPaid: 0 }),
    ]);
    expect(s.invoiceCount).toBe(2);
    expect(s.totalBilled).toBe(800_000);
    expect(s.totalPaid).toBe(500_000);
  });

  it("excludes CANCELLED from billed, paid and outstanding", () => {
    const s = summarizeStudentInvoices([
      inv({ status: "CANCELLED", totalDue: 1_000_000, totalPaid: 250_000 }),
      inv({ status: "SENT", totalDue: 200_000, totalPaid: 0 }),
    ]);
    expect(s.totalBilled).toBe(200_000);
    expect(s.totalPaid).toBe(0);
    expect(s.outstanding).toBe(200_000);
    expect(s.unpaidCount).toBe(1);
    // Still on the record — the list below the summary shows it.
    expect(s.invoiceCount).toBe(2);
  });

  it("counts only SENT / PARTIALLY_PAID / OVERDUE toward outstanding", () => {
    const s = summarizeStudentInvoices([
      inv({ status: "DRAFT", totalDue: 100_000 }),
      inv({ status: "PENDING_PAYMENT_LINK", totalDue: 100_000 }),
      inv({ status: "PAID", totalDue: 100_000, totalPaid: 100_000 }),
      inv({ status: "SENT", totalDue: 100_000 }),
      inv({ status: "PARTIALLY_PAID", totalDue: 100_000, totalPaid: 40_000 }),
      inv({ status: "OVERDUE", totalDue: 100_000 }),
    ]);
    expect(s.outstanding).toBe(100_000 + 60_000 + 100_000);
    expect(s.unpaidCount).toBe(3);
    expect(s.overdueCount).toBe(1);
  });

  it("ignores a PARTIALLY_PAID row already settled in full", () => {
    // The webhook credits the payment before the status flips to PAID; that
    // window must not read as money owed.
    const s = summarizeStudentInvoices([
      inv({ status: "PARTIALLY_PAID", totalDue: 250_000, totalPaid: 250_000 }),
    ]);
    expect(s.outstanding).toBe(0);
    expect(s.unpaidCount).toBe(0);
  });

  it("never reports negative outstanding on an overpayment", () => {
    const s = summarizeStudentInvoices([
      inv({ status: "SENT", totalDue: 100_000, totalPaid: 150_000 }),
      inv({ status: "SENT", totalDue: 100_000, totalPaid: 0 }),
    ]);
    expect(s.outstanding).toBe(100_000);
    expect(s.unpaidCount).toBe(1);
  });

  it("reads Decimal-as-string amounts, the shape the API actually returns", () => {
    const s = summarizeStudentInvoices([
      inv({ status: "SENT", totalDue: "750000.00", totalPaid: "250000.50" }),
    ]);
    expect(s.outstanding).toBeCloseTo(499_999.5, 2);
    expect(s.totalBilled).toBe(750_000);
  });

  it("treats an unparseable amount as zero rather than NaN", () => {
    const s = summarizeStudentInvoices([
      inv({ status: "SENT", totalDue: "abc" as unknown as string, totalPaid: 0 }),
    ]);
    expect(s.outstanding).toBe(0);
    expect(s.totalBilled).toBe(0);
  });

  it("picks the earliest due date among unpaid invoices only", () => {
    const s = summarizeStudentInvoices([
      inv({ status: "PAID", totalDue: 100_000, totalPaid: 100_000, dueDate: "2025-09-01" }),
      inv({ status: "SENT", totalDue: 100_000, dueDate: "2026-03-15" }),
      inv({ status: "OVERDUE", totalDue: 100_000, dueDate: "2026-01-10" }),
    ]);
    expect(s.nearestDue).toBe("2026-01-10");
  });

  it("leaves nearestDue null when a due date is missing", () => {
    const s = summarizeStudentInvoices([
      inv({ status: "SENT", totalDue: 100_000, dueDate: null }),
    ]);
    expect(s.unpaidCount).toBe(1);
    expect(s.nearestDue).toBeNull();
  });

  it("pins the allow-list the parent portal shares", () => {
    expect([...UNPAID_INVOICE_STATUSES]).toEqual(["SENT", "PARTIALLY_PAID", "OVERDUE"]);
  });
});
