import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";

/**
 * GET /api/invoices/pending-payment-link
 *
 * Thin admin-only endpoint that lists every invoice currently stuck in
 * `PENDING_PAYMENT_LINK` for the tenant. Powers the bulk-retry orchestrator
 * (`runBulkRetry`) — the orchestrator pre-fetches all stuck IDs, then chunks
 * them into 25-item slices for `/api/invoices/retry-payment-links`.
 *
 * Hard cap: 1000 rows. Beyond that the orchestrator surfaces an
 * `<AlertDialog>` overflow banner ("Antrian retry penuh") so the operator
 * knows a follow-up run will be needed. Ordered `createdAt asc` so chunking
 * is deterministic and oldest-stuck invoices retry first.
 *
 * Query param `?count-only=true`: skip the row fetch and return only
 * `{ total: N }`. Used by `runBulkGenerate`'s post-chunk auto-sweep gate —
 * we just need to know "is there anything to sweep?", not the rows. Saves
 * payload size and DB load on the (common) "no failures, skip sweep" path.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const where = {
    tenantId: session.tenantId,
    status: "PENDING_PAYMENT_LINK" as const,
  };

  // `new URL(req.url).searchParams` works for both `NextRequest` (production)
  // and plain `Request` (vitest fixtures). Avoids `req.nextUrl` which is
  // only on the Next-augmented type.
  const countOnly = new URL(req.url).searchParams.get("count-only") === "true";
  if (countOnly) {
    const total = await prisma.invoice.count({ where });
    return NextResponse.json({ total });
  }

  const [rows, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      select: {
        id: true,
        periodLabel: true,
        totalDue: true,
        paymentLinkError: true,
        student: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 1000,
    }),
    prisma.invoice.count({ where }),
  ]);

  const data = rows.map((r) => ({
    id: r.id,
    studentName: r.student?.name ?? "",
    periodLabel: r.periodLabel,
    totalDue: r.totalDue.toString(),
    paymentLinkError: r.paymentLinkError ?? null,
  }));

  return NextResponse.json({ data, total });
}
