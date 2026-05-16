import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";

// Convert admission to student record
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const admission = await prisma.admission.findUnique({ where: { id } });
  if (!admission || admission.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (admission.studentId) {
    console.error(
      `[admin-admissions CONVERT] already converted id=${id} studentId=${admission.studentId}`,
    );
    return NextResponse.json({ error: "Pendaftaran ini sudah dikonversi menjadi siswa" }, { status: 400 });
  }
  if (admission.status !== "ADMITTED") {
    console.error(
      `[admin-admissions CONVERT] wrong status id=${id} status=${admission.status} (expected ADMITTED)`,
    );
    return NextResponse.json({ error: "Hanya pendaftaran dengan status ADMITTED yang bisa dikonversi" }, { status: 400 });
  }

  // Atomic conversion: student + parent + guardian + admission update
  const { student } = await prisma.$transaction(async (tx) => {
    const student = await tx.student.create({
      data: {
        tenantId: session.tenantId!,
        name: admission.childName,
        dateOfBirth: admission.dateOfBirth,
        gender: admission.childGender,
        notes: admission.notes,
      },
    });

    const parentEmail = admission.parentEmail?.trim() || null;
    let parent;
    if (parentEmail) {
      parent = await tx.parent.upsert({
        where: { tenantId_email: { tenantId: session.tenantId!, email: parentEmail } },
        create: {
          tenantId: session.tenantId!,
          name: admission.parentName,
          email: parentEmail,
          phone: admission.parentPhone,
          whatsapp: admission.parentWhatsapp,
          education: admission.parentEducation,
          occupation: admission.parentOccupation,
          incomeRange: admission.parentIncome,
        },
        update: {
          name: admission.parentName,
          phone: admission.parentPhone,
          whatsapp: admission.parentWhatsapp,
          education: admission.parentEducation,
          occupation: admission.parentOccupation,
          incomeRange: admission.parentIncome,
        },
      });
    } else {
      parent = await tx.parent.create({
        data: {
          tenantId: session.tenantId!,
          name: admission.parentName,
          phone: admission.parentPhone,
          whatsapp: admission.parentWhatsapp,
          education: admission.parentEducation,
          occupation: admission.parentOccupation,
          incomeRange: admission.parentIncome,
        },
      });
    }

    await tx.studentGuardian.create({
      data: {
        studentId: student.id,
        parentId: parent.id,
        relationship: "WALI",
        isPrimary: true,
      },
    });

    await tx.admission.update({
      where: { id },
      data: { studentId: student.id },
    });

    return { student };
  });

  return NextResponse.json({ student, message: "Siswa berhasil dibuat dari data pendaftaran" });
}
