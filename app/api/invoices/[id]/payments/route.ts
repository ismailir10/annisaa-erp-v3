import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { Prisma } from "@/lib/generated/prisma/client";
import { recordPaymentSchema } from "@/lib/validations/invoice";

// Record a manual payment for an invoice
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: invoiceId } = await params;
  // recordPaymentSchema existed for exactly this endpoint but was never wired
  // in — the hand-rolled check let any `method` string persist verbatim
  // (Payment.method is a plain String column, no DB enum).
  const body = await req.json().catch(() => null);
  const parsed = recordPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Jumlah pembayaran tidak valid" },
      { status: 400 },
    );
  }
  const amountDec = new Prisma.Decimal(parsed.data.amount.toString());

  // Quick tenant-scope check outside the tx so a cross-tenant id bails early.
  const preCheck = await prisma.invoice.findFirst({
    where: { id: invoiceId, tenantId: session.tenantId },
    select: { id: true },
  });
  if (!preCheck) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Atomic: advisory-lock invoice, re-read status + totals, guard, create,
  // recompute. Same lock the Xendit webhook uses so a manual payment tab and
  // a webhook cannot both pass the overpayment guard concurrently.
  try {
    const payment = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${invoiceId}))`;

      const fresh = await tx.invoice.findUnique({ where: { id: invoiceId } });
      if (!fresh) throw new Error("NOT_FOUND");
      if (fresh.status === "CANCELLED") throw new Error("CANCELLED");
      if (fresh.status === "PAID") throw new Error("PAID");

      const totalDueDec = new Prisma.Decimal(fresh.totalDue.toString());
      const currentPaidDec = new Prisma.Decimal(fresh.totalPaid.toString());
      const remainingDec = totalDueDec.sub(currentPaidDec);
      if (amountDec.gt(remainingDec)) {
        throw Object.assign(new Error("OVERPAYMENT"), {
          msg: `Jumlah pembayaran (${amountDec.toString()}) melebihi sisa tagihan (${remainingDec.toString()})`,
        });
      }

      const p = await tx.payment.create({
        data: {
          invoiceId,
          amount: amountDec,
          method: parsed.data.method,
          reference: parsed.data.reference?.trim() || null,
          notes: parsed.data.notes?.trim() || null,
        },
      });

      const allPayments = await tx.payment.findMany({
        where: { invoiceId },
        select: { amount: true },
      });
      const totalPaidDec = allPayments.reduce(
        (acc, pay) => acc.add(new Prisma.Decimal(pay.amount.toString())),
        new Prisma.Decimal(0)
      );

      let newStatus = fresh.status;
      if (totalPaidDec.gte(totalDueDec)) newStatus = "PAID";
      else if (totalPaidDec.gt(0)) newStatus = "PARTIALLY_PAID";

      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          totalPaid: totalPaidDec,
          status: newStatus,
          paidAt: newStatus === "PAID" ? new Date() : null,
        },
      });

      return p;
    });

    // Manual payment writes Invoice.status + Invoice.totalPaid; bust the
    // parent-portal Tagihan + per-student caches so /parent and /parent/invoices
    // pick up the new state immediately (UAT-2026-05-03 INV-01 vector).
    revalidateTag("parent-invoice-list", { expire: 0 });
    revalidateTag("student-invoices", { expire: 0 });
    return NextResponse.json(payment, { status: 201 });
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === "NOT_FOUND") return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (e.message === "CANCELLED") return NextResponse.json({ error: "Tidak bisa mencatat pembayaran untuk tagihan yang dibatalkan" }, { status: 400 });
      if (e.message === "PAID") return NextResponse.json({ error: "Tagihan sudah lunas" }, { status: 400 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (e.message === "OVERPAYMENT") return NextResponse.json({ error: (e as any).msg }, { status: 400 });
    }
    throw e;
  }
}
