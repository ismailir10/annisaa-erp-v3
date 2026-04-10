import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: studentId } = await params;
  const { classSectionId } = await req.json();

  if (!classSectionId) {
    return NextResponse.json({ error: "Kelas wajib dipilih" }, { status: 400 });
  }

  // Verify student belongs to tenant
  const student = await prisma.student.findFirst({ where: { id: studentId, tenantId: session.tenantId } });
  if (!student) return NextResponse.json({ error: "Siswa tidak ditemukan" }, { status: 404 });

  // Check capacity
  const section = await prisma.classSection.findUnique({
    where: { id: classSectionId },
    include: { _count: { select: { enrollments: { where: { status: "ACTIVE" } } } } },
  });
  if (!section) return NextResponse.json({ error: "Kelas tidak ditemukan" }, { status: 404 });

  const activeCount = section._count.enrollments;
  if (activeCount >= section.capacity) {
    return NextResponse.json({ error: `Kelas penuh (${activeCount}/${section.capacity})` }, { status: 400 });
  }

  const today = new Date().toISOString().split("T")[0];
  const enrollment = await prisma.studentEnrollment.create({
    data: { studentId, classSectionId, enrollDate: today },
  });

  return NextResponse.json(enrollment, { status: 201 });
}
