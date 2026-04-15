import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getStudentInvoices } from "../parent-helpers";
import { prisma } from "@/lib/db";

// Mock Prisma client
vi.mock("@/lib/db", () => ({
  prisma: {
    invoice: {
      findMany: vi.fn(),
    },
  },
}));

describe("getStudentInvoices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should fetch unpaid invoices for a specific student", async () => {
    const mockInvoices = [
      {
        id: "inv-1",
        invoiceNumber: "INV-2024-001",
        periodLabel: "April 2024",
        totalDue: 1000000,
        totalPaid: 0,
        status: "SENT",
        xenditPaymentUrl: "https://payment.url",
        createdAt: new Date("2024-04-01"),
      },
      {
        id: "inv-2",
        invoiceNumber: "INV-2024-002",
        periodLabel: "May 2024",
        totalDue: 1000000,
        totalPaid: 500000,
        status: "PARTIALLY_PAID",
        xenditPaymentUrl: null,
        createdAt: new Date("2024-05-01"),
      },
    ];

    vi.mocked(prisma.invoice.findMany).mockResolvedValue(mockInvoices);

    const result = await getStudentInvoices("student-123");

    expect(prisma.invoice.findMany).toHaveBeenCalledWith({
      where: {
        studentId: "student-123",
        status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        invoiceNumber: true,
        periodLabel: true,
        totalDue: true,
        totalPaid: true,
        status: true,
        xenditPaymentUrl: true,
        createdAt: true,
      },
    });

    expect(result).toEqual(mockInvoices);
  });

  it("should fetch overdue invoices", async () => {
    const mockInvoices = [
      {
        id: "inv-1",
        invoiceNumber: "INV-2024-001",
        periodLabel: "March 2024",
        totalDue: 1000000,
        totalPaid: 0,
        status: "OVERDUE",
        xenditPaymentUrl: "https://payment.url",
        createdAt: new Date("2024-03-01"),
      },
    ];

    vi.mocked(prisma.invoice.findMany).mockResolvedValue(mockInvoices);

    const result = await getStudentInvoices("student-123");

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("OVERDUE");
  });

  it("should not fetch paid or cancelled invoices", async () => {
    const mockInvoices = [
      {
        id: "inv-1",
        invoiceNumber: "INV-2024-001",
        periodLabel: "April 2024",
        totalDue: 1000000,
        totalPaid: 0,
        status: "SENT",
        xenditPaymentUrl: "https://payment.url",
        createdAt: new Date("2024-04-01"),
      },
    ];

    vi.mocked(prisma.invoice.findMany).mockResolvedValue(mockInvoices);

    await getStudentInvoices("student-123");

    expect(prisma.invoice.findMany).toHaveBeenCalledWith({
      where: {
        studentId: "student-123",
        status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: expect.any(Object),
    });
  });

  it("should return empty array if student has no unpaid invoices", async () => {
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([]);

    const result = await getStudentInvoices("student-123");

    expect(result).toEqual([]);
    expect(prisma.invoice.findMany).toHaveBeenCalledTimes(1);
  });

  it("should limit results to 5 invoices", async () => {
    const mockInvoices = Array.from({ length: 10 }, (_, i) => ({
      id: `inv-${i}`,
      invoiceNumber: `INV-2024-${String(i + 1).padStart(3, "0")}`,
      periodLabel: `Month ${i + 1}`,
      totalDue: 1000000,
      totalPaid: 0,
      status: "SENT" as const,
      xenditPaymentUrl: null,
      createdAt: new Date(`2024-${String(i + 1).padStart(2, "0")}-01`),
    }));

    vi.mocked(prisma.invoice.findMany).mockResolvedValue(mockInvoices.slice(0, 5));

    const result = await getStudentInvoices("student-123");

    expect(result).toHaveLength(5);
    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 5,
      })
    );
  });

  it("should order invoices by creation date descending", async () => {
    const mockInvoices = [
      {
        id: "inv-1",
        invoiceNumber: "INV-2024-001",
        periodLabel: "April 2024",
        totalDue: 1000000,
        totalPaid: 0,
        status: "SENT",
        xenditPaymentUrl: "https://payment.url",
        createdAt: new Date("2024-04-01"),
      },
      {
        id: "inv-2",
        invoiceNumber: "INV-2024-002",
        periodLabel: "May 2024",
        totalDue: 1000000,
        totalPaid: 0,
        status: "SENT",
        xenditPaymentUrl: null,
        createdAt: new Date("2024-05-01"),
      },
    ];

    vi.mocked(prisma.invoice.findMany).mockResolvedValue(mockInvoices);

    await getStudentInvoices("student-123");

    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: "desc" },
      })
    );
  });

  it("should only select specific fields", async () => {
    const mockInvoices = [
      {
        id: "inv-1",
        invoiceNumber: "INV-2024-001",
        periodLabel: "April 2024",
        totalDue: 1000000,
        totalPaid: 0,
        status: "SENT",
        xenditPaymentUrl: "https://payment.url",
        createdAt: new Date("2024-04-01"),
      },
    ];

    vi.mocked(prisma.invoice.findMany).mockResolvedValue(mockInvoices);

    await getStudentInvoices("student-123");

    expect(prisma.invoice.findMany).toHaveBeenCalledWith({
      where: expect.any(Object),
      orderBy: expect.any(Object),
      take: expect.any(Number),
      select: {
        id: true,
        invoiceNumber: true,
        periodLabel: true,
        totalDue: true,
        totalPaid: true,
        status: true,
        xenditPaymentUrl: true,
        createdAt: true,
      },
    });
  });

  it("should handle database errors gracefully", async () => {
    vi.mocked(prisma.invoice.findMany).mockRejectedValue(
      new Error("Database connection failed")
    );

    await expect(getStudentInvoices("student-123")).rejects.toThrow(
      "Database connection failed"
    );
  });

  it("should work with different student IDs", async () => {
    const mockInvoices = [
      {
        id: "inv-1",
        invoiceNumber: "INV-2024-001",
        periodLabel: "April 2024",
        totalDue: 1000000,
        totalPaid: 0,
        status: "SENT",
        xenditPaymentUrl: "https://payment.url",
        createdAt: new Date("2024-04-01"),
      },
    ];

    vi.mocked(prisma.invoice.findMany).mockResolvedValue(mockInvoices);

    await getStudentInvoices("student-456");
    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          studentId: "student-456",
          status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
        },
      })
    );

    await getStudentInvoices("student-789");
    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          studentId: "student-789",
          status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
        },
      })
    );
  });

  it("should preserve exact decimal values for totalDue and totalPaid", async () => {
    const mockInvoices = [
      {
        id: "inv-1",
        invoiceNumber: "INV-2024-001",
        periodLabel: "April 2024",
        totalDue: 1250000,
        totalPaid: 500000,
        status: "PARTIALLY_PAID",
        xenditPaymentUrl: null,
        createdAt: new Date("2024-04-01"),
      },
    ];

    vi.mocked(prisma.invoice.findMany).mockResolvedValue(mockInvoices);

    const result = await getStudentInvoices("student-123");

    expect(result[0].totalDue).toBe(1250000);
    expect(result[0].totalPaid).toBe(500000);
  });
});
