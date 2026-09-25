import { describe, expect, it } from "vitest";
import { buildAdminWorkQueue, unavailableAdminQueueSections, type AdminQueueSources } from "../admin-work-queue";

const hidden = { status: "hidden" } as const;

describe("admin work queue", () => {
  it("maps authoritative domain records to their real destinations", () => {
    const sources: AdminQueueSources = {
      enrollments: { status: "ready", records: [{ id: "en-1", childName: "Alya", status: "SUBMITTED" }] },
      leave: { status: "ready", records: [{ id: "lv-1", leaveType: "SICK", startDate: "2026-09-25", endDate: "2026-09-26", status: "PENDING", employee: { nama: "Ustadzah Rina" } }] },
      invoices: { status: "ready", records: [{ id: "inv-1", invoiceNumber: "INV-1", periodLabel: "September", status: "PENDING_PAYMENT_LINK", student: { name: "Bima" } }] },
      payroll: { status: "ready", records: [{ id: "pay-1", periodStart: "2026-09-01", periodEnd: "2026-09-30", status: "DRAFT" }] },
    };

    expect(buildAdminWorkQueue(sources).map(({ id, href, state }) => ({ id, href, state }))).toEqual([
      { id: "enrollment:en-1", href: "/admin/enrollments/en-1", state: "SUBMITTED" },
      { id: "leave:lv-1", href: "/admin/leave-requests?requestId=lv-1", state: "PENDING" },
      { id: "invoice:inv-1", href: "/admin/invoices/inv-1", state: "PENDING_PAYMENT_LINK" },
      { id: "payroll:pay-1", href: "/admin/payroll/pay-1", state: "DRAFT" },
    ]);
  });

  it("does not invent zeroes for unavailable or unauthorized modules", () => {
    const sources: AdminQueueSources = {
      enrollments: { status: "unavailable" },
      leave: hidden,
      invoices: hidden,
      payroll: hidden,
    };
    expect(buildAdminWorkQueue(sources)).toEqual([]);
    expect(unavailableAdminQueueSections(sources)).toEqual(["enrollment"]);
  });
});
