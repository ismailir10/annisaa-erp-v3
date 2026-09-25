import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  getParentInvoiceList: vi.fn(),
  getParentOutstandingForStudents: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getSession: async () => ({ role: "GUARDIAN", tenantId: "tenant", parentId: "parent" }),
}));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock("@/lib/db", () => ({ prisma: { invoice: { findFirst: mocks.findFirst } } }));
vi.mock("@/lib/parent-helpers", () => ({
  getParentWithChildren: async () => ({
    parent: { id: "parent" },
    children: [
      { studentId: "first", studentName: "Aisyah", className: "TKA" },
      { studentId: "second", studentName: "Yusuf", className: "TKB" },
    ],
  }),
  resolveSelectedChild: (children: { studentId: string }[], requested?: string) =>
    children.find((child) => child.studentId === requested) ?? children[0],
  getParentInvoiceList: mocks.getParentInvoiceList,
  getParentOutstandingForStudents: mocks.getParentOutstandingForStudents,
}));
vi.mock("@/components/parent/child-selector-tabs", () => ({
  ChildSelectorTabs: ({ selectedChildId }: { selectedChildId: string }) =>
    <div data-testid="selected-child">{selectedChildId}</div>,
}));
vi.mock("../client", () => ({
  InvoicesClient: ({ selectedChildId }: { selectedChildId: string }) =>
    <div data-testid="invoice-child">{selectedChildId}</div>,
}));

import ParentInvoicesPage from "../page";

describe("parent invoice callback child reconciliation", () => {
  beforeEach(() => {
    mocks.findFirst.mockReset();
    mocks.getParentInvoiceList.mockReset().mockResolvedValue([]);
    mocks.getParentOutstandingForStudents.mockReset().mockResolvedValue({ items: [] });
  });

  it("selects the callback invoice's linked child despite a conflicting child query", async () => {
    mocks.findFirst.mockResolvedValue({ studentId: "second" });
    render(await ParentInvoicesPage({ searchParams: Promise.resolve({
      child: "first", invoice: "invoice-second", paymentStatus: "paid",
    }) }));
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { id: "invoice-second", tenantId: "tenant", studentId: { in: ["first", "second"] } },
      select: { studentId: true },
    });
    expect(mocks.getParentInvoiceList).toHaveBeenCalledWith("parent", "second", "tenant");
    expect(screen.getByTestId("selected-child")).toHaveTextContent("second");
    expect(screen.getByTestId("invoice-child")).toHaveTextContent("second");
  });

  it("does not switch to a foreign callback invoice", async () => {
    mocks.findFirst.mockResolvedValue(null);
    render(await ParentInvoicesPage({ searchParams: Promise.resolve({
      child: "first", invoice: "foreign", paymentStatus: "paid",
    }) }));
    expect(mocks.getParentInvoiceList).toHaveBeenCalledWith("parent", "first", "tenant");
    expect(screen.getByTestId("invoice-child")).toHaveTextContent("first");
  });
});
