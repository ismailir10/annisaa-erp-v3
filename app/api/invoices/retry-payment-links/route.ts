import { NextRequest, NextResponse } from "next/server";
import { getSession, isAdminRole } from "@/lib/auth";
import { retryPaymentLinksSchema } from "@/lib/validations/invoice";
import { retryPaymentLinks } from "@/lib/finance/xendit-retry";

/**
 * POST /api/invoices/retry-payment-links
 *
 * Re-attempt Xendit Checkout Session creation for invoices stuck in
 * `PENDING_PAYMENT_LINK`. Body shape:
 *
 *   { invoiceIds?: string[] }   // omit / empty = retry all PENDING for tenant
 *
 * Hard cap: 25 invoice ids per call (matches the batch endpoint's per-call
 * Xendit budget). The admin UI iterates in chunks of 25 for larger sets.
 *
 * Both the per-row retry action and the bulk "Coba Lagi Link (N)" header
 * button funnel through this same endpoint.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = retryPaymentLinksSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validasi gagal", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const outcome = await retryPaymentLinks(
    session.tenantId,
    parsed.data.invoiceIds ?? null
  );

  return NextResponse.json(outcome);
}
