import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";

// Record a manual payment for an invoice
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: invoiceId } = await params;
  const body = await req.json();

  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice || invoice.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (invoice.status === "CANCELLED") {
    return NextResponse.json({ error: "Tidak bisa mencatat pembayaran untuk tagihan yang dibatalkan" }, { status: 400 });
  }
  if (invoice.status === "PAID") {
    return NextResponse.json({ error: "Tagihan sudah lunas" }, { status: 400 });
  }

  const amount = Number(body.amount);
  if (!amount || amount <= 0 || Number.isNaN(amount)) {
    return NextResponse.json({ error: "Jumlah pembayaran tidak valid" }, { status: 400 });
  }

  // Overpayment guard
  const remaining = Number(invoice.totalDue) - Number(invoice.totalPaid);
  if (amount > remaining) {
    return NextResponse.json(
      { error: `Jumlah pembayaran (${amount}) melebihi sisa tagihan (${remaining})` },
      { status: 400 }
    );
  }

  // Atomic: create payment + recalculate invoice totals
  const payment = await prisma.$transaction(async (tx) => {
    const p = await tx.payment.create({
      data: {
        invoiceId,
        amount,
        method: body.method ?? "CASH",
        reference: body.reference?.trim() || null,
        notes: body.notes?.trim() || null,
      },
    });

    const allPayments = await tx.payment.findMany({ where: { invoiceId } });
    const totalPaid = allPayments.reduce((s, pay) => s + Number(pay.amount), 0);

    let newStatus = invoice.status;
    if (totalPaid >= Number(invoice.totalDue)) {
      newStatus = "PAID";
    } else if (totalPaid > 0) {
      newStatus = "PARTIALLY_PAID";
    }

    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        totalPaid,
        status: newStatus,
        paidAt: newStatus === "PAID" ? new Date() : null,
      },
    });

    return p;
  });

  return NextResponse.json(payment, { status: 201 });
}
