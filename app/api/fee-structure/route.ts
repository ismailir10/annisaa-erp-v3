import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

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
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body: { programId: string; academicYearId: string; fees: { feeComponentId: string; amount: number; notes?: string }[] } = await req.json();

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

  return NextResponse.json({ ok: true });
}
