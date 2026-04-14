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
  if (admission.status !== "ADMITTED" && admission.status !== "VISITED") {
    return NextResponse.json({ error: "Hanya pendaftaran dengan status ADMITTED atau VISITED yang bisa dikonversi" }, { status: 400 });
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

  // Create parent record and link to student
  const parentEmail = admission.parentEmail?.trim() || null;
  let parent;
  if (parentEmail) {
    parent = await prisma.parent.upsert({
      where: { tenantId_email: { tenantId: session.tenantId, email: parentEmail } },
      create: {
        tenantId: session.tenantId,
        name: admission.parentName,
        email: parentEmail,
        phone: admission.parentPhone,
        whatsapp: admission.parentWhatsapp,
      },
      update: {
        name: admission.parentName,
        phone: admission.parentPhone,
        whatsapp: admission.parentWhatsapp,
      },
    });
  } else {
    parent = await prisma.parent.create({
      data: {
        tenantId: session.tenantId,
        name: admission.parentName,
        phone: admission.parentPhone,
        whatsapp: admission.parentWhatsapp,
      },
    });
  }
  await prisma.studentGuardian.create({
    data: {
      studentId: student.id,
      parentId: parent.id,
      relationship: "WALI",
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
