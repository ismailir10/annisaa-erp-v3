import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { reconcileInvoicePayment } from "@/lib/payments/reconcile";

/**
 * POST /api/invoices/[id]/refresh-payment
 *
 * Admin-only manual reconciliation — polls the active payment gateway for this
 * invoice and applies whatever the gateway reports, using the exact same
 * transition logic the webhook uses (`lib/payments/webhook-processor.ts` via
 * `lib/payments/reconcile.ts`). This is the fallback for a webhook that never
 * fired, or an environment where webhooks are not reachable at all.
 *
 * Safe to call repeatedly: the gateway call is read-only, and every local
 * write goes through the shared processor's dedup + advisory-lock guards. See
 * `reconcileInvoicePayment` for the three idempotency layers.
 *
 * Auth mirrors the sibling `webhook-events` route: admin role required, and a
 * tenant-scoped 404 when the invoice belongs to another tenant (never leak
 * existence across tenants).
 *
 * Rate limited per (user, invoice) because each call costs an outbound gateway
 * request — a held-down button must not turn into a gateway rate-limit ban for
 * the whole school.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    select: { id: true, tenantId: true },
  });
  if (!invoice || invoice.tenantId !== session.tenantId) {
    return NextResponse.json(
      { error: "Tagihan tidak ditemukan" },
      { status: 404 },
    );
  }

  const { success } = rateLimit(
    `refresh-payment:${session.id}:${id}`,
    10,
    60_000,
  );
  if (!success) {
    return NextResponse.json(
      {
        error:
          "Terlalu sering memeriksa status. Tunggu sebentar lalu coba lagi.",
      },
      { status: 429 },
    );
  }

  const result = await reconcileInvoicePayment(id);

  if (result.code === "NOT_FOUND") {
    return NextResponse.json({ error: result.message }, { status: 404 });
  }
  if (result.code === "GATEWAY_ERROR") {
    // 502: our side is fine, the upstream gateway is not.
    return NextResponse.json({ error: result.message, ...result }, { status: 502 });
  }

  return NextResponse.json(result);
}
