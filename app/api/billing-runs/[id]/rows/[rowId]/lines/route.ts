import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { createBillingRunLineSchema } from "@/lib/validations/billing-run";
import { buildManualLineFields, sumRowTotal } from "@/lib/finance/billing-run-lines";

// Billing Run wizard (Cycle B2 — docs/cycles/2026-08-14-billing-run-wizard-b2.md,
// Task T3). Step 2's "Tambah komponen" / "Tambah potongan" actions — add a
// line to a row either from the FeeComponentDef catalog or as an ad-hoc
// discount line.
//
// Deliberately NO `export const revalidate` here, same reasoning as the
// sibling rows/[rowId]/route.ts — draft-editing state must never be cached.

// A line mutation is only safe on a row that hasn't been committed or
// skipped yet — allowlisted (not denylisted), per the reasoning at
// app/api/billing-runs/[id]/route.ts:98: a COMMITTED row already has an
// invoice and a SKIPPED_* row has no lines and is not billable, so a new
// row status added later defaults to "not editable" rather than silently
// becoming editable.
const MUTABLE_ROW_STATUSES = new Set(["PENDING", "EXCLUDED"]);

// The lazily-created, tenant-scoped system component an ad-hoc discount line
// hangs off (Assumption 3). isEnabled: false keeps it out of
// ProgramFeeStructure fee queries (which filter
// feeComponent: { isEnabled: true, isRecurring: true } — see
// lib/finance/materialize-billing-run.ts) and out of the catalog picker, so
// it can never be billed by accident.
const DISCOUNT_COMPONENT_CODE = "penyesuaian_manual";

async function getOrCreateDiscountComponent(tenantId: string) {
  const existing = await prisma.feeComponentDef.findFirst({
    where: { tenantId, code: DISCOUNT_COMPONENT_CODE },
  });
  if (existing) return existing;

  try {
    return await prisma.feeComponentDef.create({
      data: {
        tenantId,
        code: DISCOUNT_COMPONENT_CODE,
        label: "Penyesuaian",
        category: "OTHER",
        isRecurring: false,
        isEnabled: false,
      },
    });
  } catch (e) {
    // `@@unique([tenantId, code])` turns a concurrent create into a P2002,
    // not a duplicate component — swallow it and re-find, which must now
    // succeed since the racing request's create already landed.
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
      const retried = await prisma.feeComponentDef.findFirst({
        where: { tenantId, code: DISCOUNT_COMPONENT_CODE },
      });
      if (retried) return retried;
    }
    throw e;
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; rowId: string }> },
) {
  const { success } = rateLimit(`create-billing-run-line:${getClientIp(req)}`, 30, 60_000);
  if (!success) return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });

  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const tenantId = session.tenantId;
  const { id: billingRunId, rowId } = await params;

  // Two ownership hops before touching the payload — run belongs to the
  // tenant, row belongs to the run. Mirrors rows/[rowId]/route.ts.
  const run = await prisma.billingRun.findFirst({
    where: { id: billingRunId, tenantId },
    select: { id: true, status: true },
  });
  if (!run) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 });

  const row = await prisma.billingRunRow.findFirst({
    where: { id: rowId, billingRunId },
    select: { id: true, status: true },
  });
  if (!row) return NextResponse.json({ error: "Baris tidak ditemukan" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = createBillingRunLineSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validasi gagal", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  if (run.status !== "DRAFT") {
    return NextResponse.json({ error: "Run tagihan tidak lagi berstatus draft" }, { status: 409 });
  }
  if (!MUTABLE_ROW_STATUSES.has(row.status)) {
    return NextResponse.json({ error: "Baris ini tidak bisa diubah lagi" }, { status: 409 });
  }

  const { mode, label, amount } = parsed.data;

  let feeComponentId: string;
  if (mode === "CATALOG") {
    const requestedComponentId = parsed.data.feeComponentId;
    if (!requestedComponentId) {
      // Guarded by the schema's superRefine already; kept as a defensive
      // fallback so TypeScript's optional `feeComponentId` never reaches the
      // query below unchecked.
      return NextResponse.json({ error: "Komponen biaya wajib dipilih" }, { status: 400 });
    }

    // Tenant-owned, enabled, ACTIVE only — a foreign, disabled, or inactive
    // component all read as "not in this tenant's usable catalog" and get
    // the same 404, matching how
    // app/api/student-fee-adjustments/route.ts treats a foreign
    // feeComponentId.
    const component = await prisma.feeComponentDef.findFirst({
      where: { id: requestedComponentId, tenantId, isEnabled: true, status: "ACTIVE" },
      select: { id: true },
    });
    if (!component) {
      return NextResponse.json({ error: "Komponen biaya tidak ditemukan" }, { status: 404 });
    }
    feeComponentId = component.id;

    // A duplicate component on one invoice is a support call — refuse
    // rather than silently doubling the fee. Scoped to CATALOG only: a row
    // may legitimately carry several MANUAL discount lines, which all share
    // the same system component id.
    const duplicate = await prisma.billingRunLine.findFirst({
      where: { billingRunRowId: rowId, feeComponentId },
      select: { id: true },
    });
    if (duplicate) {
      return NextResponse.json(
        { error: "Komponen ini sudah ada pada baris ini" },
        { status: 409 },
      );
    }
  } else {
    const discountComponent = await getOrCreateDiscountComponent(tenantId);
    feeComponentId = discountComponent.id;
  }

  const fields = buildManualLineFields({ mode, label, amount });

  const result = await prisma.$transaction(async (tx) => {
    const created = await tx.billingRunLine.create({
      data: {
        billingRunRowId: rowId,
        feeComponentId,
        labelSnapshot: fields.labelSnapshot,
        amount: fields.amount,
        adjustmentAmount: fields.adjustmentAmount,
        adjustmentNote: fields.adjustmentNote,
        finalAmount: fields.finalAmount,
        source: fields.source,
      },
    });

    const lines = await tx.billingRunLine.findMany({
      where: { billingRunRowId: rowId },
      select: { finalAmount: true },
    });
    const totalDue = sumRowTotal(lines);
    await tx.billingRunRow.update({ where: { id: rowId }, data: { totalDue } });

    return { created, totalDue };
  });

  return NextResponse.json({ line: result.created, totalDue: result.totalDue }, { status: 201 });
}
