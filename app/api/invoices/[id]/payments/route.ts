import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

// Record a manual payment for an invoice
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
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

  const amount = parseFloat(body.amount);
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "Jumlah pembayaran tidak valid" }, { status: 400 });
  }

  // Create payment
  const payment = await prisma.payment.create({
    data: {
      invoiceId,
      amount,
      method: body.method ?? "CASH",
      reference: body.reference?.trim() || null,
      notes: body.notes?.trim() || null,
    },
  });

  // Update invoice totals
  const allPayments = await prisma.payment.findMany({ where: { invoiceId } });
  const totalPaid = allPayments.reduce((s, p) => s + Number(p.amount), 0);

  let newStatus = invoice.status;
  if (totalPaid >= Number(invoice.totalDue)) {
    newStatus = "PAID";
  } else if (totalPaid > 0) {
    newStatus = "PARTIALLY_PAID";
  }

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      totalPaid,
      status: newStatus,
      paidAt: newStatus === "PAID" ? new Date() : null,
    },
  });

  return NextResponse.json(payment, { status: 201 });
}
