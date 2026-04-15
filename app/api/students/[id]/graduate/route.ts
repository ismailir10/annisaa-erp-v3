import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { success } = rateLimit(`graduate-student:${getClientIp(req)}`, 5, 60_000);
  if (!success) return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });

  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: studentId } = await params;
  const body = await req.json().catch(() => ({}));
  const { graduationDate } = body as { graduationDate?: string };

  // Verify student belongs to tenant
  const student = await prisma.student.findFirst({
    where: { id: studentId, tenantId: session.tenantId },
  });
  if (!student) {
    return NextResponse.json({ error: "Siswa tidak ditemukan" }, { status: 404 });
  }

  if (student.status === "GRADUATED") {
    return NextResponse.json({ error: "Siswa sudah lulus" }, { status: 400 });
  }

  // Verify student has at least one ACTIVE enrollment
  const activeEnrollments = await prisma.studentEnrollment.findMany({
    where: { studentId, status: "ACTIVE" },
  });
  if (activeEnrollments.length === 0) {
    return NextResponse.json({ error: "Siswa tidak memiliki enrollment aktif" }, { status: 400 });
  }

  const effectiveDate = graduationDate || new Date().toISOString().split("T")[0];

  // Transaction: update student status + graduate all active enrollments
  const updatedStudent = await prisma.$transaction(async (tx) => {
    const updated = await tx.student.update({
      where: { id: studentId },
      data: {
        status: "GRADUATED",
        graduationDate: effectiveDate,
      },
    });

    await tx.studentEnrollment.updateMany({
      where: { studentId, status: "ACTIVE" },
      data: { status: "GRADUATED" },
    });

    return updated;
  });

  return NextResponse.json(updatedStudent);
}
