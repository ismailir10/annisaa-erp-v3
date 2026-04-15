import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

/**
 * One-time setup: creates a Parent record for rightjet.hq@gmail.com
 * linked to the first student in the database via StudentGuardian.
 *
 * Call: POST /api/auth/setup-test-parent
 * Requires: SCHOOL_ADMIN session
 *
 * After creating the parent, rightjet.hq@gmail.com can log in via
 * Google OAuth and the auth system will auto-create a GUARDIAN user.
 */
export async function POST() {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const email = "rightjet.hq@gmail.com";

  // Check if parent already exists
  const existing = await prisma.parent.findFirst({ where: { email } });
  if (existing) {
    return NextResponse.json({ message: "Parent already exists", parentId: existing.id });
  }

  // Find first student
  const student = await prisma.student.findFirst({
    where: { tenantId: session.tenantId },
    orderBy: { createdAt: "desc" },
  });
  if (!student) {
    return NextResponse.json({ error: "No students found" }, { status: 404 });
  }

  const parent = await prisma.parent.create({
    data: {
      tenantId: session.tenantId,
      name: "Test Parent (RightJet)",
      email,
      phone: "081234567890",
    },
  });

  await prisma.studentGuardian.upsert({
    where: { studentId_parentId: { studentId: student.id, parentId: parent.id } },
    create: { studentId: student.id, parentId: parent.id, relationship: "PARENT", isPrimary: true },
    update: {},
  });

  return NextResponse.json({
    message: `Parent created for ${student.name}`,
    parentId: parent.id,
    studentName: student.name,
  });
}
