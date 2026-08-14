import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { updateBillingRunLineSchema } from "@/lib/validations/billing-run";
import { resolveLineEdit, sumRowTotal, type LineSource } from "@/lib/finance/billing-run-lines";

// Billing Run wizard (Cycle B2 — docs/cycles/2026-08-14-billing-run-wizard-b2.md,
// Task T3). Step 2's per-line edit and remove actions.
//
// Deliberately NO `export const revalidate` here, same reasoning as the
// sibling rows/[rowId]/route.ts — draft-editing state must never be cached.

// Allowlist, not denylist — see the identical comment in the sibling
// lines/route.ts and app/api/billing-runs/[id]/route.ts:98.
const MUTABLE_ROW_STATUSES = new Set(["PENDING", "EXCLUDED"]);

type OwnershipRun = { id: string; status: string };
type OwnershipRow = { id: string; status: string };
type OwnershipLine = {
  id: string;
  amount: import("@/lib/generated/prisma/client").Prisma.Decimal;
  source: string;
};

type OwnershipResult =
  | { error: NextResponse }
  | { run: OwnershipRun; row: OwnershipRow; line: OwnershipLine };

/**
 * Three ownership hops, each a separate query, before touching the payload:
 * run belongs to the tenant, row belongs to the run, line belongs to the
 * row. The sibling rows/[rowId]/route.ts does the first two and comments on
 * why; a line mutation adds the third since a lineId is one hop deeper.
 */
async function loadOwnership(
  billingRunId: string,
  rowId: string,
  lineId: string,
  tenantId: string,
): Promise<OwnershipResult> {
  const run = await prisma.billingRun.findFirst({
    where: { id: billingRunId, tenantId },
    select: { id: true, status: true },
  });
  if (!run) {
    return { error: NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 }) };
  }

  const row = await prisma.billingRunRow.findFirst({
    where: { id: rowId, billingRunId },
    select: { id: true, status: true },
  });
  if (!row) {
    return { error: NextResponse.json({ error: "Baris tidak ditemukan" }, { status: 404 }) };
  }

  const line = await prisma.billingRunLine.findFirst({
    where: { id: lineId, billingRunRowId: rowId },
    select: { id: true, amount: true, source: true },
  });
  if (!line) {
    return { error: NextResponse.json({ error: "Baris tagihan tidak ditemukan" }, { status: 404 }) };
  }

  return { run, row, line };
}

function guardMutable(run: OwnershipRun, row: OwnershipRow): NextResponse | null {
  if (run.status !== "DRAFT") {
    return NextResponse.json({ error: "Run tagihan tidak lagi berstatus draft" }, { status: 409 });
  }
  if (!MUTABLE_ROW_STATUSES.has(row.status)) {
    return NextResponse.json({ error: "Baris ini tidak bisa diubah lagi" }, { status: 409 });
  }
  return null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; rowId: string; lineId: string }> },
) {
  const { success } = rateLimit(`update-billing-run-line:${getClientIp(req)}`, 30, 60_000);
  if (!success) return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });

  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id: billingRunId, rowId, lineId } = await params;

  const owned = await loadOwnership(billingRunId, rowId, lineId, session.tenantId);
  if ("error" in owned) return owned.error;
  const { run, row, line } = owned;

  const body = await req.json().catch(() => null);
  const parsed = updateBillingRunLineSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validasi gagal", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const guard = guardMutable(run, row);
  if (guard) return guard;

  // Never write `amount` — it is the fee-structure snapshot and the audit
  // anchor (Assumption 1). resolveLineEdit derives adjustmentAmount from the
  // new finalAmount and decides the sign/clamp rule from the line's current
  // source; the route does none of that math itself.
  const resolved = resolveLineEdit({
    amount: line.amount,
    source: line.source as LineSource,
    finalAmount: parsed.data.finalAmount,
    note: parsed.data.note,
  });
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.billingRunLine.update({
      where: { id: lineId },
      data: {
        ...(parsed.data.label !== undefined ? { labelSnapshot: parsed.data.label } : {}),
        adjustmentAmount: resolved.adjustmentAmount,
        finalAmount: resolved.finalAmount,
        adjustmentNote: resolved.adjustmentNote,
        source: resolved.source,
      },
    });

    const lines = await tx.billingRunLine.findMany({
      where: { billingRunRowId: rowId },
      select: { finalAmount: true },
    });
    const totalDue = sumRowTotal(lines);
    await tx.billingRunRow.update({ where: { id: rowId }, data: { totalDue } });

    return { updated, totalDue };
  });

  return NextResponse.json({ line: result.updated, totalDue: result.totalDue });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; rowId: string; lineId: string }> },
) {
  const { success } = rateLimit(`delete-billing-run-line:${getClientIp(req)}`, 30, 60_000);
  if (!success) return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });

  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id: billingRunId, rowId, lineId } = await params;

  const owned = await loadOwnership(billingRunId, rowId, lineId, session.tenantId);
  if ("error" in owned) return owned.error;
  const { run, row } = owned;

  const guard = guardMutable(run, row);
  if (guard) return guard;

  try {
    const totalDue = await prisma.$transaction(async (tx) => {
      // Count inside the transaction — the last-line refusal must see the
      // same snapshot it deletes from, not a count read before the lock.
      const count = await tx.billingRunLine.count({ where: { billingRunRowId: rowId } });

      // An invoice with no lines is not a thing to commit — refuse deleting
      // the last remaining line of a row still PENDING (an EXCLUDED row is
      // never committed as-is, so it's fine to empty). Points at the row's
      // exclude toggle instead, per the Spec acceptance criterion.
      if (count <= 1 && row.status === "PENDING") {
        throw Object.assign(new Error("LAST_LINE"), {});
      }

      await tx.billingRunLine.delete({ where: { id: lineId } });

      const lines = await tx.billingRunLine.findMany({
        where: { billingRunRowId: rowId },
        select: { finalAmount: true },
      });
      const total = sumRowTotal(lines);
      await tx.billingRunRow.update({ where: { id: rowId }, data: { totalDue: total } });
      return total;
    });

    return NextResponse.json({ totalDue });
  } catch (e) {
    if (e instanceof Error && e.message === "LAST_LINE") {
      return NextResponse.json(
        {
          error:
            "Baris ini hanya punya satu baris tagihan yang tersisa. Gunakan tombol kecualikan pada baris jika ingin mengosongkannya, bukan menghapus baris tagihan terakhir.",
        },
        { status: 409 },
      );
    }
    throw e;
  }
}
