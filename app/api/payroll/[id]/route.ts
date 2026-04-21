import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, canViewSalary } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { updatePayrollRunSchema } from "@/lib/validations/payroll";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.tenantId || !canViewSalary(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const payroll = await prisma.payrollRun.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          employee: {
            select: { id: true, kode: true, nama: true, jabatan: true, bankAccountNo: true, bankName: true },
          },
          lines: {
            include: { componentDef: { select: { code: true, calcType: true } } },
            orderBy: { componentDef: { sortOrder: "asc" } },
          },
        },
        orderBy: { employee: { nama: "asc" } },
      },
    },
  });

  if (!payroll || payroll.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(payroll);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { success } = rateLimit(`payroll-update:${getClientIp(req)}`, 10, 60_000);
  if (!success) {
    return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });
  }

  const session = await getSession();
  if (!session?.tenantId || !canViewSalary(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  // Authorize BEFORE mutating — fetch + tenant check + status guard.
  const existing = await prisma.payrollRun.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (existing.status !== "DRAFT") {
    return NextResponse.json(
      { error: "PayrollRun can only be edited while DRAFT" },
      { status: 409 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON tidak valid" }, { status: 400 });
  }

  const parsed = updatePayrollRunSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Cross-field validation against stored values when only one bound is updated.
  const nextStart = parsed.data.periodStart ?? existing.periodStart;
  const nextEnd = parsed.data.periodEnd ?? existing.periodEnd;
  if (nextStart > nextEnd) {
    return NextResponse.json(
      { error: "periodStart harus <= periodEnd" },
      { status: 400 }
    );
  }

  // Reject period overlap with other runs in same tenant (mirrors generate/ guard).
  if (parsed.data.periodStart !== undefined || parsed.data.periodEnd !== undefined) {
    const overlapping = await prisma.payrollRun.findFirst({
      where: {
        tenantId: session.tenantId,
        id: { not: id },
        periodStart: { lte: nextEnd },
        periodEnd: { gte: nextStart },
      },
      select: { periodStart: true, periodEnd: true },
    });
    if (overlapping) {
      return NextResponse.json(
        {
          error: `Periode tumpang tindih dengan penggajian ${overlapping.periodStart} - ${overlapping.periodEnd}`,
        },
        { status: 409 }
      );
    }
  }

  const updated = await prisma.payrollRun.update({
    where: { id },
    data: parsed.data,
  });

  return NextResponse.json(updated);
}
