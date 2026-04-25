import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { parsePagination, parseSort } from "@/lib/api/pagination";
import { paginatedResponse } from "@/lib/api/response";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { Prisma } from "@/lib/generated/prisma/client";
import { nextInvoiceNumber, sumDecimals } from "@/lib/finance/invoice-numbers";
import { createXenditSessionForInvoice } from "@/lib/xendit/helpers";
import { createManualInvoiceSchema } from "@/lib/validations/invoice";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
  }

  const { searchParams } = new URL(req.url);
  const { skip, take, page, pageSize } = parsePagination(searchParams);
  const sort = parseSort(searchParams, {
    allow: ["createdAt", "invoiceNumber", "dueDate", "totalDue", "totalPaid", "status", "periodLabel"],
    default: "createdAt",
    defaultOrder: "desc",
  });
  if (sort instanceof Response) return sort;
  const { orderBy } = sort;
  const status = searchParams.get("status");
  const studentId = searchParams.get("studentId");
  const search = searchParams.get("search") ?? "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { tenantId: session.tenantId };
  if (status && status !== "all") where.status = status;
  if (studentId) where.studentId = studentId;
  if (search) {
    where.OR = [
      { invoiceNumber: { contains: search, mode: "insensitive" } },
      { periodLabel: { contains: search, mode: "insensitive" } },
      { student: { name: { contains: search, mode: "insensitive" } } },
    ];
  }

  const [invoices, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      skip,
      take,
      include: {
        student: { select: { name: true, nickname: true } },
        _count: { select: { payments: true } },
      },
      orderBy,
    }),
    prisma.invoice.count({ where }),
  ]);

  return NextResponse.json(paginatedResponse(invoices, total, page, pageSize));
}

/**
 * POST /api/invoices
 *
 * Manual single-invoice creation with custom line items + inline Xendit
 * Checkout Session. Complements `POST /api/invoices/generate/batch` for
 * one-off charges (late enrollment, sibling discount, mid-year uang pangkal,
 * replacement seragam, field trips, etc.) where the bulk-by-program path
 * doesn't fit.
 *
 * Flow:
 *   1. Verify caller is admin and student belongs to tenant with an active
 *      enrollment.
 *   2. Verify every fee component belongs to tenant and is enabled.
 *   3. Inside one transaction: allocate next invoice number under advisory
 *      lock, create invoice with status `PENDING_PAYMENT_LINK`, create lines
 *      using server-derived `totalDue` (any client total is ignored).
 *   4. After commit: best-effort Xendit Checkout Session creation. Success
 *      flips status to SENT and clears any prior `paymentLinkError`. Failure
 *      keeps the invoice durable but persists the error message — admin can
 *      retry from the list/detail UI.
 *   5. Returns 201 with the created invoice (including lines + Xendit fields)
 *      plus an optional `xenditError` for the failure case.
 */
export async function POST(req: NextRequest) {
  // Rate limit: 20 manual creates per minute per IP. Manual create is a
  // human-driven action, so this is generous but bounded.
  const { success } = rateLimit(`invoices-manual:${getClientIp(req)}`, 20, 60_000);
  if (!success) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan. Coba lagi nanti." },
      { status: 429 }
    );
  }

  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createManualInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validasi gagal", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { studentId, periodLabel, dueDate, lines } = parsed.data;
  const tenantId = session.tenantId;

  // Verify the student is enrolled and active in *this* tenant. We use the
  // enrollment row as the source of truth because it carries tenant scoping
  // via `classSection.tenantId` — the Student row's tenantId is denormalized
  // and could lag in rare edge cases.
  const enrollment = await prisma.studentEnrollment.findFirst({
    where: { studentId, status: "ACTIVE", classSection: { tenantId } },
    select: { studentId: true },
  });
  if (!enrollment) {
    return NextResponse.json(
      { error: "Siswa tidak terdaftar aktif" },
      { status: 400 }
    );
  }

  // Verify every fee component is tenant-owned and enabled. We use distinct
  // ids so a duplicate id in the payload doesn't bypass the count check below.
  const lineFeeIds = [...new Set(lines.map((l) => l.feeComponentId))];
  const components = await prisma.feeComponentDef.findMany({
    where: { id: { in: lineFeeIds }, tenantId, isEnabled: true },
    select: { id: true, label: true },
  });
  if (components.length !== lineFeeIds.length) {
    return NextResponse.json(
      { error: "Beberapa komponen biaya tidak valid" },
      { status: 400 }
    );
  }

  // Best-effort lookup — billing parent stays nullable on Invoice.
  const guardian = await prisma.studentGuardian.findFirst({
    where: { studentId, isPrimary: true },
    select: { parentId: true },
  });

  const componentLabelById = new Map(components.map((c) => [c.id, c.label]));
  const trimmedLabel = periodLabel.trim();

  const created = await prisma.$transaction(async (tx) => {
    const invoiceNumber = await nextInvoiceNumber(tx, tenantId);
    // Server-derived total — any client-provided total is discarded.
    const totalDue = sumDecimals(lines.map((l) => l.amount));

    return tx.invoice.create({
      data: {
        tenantId,
        studentId,
        parentId: guardian?.parentId ?? null,
        invoiceNumber,
        periodLabel: trimmedLabel,
        dueDate,
        totalDue,
        status: "PENDING_PAYMENT_LINK",
        createdBy: session.id,
        lines: {
          create: lines.map((l) => ({
            feeComponentId: l.feeComponentId,
            labelSnapshot: componentLabelById.get(l.feeComponentId) ?? "",
            amount: new Prisma.Decimal(l.amount),
            finalAmount: new Prisma.Decimal(l.amount),
          })),
        },
      },
      select: { id: true },
    });
  });

  // Inline Xendit. Failure here is a durable data state, not a transient
  // error — the invoice already exists in `PENDING_PAYMENT_LINK` so admin
  // can retry from the list/detail surface.
  let xenditError: string | undefined;
  try {
    const result = await createXenditSessionForInvoice(created.id, tenantId);
    if (result) {
      await prisma.invoice.update({
        where: { id: created.id },
        data: { status: "SENT", sentAt: new Date(), paymentLinkError: null },
      });
    } else {
      xenditError = "Gagal membuat sesi pembayaran";
      try {
        await prisma.invoice.update({
          where: { id: created.id },
          data: { paymentLinkError: xenditError },
        });
      } catch {
        // Best-effort write-back; response still surfaces the error below.
      }
    }
  } catch (e) {
    xenditError = e instanceof Error ? e.message : "Unknown error";
    try {
      await prisma.invoice.update({
        where: { id: created.id },
        data: { paymentLinkError: xenditError },
      });
    } catch {
      // Best-effort write-back; response still surfaces the error below.
    }
  }

  // Re-fetch with lines + Xendit fields so the admin UI can surface the link
  // (or error) immediately without a follow-up GET.
  const fresh = await prisma.invoice.findUnique({
    where: { id: created.id },
    include: { lines: true },
  });

  return NextResponse.json(
    {
      id: fresh?.id ?? created.id,
      invoiceNumber: fresh?.invoiceNumber,
      totalDue: fresh?.totalDue,
      status: fresh?.status,
      xenditPaymentUrl: fresh?.xenditPaymentUrl ?? null,
      xenditSessionId: fresh?.xenditSessionId ?? null,
      paymentLinkError: fresh?.paymentLinkError ?? null,
      lines: fresh?.lines ?? [],
      ...(xenditError ? { xenditError } : {}),
    },
    { status: 201 }
  );
}
