import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

/**
 * GET /api/guardian/invoices/[id]
 * Guardian-scoped invoice detail — returns lines, payments, and student info.
 * Only accessible by GUARDIAN role, only for their own children's invoices.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "GUARDIAN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  // Verify this invoice belongs to one of the guardian's children
  const guardian = await prisma.parent.findFirst({
    where: session.parentId
      ? { id: session.parentId, tenantId: session.tenantId }
      : { email: session.email, tenantId: session.tenantId },
    select: {
      guardians: { select: { studentId: true } },
    },
  });

  if (!guardian) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const childIds = new Set(guardian.guardians.map((g) => g.studentId));

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    select: {
      id: true,
      invoiceNumber: true,
      periodLabel: true,
      dueDate: true,
      totalDue: true,
      totalPaid: true,
      status: true,
      xenditPaymentUrl: true,
      sentAt: true,
      paidAt: true,
      tenantId: true,
      studentId: true,
      lines: {
        select: {
          id: true,
          labelSnapshot: true,
          amount: true,
          finalAmount: true,
          adjustmentAmount: true,
          adjustmentNote: true,
        },
        orderBy: { feeComponent: { sortOrder: "asc" } },
      },
      payments: {
        select: {
          id: true,
          amount: true,
          method: true,
          reference: true,
          paidAt: true,
        },
        orderBy: { paidAt: "desc" },
      },
      student: {
        select: {
          name: true,
          nickname: true,
          enrollments: {
            where: { status: "ACTIVE" },
            select: {
              classSection: {
                select: {
                  name: true,
                  program: { select: { name: true } },
                },
              },
            },
            take: 1,
          },
        },
      },
    },
  });

  if (!invoice || !invoice.studentId || !invoice.student || !childIds.has(invoice.studentId) || invoice.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Serialize Decimals and Dates (tenantId excluded from response)
  return NextResponse.json({
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    periodLabel: invoice.periodLabel,
    dueDate: invoice.dueDate,
    totalDue: Number(invoice.totalDue),
    totalPaid: Number(invoice.totalPaid),
    status: invoice.status,
    xenditPaymentUrl: invoice.xenditPaymentUrl,
    sentAt: invoice.sentAt?.toISOString() ?? null,
    paidAt: invoice.paidAt?.toISOString() ?? null,
    lines: invoice.lines.map((l) => ({
      id: l.id,
      labelSnapshot: l.labelSnapshot,
      amount: Number(l.amount),
      finalAmount: Number(l.finalAmount),
      adjustmentAmount: Number(l.adjustmentAmount),
      adjustmentNote: l.adjustmentNote,
    })),
    payments: invoice.payments.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      method: p.method,
      reference: p.reference,
      paidAt: p.paidAt.toISOString(),
    })),
    student: {
      name: invoice.student.name,
      nickname: invoice.student.nickname,
      classSection: invoice.student.enrollments[0]?.classSection
        ? {
            name: invoice.student.enrollments[0].classSection.name,
            program: { name: invoice.student.enrollments[0].classSection.program.name },
          }
        : null,
    },
  });
}
