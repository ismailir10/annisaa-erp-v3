import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { getGateway } from "@/lib/payments/registry";
import { redactPayload } from "@/lib/webhook/redact-payload";
import { extractDisplayFields } from "@/lib/webhook/extract-display-fields";
import { mapErrorLabel } from "@/lib/webhook/error-labels";

/**
 * GET /api/invoices/[id]/webhook-events
 *
 * Admin-only feed of every `WebhookEvent` row tied to a single invoice,
 * scoped to the currently active payment gateway (`provider` matches
 * `getGateway().id` — AC-16, cycle 2026-07-27-doku-payment-gateway T4). This
 * keeps a future two-provider database from mixing Xendit and DOKU rows
 * into one activity panel. Powers the "Aktivitas Pembayaran" panel on the
 * invoice detail page.
 *
 * Tenant-scoped via the invoice ownership check (404 when the invoice does
 * not belong to the caller's tenant — same shape as the sibling `/api/invoices/[id]`
 * GET). Each row is mapped through three pure helpers before leaving the
 * server:
 *   - `redactPayload`        — strips PII (`customer.*`, `billing_information.*`)
 *   - `extractDisplayFields` — distills convenience fields the panel renders
 *   - `mapErrorLabel`        — humanizes the engineer-facing errorMessage prefix
 *
 * Ordered `createdAt desc` so the most recent event is on top — admins
 * investigating "did this invoice get paid?" see the latest delivery first.
 */
export async function GET(
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
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const events = await prisma.webhookEvent.findMany({
    where: { invoiceId: id, provider: getGateway().id },
    orderBy: { createdAt: "desc" },
  });

  const data = events.map((e) => ({
    id: e.id,
    eventType: e.eventType,
    status: e.status,
    errorMessage: e.errorMessage,
    errorLabel: mapErrorLabel(e.errorMessage),
    createdAt: e.createdAt,
    displayFields: extractDisplayFields(e.payload),
    payload: redactPayload(e.payload as unknown),
  }));

  return NextResponse.json(data);
}
