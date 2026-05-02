import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guards";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("payroll.approve");
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const { id } = await params;

  const payroll = await prisma.payrollRun.findUnique({ where: { id } });
  if (!payroll || payroll.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Compare-and-swap on status. Two concurrent approve requests both used to
  // pass the `status === "DRAFT"` read above before either committed, leading
  // to a double-approve. updateMany with the status predicate flips DRAFT to
  // APPROVED atomically and reports `count` so we can detect a lost race
  // without serializable isolation. Same pattern as send-slips route.
  const flip = await prisma.payrollRun.updateMany({
    where: { id, status: "DRAFT" },
    data: {
      status: "APPROVED",
      approvedBy: session.id,
      approvedAt: new Date(),
    },
  });
  if (flip.count === 0) {
    // Either status was not DRAFT to begin with, or another approve raced
    // ahead. 409 is the correct shape for both — caller refetches state.
    return NextResponse.json(
      { error: "Hanya draft yang bisa disetujui" },
      { status: 409 }
    );
  }

  // Lock attendance rows after the status flip. Done outside the CAS so a
  // failure here leaves the run APPROVED but with attendance still mutable —
  // the lock is a payroll-rerun guard, not a financial primitive. A future
  // background job can reconcile any rare gap.
  const items = await prisma.payrollItem.findMany({
    where: { payrollRunId: id },
    select: { employeeId: true },
  });

  if (items.length > 0) {
    await prisma.attendanceRecord.updateMany({
      where: {
        employeeId: { in: items.map((i) => i.employeeId) },
        date: { gte: payroll.periodStart, lte: payroll.periodEnd },
      },
      data: { isLocked: true },
    });
  }

  return NextResponse.json({ ok: true });
}
