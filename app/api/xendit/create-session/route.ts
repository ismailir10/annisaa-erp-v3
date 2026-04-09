import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { createXenditSession } from "@/lib/xendit/client";

// Create Xendit Checkout Session for an invoice
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { invoiceId } = await req.json();
  if (!invoiceId) {
    return NextResponse.json({ error: "invoiceId required" }, { status: 400 });
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      student: {
        include: { guardians: { where: { isPrimary: true }, take: 1 } },
      },
      lines: true,
    },
  });

  if (!invoice || invoice.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (invoice.status === "PAID" || invoice.status === "CANCELLED") {
    return NextResponse.json({ error: "Tagihan sudah lunas atau dibatalkan" }, { status: 400 });
  }

  // If already has a Xendit session, allow re-creation (sessions expire after 30 min)
  // Admin can always create a new session — old URL becomes invalid automatically

  const remaining = invoice.totalDue - invoice.totalPaid;
  if (remaining <= 0) {
    return NextResponse.json({ error: "Tagihan sudah lunas" }, { status: 400 });
  }

  const guardian = invoice.student.guardians[0];
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://annisaa-erp-v3.vercel.app";

  try {
    const xenditSession = await createXenditSession({
      referenceId: invoice.id,
      amount: remaining,
      description: `${invoice.invoiceNumber} — ${invoice.student.name} — ${invoice.periodLabel}`,
      customerName: guardian?.name ?? invoice.student.name,
      customerEmail: guardian?.email ?? undefined,
      customerPhone: guardian?.whatsapp ?? guardian?.phone ?? undefined,
      successReturnUrl: `${appUrl}/payment/success?invoice=${invoice.id}`,
      cancelReturnUrl: `${appUrl}/payment/cancel?invoice=${invoice.id}`,
      items: invoice.lines.map((line) => ({
        name: line.labelSnapshot,
        quantity: 1,
        price: line.finalAmount,
      })),
    });

    // Save session ID and payment URL to invoice
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        xenditSessionId: xenditSession.id,
        xenditPaymentUrl: xenditSession.payment_link_url,
        status: invoice.status === "DRAFT" ? "SENT" : invoice.status,
        sentAt: invoice.sentAt ?? new Date(),
      },
    });

    return NextResponse.json({
      paymentUrl: xenditSession.payment_link_url,
      sessionId: xenditSession.id,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[XENDIT] Create session failed:", msg);
    return NextResponse.json({ error: `Gagal membuat link pembayaran: ${msg}` }, { status: 500 });
  }
}
