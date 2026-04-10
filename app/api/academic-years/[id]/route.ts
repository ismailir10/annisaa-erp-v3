import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  // Verify tenant ownership
  const existing = await prisma.academicYear.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!existing) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 });

  const body = await req.json();
  const year = await prisma.academicYear.update({
    where: { id },
    data: {
      name: body.name?.trim(),
      startDate: body.startDate,
      endDate: body.endDate,
      status: body.status,
    },
  });
  return NextResponse.json(year);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  // Verify tenant ownership
  const existing = await prisma.academicYear.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!existing) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 });

  // Check for dependent class sections
  const sectionCount = await prisma.classSection.count({ where: { academicYearId: id } });
  if (sectionCount > 0) {
    return NextResponse.json({ error: `Tidak bisa dihapus: ${sectionCount} kelas terkait` }, { status: 400 });
  }

  await prisma.academicYear.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
