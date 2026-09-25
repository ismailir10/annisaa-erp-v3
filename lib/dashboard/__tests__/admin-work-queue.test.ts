import { describe, expect, it } from "vitest";
import { buildAdminWorkQueue, rankUrgent, summarizeQueue, unavailableAdminQueueSections, type AdminQueueSources } from "../admin-work-queue";

const hidden = { status: "hidden" } as const;

const fullSources: AdminQueueSources = {
  enrollments: { status: "ready", count: 1, records: [{ id: "en-1", childName: "Alya", status: "SUBMITTED", updatedAt: "2026-09-20T00:00:00.000Z" }] },
  leave: { status: "ready", count: 1, records: [{ id: "lv-1", leaveType: "SICK", startDate: "2026-09-25", endDate: "2026-09-26", status: "PENDING", employee: { nama: "Ustadzah Rina" } }] },
  invoices: { status: "ready", count: 1, records: [{ id: "inv-1", invoiceNumber: "INV-1", periodLabel: "September", status: "PENDING_PAYMENT_LINK", dueDate: "2026-09-22", student: { name: "Bima" } }] },
  payroll: { status: "ready", count: 1, records: [{ id: "pay-1", periodStart: "2026-09-01", periodEnd: "2026-09-30", status: "DRAFT" }] },
};

describe("admin work queue", () => {
  it("maps authoritative domain records to their real destinations", () => {
    expect(buildAdminWorkQueue(fullSources).map(({ id, href, state }) => ({ id, href, state }))).toEqual([
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

describe("rankUrgent", () => {
  it("sorts by sortDate ascending: payroll (09-01) < enrollment (09-20) < invoice (09-22) < leave (09-25)", () => {
    const items = buildAdminWorkQueue(fullSources);
    const ranked = rankUrgent(items);
    expect(ranked.map((i) => i.id)).toEqual([
      "payroll:pay-1",
      "enrollment:en-1",
      "invoice:inv-1",
      "leave:lv-1",
    ]);
  });

  it("keeps undated items after every dated item", () => {
    const dated = { id: "a", kind: "invoice" as const, title: "", description: "", href: "", state: "", recordId: "", actionLabel: "", sortDate: "2026-09-01" };
    const undated = { id: "b", kind: "payroll" as const, title: "", description: "", href: "", state: "", recordId: "", actionLabel: "" };
    expect(rankUrgent([undated, dated]).map((i) => i.id)).toEqual(["a", "b"]);
  });
});

describe("summarizeQueue", () => {
  it("reports per-kind counts for visible sources and a grand total", () => {
    expect(summarizeQueue(fullSources)).toEqual({
      items: [
        { kind: "enrollment", status: "ready", count: 1 },
        { kind: "leave", status: "ready", count: 1 },
        { kind: "invoice", status: "ready", count: 1 },
        { kind: "payroll", status: "ready", count: 1 },
      ],
      total: 4,
    });
  });

  it("omits hidden sources and never invents a zero for an unavailable one", () => {
    const sources: AdminQueueSources = {
      enrollments: { status: "unavailable" },
      leave: hidden,
      invoices: { status: "ready", count: 3, records: [] },
      payroll: hidden,
    };
    expect(summarizeQueue(sources)).toEqual({
      items: [
        { kind: "enrollment", status: "unavailable", count: 0 },
        { kind: "invoice", status: "ready", count: 3 },
      ],
      total: 3,
    });
  });
});
