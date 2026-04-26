import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { Prisma } from "@/lib/generated/prisma/client";
import { nextInvoiceNumber, sumDecimals } from "@/lib/finance/invoice-numbers";
import { pLimit } from "@/lib/finance/p-limit";
import { createXenditSessionForInvoice } from "@/lib/xendit/helpers";
import { generateBatchSchema } from "@/lib/validations/invoice";

/**
 * POST /api/invoices/generate/batch
 *
 * Create up to 25 invoices in a single transaction, then attach Xendit
 * Checkout Sessions in parallel (concurrency cap = 5). Replaces the legacy
 * monolithic `POST /api/invoices/generate` route — bulk runs now happen as
 * a sequential client-driven chain of these calls (see Task 11 admin UI).
 *
 * Per-invoice flow:
 *   1. Re-query eligibility scoped to the provided studentIds (defends against
 *      fabricated IDs the client may have invented post-/plan).
 *   2. Inside one transaction: allocate sequential invoice numbers via
 *      `nextInvoiceNumber` (advisory lock held until commit), createMany
 *      invoices with status `PENDING_PAYMENT_LINK`, then createMany lines.
 *   3. After commit: fan out Xendit Checkout Session creation with `pLimit(5)`.
 *      Success → flip to SENT, clear paymentLinkError. Failure → status stays
 *      PENDING_PAYMENT_LINK, paymentLinkError persisted for retry surface.
 */
export async function POST(req: NextRequest) {
  // Rate limit: 30 batch calls per minute per IP. Covers a 750-student bulk run
  // at 25 students per chunk, which is the realistic upper bound.
  const { success } = rateLimit(`invoices-batch:${getClientIp(req)}`, 30, 60_000);
  if (!success) {
    return NextResponse.json({ error: "Terlalu banyak permintaan. Coba lagi nanti." }, { status: 429 });
  }

  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = generateBatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validasi gagal", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { studentIds, periodLabel, dueDate, academicYearId } = parsed.data;
  const tenantId = session.tenantId;
  const trimmedLabel = periodLabel.trim();

  // Re-query eligibility scoped to the provided studentIds. The /plan endpoint
  // already filtered, but the client could have edited the list; we treat the
  // payload as untrusted and re-derive everything here.
  const enrollments = await prisma.studentEnrollment.findMany({
    where: {
      studentId: { in: studentIds },
      status: "ACTIVE",
      classSection: {
        tenantId,
        academicYearId,
      },
    },
    include: {
      student: { select: { id: true, name: true } },
      classSection: { select: { programId: true } },
    },
  });

  // Dedup students with multiple active enrollments — one invoice per student
  // per period (matches /plan dedup semantics + Task 8 fix).
  const enrollmentByStudent = new Map<string, (typeof enrollments)[number]>();
  for (const e of enrollments) {
    if (!enrollmentByStudent.has(e.student.id)) {
      enrollmentByStudent.set(e.student.id, e);
    }
  }

  const programIds = [...new Set([...enrollmentByStudent.values()].map((e) => e.classSection.programId))];

  const [feeStructures, existingInvoices, primaryGuardians] = await Promise.all([
    prisma.programFeeStructure.findMany({
      where: {
        programId: { in: programIds },
        academicYearId,
        feeComponent: { isEnabled: true, isRecurring: true },
      },
      include: { feeComponent: true },
    }),
    prisma.invoice.findMany({
      where: { tenantId, periodLabel: trimmedLabel, studentId: { in: studentIds } },
      select: { studentId: true },
    }),
    prisma.studentGuardian.findMany({
      where: { studentId: { in: studentIds }, isPrimary: true },
      select: { studentId: true, parentId: true },
    }),
  ]);

  // Group fee structures by program — used to look up the line items per student.
  const feesByProgram = new Map<string, typeof feeStructures>();
  for (const fs of feeStructures) {
    const list = feesByProgram.get(fs.programId) ?? [];
    list.push(fs);
    feesByProgram.set(fs.programId, list);
  }

  const existingStudentIds = new Set(existingInvoices.map((i) => i.studentId));
  const guardianByStudent = new Map(primaryGuardians.map((g) => [g.studentId, g.parentId]));

  type InvoiceToBuild = {
    studentId: string;
    studentName: string;
    parentId: string | null;
    programFees: typeof feeStructures;
    totalDue: Prisma.Decimal;
  };

  const invoicesToBuild: InvoiceToBuild[] = [];

  for (const studentId of studentIds) {
    const enrollment = enrollmentByStudent.get(studentId);
    if (!enrollment) continue; // No active enrollment found for this id.

    if (existingStudentIds.has(studentId)) continue; // Already invoiced for the period.

    const programFees = feesByProgram.get(enrollment.classSection.programId) ?? [];
    if (programFees.length === 0) continue; // No active recurring fee structure.

    invoicesToBuild.push({
      studentId,
      studentName: enrollment.student.name,
      parentId: guardianByStudent.get(studentId) ?? null,
      programFees,
      totalDue: sumDecimals(programFees.map((f) => f.amount)),
    });
  }

  // Number of distinct studentIds that did NOT make it into the build list
  // (no enrollment, no fee structure, or already invoiced). Used so the client
  // can reconcile against the /plan output.
  const distinctRequested = new Set(studentIds).size;
  const skipped = distinctRequested - invoicesToBuild.length;

  type CreatedRow = {
    invoiceId: string;
    studentId: string;
    studentName: string;
    invoiceNumber: string;
  };

  let txResult: CreatedRow[] = [];

  if (invoicesToBuild.length > 0) {
    txResult = await prisma.$transaction(async (tx) => {
      // Allocate the first number under the tenant-scoped advisory lock —
      // the lock persists for the life of the transaction so concurrent batches
      // queue rather than collide on `Invoice.invoiceNumber` uniqueness.
      const firstNumber = await nextInvoiceNumber(tx, tenantId);
      const match = firstNumber.match(/^(INV-\d{4}-)(\d+)$/);
      if (!match) throw new Error(`Unexpected invoice number format: ${firstNumber}`);
      const prefix = match[1];
      const padWidth = Math.max(4, match[2].length);
      let nextNum = parseInt(match[2]);

      const rows = invoicesToBuild.map((inv) => {
        const invoiceNumber = `${prefix}${String(nextNum).padStart(padWidth, "0")}`;
        nextNum++;
        return { ...inv, invoiceNumber };
      });

      await tx.invoice.createMany({
        data: rows.map((r) => ({
          tenantId,
          studentId: r.studentId,
          parentId: r.parentId,
          invoiceNumber: r.invoiceNumber,
          periodLabel: trimmedLabel,
          dueDate,
          totalDue: r.totalDue,
          status: "PENDING_PAYMENT_LINK",
          createdBy: session.id,
        })),
      });

      // Fetch the freshly-created invoice ids — we need them both for the line
      // insert below and for the post-tx Xendit fan-out. createMany doesn't
      // return rows, so the (tenantId, periodLabel, invoiceNumber IN ...)
      // round-trip is unavoidable.
      const created = await tx.invoice.findMany({
        where: {
          tenantId,
          periodLabel: trimmedLabel,
          invoiceNumber: { in: rows.map((r) => r.invoiceNumber) },
        },
        select: { id: true, invoiceNumber: true, studentId: true },
      });

      const idByNumber = new Map(created.map((c) => [c.invoiceNumber, c.id]));

      await tx.invoiceLine.createMany({
        data: rows.flatMap((r) =>
          r.programFees.map((f) => ({
            invoiceId: idByNumber.get(r.invoiceNumber)!,
            feeComponentId: f.feeComponentId,
            labelSnapshot: f.feeComponent.label,
            amount: f.amount,
            finalAmount: f.amount,
          }))
        ),
      });

      return rows.map<CreatedRow>((r) => ({
        invoiceId: idByNumber.get(r.invoiceNumber)!,
        studentId: r.studentId,
        studentName: r.studentName,
        invoiceNumber: r.invoiceNumber,
      }));
    });
  }

  // Fan out Xendit Checkout Session creation with concurrency cap = 5.
  // 25 invoices / 5 parallel × ~1500ms worst-case ≈ 7.5s — well under the
  // Vercel 60s function ceiling.
  const limit = pLimit(5);
  const settled = await Promise.allSettled(
    txResult.map((row) =>
      limit(() =>
        createXenditSessionForInvoice(row.invoiceId, tenantId).then((res) => ({ row, result: res }))
      )
    )
  );

  type ResultRow =
    | {
        studentId: string;
        invoiceId: string;
        invoiceNumber: string;
        status: "SENT";
        paymentUrl: string;
      }
    | {
        studentId: string;
        invoiceId: string;
        invoiceNumber: string;
        status: "PENDING_PAYMENT_LINK";
        error: string;
      };

  const results: ResultRow[] = [];

  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i];
    const row = txResult[i];

    if (outcome.status === "fulfilled" && outcome.value.result) {
      // Helper succeeded — flip status + clear any paymentLinkError. Wrap in
      // try/catch so a transient DB hiccup at this step doesn't drop the result
      // (the invoice still has its Xendit session attached by the helper).
      try {
        await prisma.invoice.update({
          where: { id: row.invoiceId },
          data: { status: "SENT", sentAt: new Date(), paymentLinkError: null },
        });
      } catch {
        // Best-effort write-back; result row still surfaces success below.
      }
      results.push({
        studentId: row.studentId,
        invoiceId: row.invoiceId,
        invoiceNumber: row.invoiceNumber,
        status: "SENT",
        paymentUrl: outcome.value.result.paymentUrl,
      });
    } else {
      // Two failure shapes:
      //   - rejected: helper threw (Xendit 4xx/5xx, network error, etc.)
      //   - fulfilled with null: TOCTOU guard tripped (PAID/CANCELLED mid-flight,
      //     or remaining went to 0). Surface a diagnostic so admin can retry.
      const msg =
        outcome.status === "rejected"
          ? outcome.reason instanceof Error
            ? outcome.reason.message
            : "Unknown error"
          : "Gagal membuat sesi pembayaran";
      try {
        await prisma.invoice.update({
          where: { id: row.invoiceId },
          data: { paymentLinkError: msg },
        });
      } catch {
        // Best-effort write-back; result row still surfaces failure below.
      }
      results.push({
        studentId: row.studentId,
        invoiceId: row.invoiceId,
        invoiceNumber: row.invoiceNumber,
        status: "PENDING_PAYMENT_LINK",
        error: msg,
      });
    }
  }

  return NextResponse.json({
    created: txResult.length,
    skipped,
    results,
  });
}
