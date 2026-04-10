import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

/**
 * One-time setup: creates a GUARDIAN record for rightjet.hq@gmail.com
 * linked to the first student in the database.
 *
 * Call: POST /api/auth/setup-test-parent
 * Requires: SCHOOL_ADMIN session
 *
 * After creating the guardian, rightjet.hq@gmail.com can log in via
 * Google OAuth and the auth system will auto-create a GUARDIAN user.
 */
export async function POST() {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const email = "rightjet.hq@gmail.com";

  // Check if guardian already exists
  const existing = await prisma.guardian.findFirst({ where: { email } });
  if (existing) {
    return NextResponse.json({ message: "Guardian already exists", guardianId: existing.id });
  }

  // Find first student
  const student = await prisma.student.findFirst({
    where: { tenantId: session.tenantId },
    orderBy: { createdAt: "desc" },
  });
  if (!student) {
    return NextResponse.json({ error: "No students found" }, { status: 404 });
  }

  const guardian = await prisma.guardian.create({
    data: {
      name: "Test Parent (RightJet)",
      email,
      phone: "081234567890",
      relationship: "PARENT",
      student: { connect: { id: student.id } },
    },
  });

  return NextResponse.json({
    message: `Guardian created for ${student.name}`,
    guardianId: guardian.id,
    studentName: student.name,
  });
}
