// Demo-mode introspection helper for the Playwright admin walk-through
// (e2e/admission-admin.spec.ts). Returns the side-effect rows created by
// the ACCEPTED bundle (Household + Student + Guardians + StudentGuardian
// links) so the spec can assert state without crafting per-table queries
// inline.
//
// Production guard: returns 404 unless DEMO_MODE === 'true'. Mirrors
// app/api/demo/guardian + app/api/demo/login posture (404 not 403 to avoid
// fingerprinting the demo gate).
//
// Auth: standard demo session cookie via getSession. No bypass — only
// admin/principal/kadiv/admission_officer (with Admission read scope) can
// read; parent role hits FORBIDDEN.
//
// Cycle: docs/cycles/2026-05-10-p2-admission-funnel-ui-review.md (T10)

import { NextResponse, type NextRequest } from "next/server";

import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { admissionPolicy } from "@/lib/entities/admission/policy";
import { assertScope } from "@/lib/scaffold/server-action";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (process.env.DEMO_MODE !== "true") {
    return new NextResponse(null, { status: 404 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  try {
    assertScope(session, admissionPolicy, "read");
  } catch {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { id } = await params;

  const admission = await prisma.admission.findFirst({
    where: { id, tenantId: session.tenantId },
    select: {
      id: true,
      status: true,
      acceptedStudentId: true,
      siblingDetectedFromHouseholdId: true,
    },
  });
  if (!admission) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  // Resolve the resulting bundle (only populated after ACCEPTED commits).
  const student = admission.acceptedStudentId
    ? await prisma.student.findFirst({
        where: { id: admission.acceptedStudentId, tenantId: session.tenantId },
        select: { id: true, fullName: true, householdId: true },
      })
    : null;

  const household = student
    ? await prisma.household.findFirst({
        where: { id: student.householdId, tenantId: session.tenantId },
        select: { id: true, code: true, addressId: true },
      })
    : null;

  const studentGuardians = student
    ? await prisma.studentGuardian.findMany({
        where: {
          studentId: student.id,
          tenantId: session.tenantId,
          deletedAt: null,
        },
        select: { id: true, guardianId: true, relationship: true, isPrimary: true },
      })
    : [];

  // PII scrub: surface fullName + relationship counts only — NIK + phone
  // intentionally NOT exposed even via demo route. This is a Playwright
  // assertion target, not a data viewer.
  const guardians = studentGuardians.length > 0
    ? await prisma.guardian.findMany({
        where: {
          id: { in: studentGuardians.map((sg) => sg.guardianId) },
          tenantId: session.tenantId,
        },
        select: { id: true, fullName: true },
      })
    : [];

  return NextResponse.json({
    admission: {
      id: admission.id,
      status: admission.status,
      acceptedStudentId: admission.acceptedStudentId,
      siblingDetectedFromHouseholdId: admission.siblingDetectedFromHouseholdId,
    },
    household,
    student,
    guardians,
    studentGuardians,
  });
}
