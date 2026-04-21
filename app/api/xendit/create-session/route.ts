import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { createXenditSessionForInvoice } from "@/lib/xendit/helpers";

/**
 * Create Xendit Checkout Sessions — single or bulk.
 * Bulk: admin clicks "Kirim Tagihan" → creates sessions for all selected invoices.
 * Mirrors the payroll "Kirim Slip" flow.
 */
export async function POST(req: NextRequest) {
  // Rate limit: 5 Xendit session creations per minute
  const { success } = rateLimit(`xendit:${getClientIp(req)}`, 5, 60_000);
  if (!success) {
    return NextResponse.json({ error: "Terlalu banyak permintaan. Coba lagi nanti." }, { status: 429 });
  }

  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const invoiceIds: string[] = body.invoiceIds ?? (body.invoiceId ? [body.invoiceId] : []);

  if (invoiceIds.length === 0) {
    return NextResponse.json({ error: "Pilih minimal satu tagihan" }, { status: 400 });
  }

  let created = 0;
  let failed = 0;
  const errors: string[] = [];
  const results: { studentName: string; invoiceNumber: string; paymentUrl: string }[] = [];

  for (const invoiceId of invoiceIds) {
    // Fetch invoice for display in results
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { student: { select: { name: true } }, lines: { select: { labelSnapshot: true } } },
    });

    if (!invoice || invoice.tenantId !== session.tenantId) {
      errors.push(`Tagihan tidak ditemukan`);
      failed++;
      continue;
    }

    if (invoice.status === "PAID" || invoice.status === "CANCELLED") {
      failed++;
      continue;
    }

    const remaining = Number(invoice.totalDue) - Number(invoice.totalPaid);
    if (remaining <= 0) {
      failed++;
      continue;
    }

    try {
      const result = await createXenditSessionForInvoice(invoiceId, session.tenantId);

      if (result) {
        // Update status to SENT (helper only stores Xendit fields)
        await prisma.invoice.update({
          where: { id: invoiceId },
          data: { status: "SENT", sentAt: new Date() },
        });

        results.push({
          studentName: invoice.student.name,
          invoiceNumber: invoice.invoiceNumber,
          paymentUrl: result.paymentUrl,
        });
        created++;
      } else {
        failed++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      errors.push(`${invoice.student.name}: ${msg}`);
      failed++;
    }
  }

  return NextResponse.json({
    created,
    failed,
    total: invoiceIds.length,
    results,
    errors: errors.length > 0 ? errors : undefined,
  });
}
