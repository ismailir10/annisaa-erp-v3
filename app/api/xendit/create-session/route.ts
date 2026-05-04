import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { createXenditSessionForInvoice } from "@/lib/xendit/helpers";
import { formatPaymentLinkError } from "@/lib/xendit/error-prefix";

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
  let statusChanged = false;
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

    // Idempotency: if a Xendit session already exists for this invoice, return it
    // instead of creating a second one. Admin clicking "Kirim" twice must never
    // produce two live payment links per invoice.
    if (invoice.xenditSessionId && invoice.xenditPaymentUrl) {
      // Defensive: clear any stale paymentLinkError (no-op if already null).
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: { paymentLinkError: null },
      });

      results.push({
        studentName: invoice.student.name,
        invoiceNumber: invoice.invoiceNumber,
        paymentUrl: invoice.xenditPaymentUrl,
      });
      created++;
      continue;
    }

    try {
      const result = await createXenditSessionForInvoice(invoiceId, session.tenantId, new URL(req.url).origin);

      if (result) {
        // Update status to SENT (helper only stores Xendit fields).
        // Clear paymentLinkError — covers the retry-of-PENDING_PAYMENT_LINK path.
        await prisma.invoice.update({
          where: { id: invoiceId },
          data: { status: "SENT", sentAt: new Date(), paymentLinkError: null },
        });
        if (invoice.status !== "SENT") statusChanged = true;

        results.push({
          studentName: invoice.student.name,
          invoiceNumber: invoice.invoiceNumber,
          paymentUrl: result.paymentUrl,
        });
        created++;
      } else {
        // Helper returns null on TOCTOU-reachable guard conditions (status flipped
        // to PAID/CANCELLED between our pre-check and the helper's re-check, or
        // remaining went to 0). Surface a diagnostic so admin sees why.
        errors.push(`${invoice.student.name}: Gagal membuat sesi pembayaran`);
        failed++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      // Persist the failure as durable state — invoice becomes filterable in
      // the admin list under PENDING_PAYMENT_LINK and is retryable from there.
      // The persisted column is prefix-tagged via formatPaymentLinkError so
      // the breakdown endpoint can aggregate by category; the user-facing
      // errors[] line keeps the plain message for readability.
      try {
        await prisma.invoice.update({
          where: { id: invoiceId },
          data: {
            status: "PENDING_PAYMENT_LINK",
            paymentLinkError: formatPaymentLinkError(e),
          },
        });
        if (invoice.status !== "PENDING_PAYMENT_LINK") statusChanged = true;
      } catch {
        // Swallow write-back failure — the original Xendit error is still surfaced
        // to the admin via errors[], counts are still correct.
      }
      errors.push(`${invoice.student.name}: ${msg}`);
      failed++;
    }
  }

  // Bust parent-portal Tagihan caches if any invoice flipped status during
  // this batch (UAT-2026-05-03 INV-01 vector — without this the parent
  // doesn't see the new payment link or the PENDING_PAYMENT_LINK state for
  // up to 120 s after admin clicks "Kirim Tagihan").
  if (statusChanged) {
    revalidateTag("parent-invoice-list", { expire: 0 });
    revalidateTag("student-invoices", { expire: 0 });
  }

  return NextResponse.json({
    created,
    failed,
    total: invoiceIds.length,
    results,
    errors: errors.length > 0 ? errors : undefined,
  });
}
