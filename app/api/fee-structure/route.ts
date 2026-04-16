import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";

// Cache GET responses for 1 day — fee structures change ~once per academic year
export const revalidate = 86400;

// Get fee structure for a program + academic year
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId) return NextResponse.json([], { status: 401 });

  const { searchParams } = new URL(req.url);
  const programId = searchParams.get("programId");
  const academicYearId = searchParams.get("academicYearId");

  if (!programId || !academicYearId) {
    return NextResponse.json({ error: "programId and academicYearId required" }, { status: 400 });
  }

  // Verify program and year belong to tenant
  const program = await prisma.program.findFirst({ where: { id: programId, tenantId: session.tenantId } });
  if (!program) return NextResponse.json([], { status: 404 });
  const year = await prisma.academicYear.findFirst({ where: { id: academicYearId, tenantId: session.tenantId } });
  if (!year) return NextResponse.json([], { status: 404 });

  const structures = await prisma.programFeeStructure.findMany({
    where: { programId, academicYearId },
    include: { feeComponent: true },
    orderBy: { feeComponent: { sortOrder: "asc" } },
  });
  return NextResponse.json(structures);
}

// Bulk save fee structure for a program + academic year
export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body: { programId: string; academicYearId: string; fees: { feeComponentId: string; amount: number; notes?: string }[] } = await req.json();

  // Verify tenant ownership of program and academic year
  const program = await prisma.program.findFirst({ where: { id: body.programId, tenantId: session.tenantId } });
  if (!program) return NextResponse.json({ error: "Program tidak ditemukan" }, { status: 404 });
  const year = await prisma.academicYear.findFirst({ where: { id: body.academicYearId, tenantId: session.tenantId } });
  if (!year) return NextResponse.json({ error: "Tahun ajaran tidak ditemukan" }, { status: 404 });

  for (const fee of body.fees) {
    await prisma.programFeeStructure.upsert({
      where: {
        programId_academicYearId_feeComponentId: {
          programId: body.programId,
          academicYearId: body.academicYearId,
          feeComponentId: fee.feeComponentId,
        },
      },
      update: { amount: fee.amount, notes: fee.notes ?? null },
      create: {
        programId: body.programId,
        academicYearId: body.academicYearId,
        feeComponentId: fee.feeComponentId,
        amount: fee.amount,
        notes: fee.notes ?? null,
      },
    });
  }

  revalidatePath("/api/fee-structure");
  return NextResponse.json({ ok: true });
}
