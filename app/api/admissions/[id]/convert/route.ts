import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

// Convert admission to student record
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const admission = await prisma.admission.findUnique({ where: { id } });
  if (!admission || admission.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (admission.studentId) {
    return NextResponse.json({ error: "Pendaftaran ini sudah dikonversi menjadi siswa" }, { status: 400 });
  }

  // Create student from admission data
  const student = await prisma.student.create({
    data: {
      tenantId: session.tenantId,
      name: admission.childName,
      dateOfBirth: admission.dateOfBirth,
      gender: admission.childGender,
    },
  });

  // Create primary guardian
  await prisma.guardian.create({
    data: {
      studentId: student.id,
      name: admission.parentName,
      relationship: "WALI",
      phone: admission.parentPhone,
      email: admission.parentEmail,
      whatsapp: admission.parentWhatsapp,
      isPrimary: true,
    },
  });

  // Link admission to student and update status
  await prisma.admission.update({
    where: { id },
    data: { studentId: student.id, status: "ADMITTED" },
  });

  return NextResponse.json({ student, message: "Siswa berhasil dibuat dari data pendaftaran" });
}
