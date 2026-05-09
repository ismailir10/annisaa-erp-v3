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

// DELETE — Playwright cleanup helper. Hard-deletes the Admission row
// AND its ACCEPTED side-effect bundle (Student + Household + Guardian +
// StudentGuardian) in dependency order so the spec doesn't pollute
// downstream specs (e.g. admin students cold-empty-state assertion).
//
// Demo-only; admin scope. No-op if the rows are already gone.

export async function DELETE(
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

  // Re-use the read scope check — if you can read it via this route, you
  // can wipe it (admin/principal/kadiv/admission_officer only).
  try {
    assertScope(session, admissionPolicy, "read");
  } catch {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { id } = await params;

  const admission = await prisma.admission.findFirst({
    where: { id, tenantId: session.tenantId },
    select: { id: true, acceptedStudentId: true },
  });
  if (!admission) {
    return NextResponse.json({ ok: true, deleted: false });
  }

  // Resolve dependent ids in dependency-safe order before delete.
  const student = admission.acceptedStudentId
    ? await prisma.student.findFirst({
        where: { id: admission.acceptedStudentId, tenantId: session.tenantId },
        select: { id: true, householdId: true },
      })
    : null;

  const sgRows = student
    ? await prisma.studentGuardian.findMany({
        where: { studentId: student.id, tenantId: session.tenantId },
        select: { id: true, guardianId: true },
      })
    : [];

  await prisma.$transaction(async (tx) => {
    // Null the FK first to break the SET NULL composite reference cleanly.
    await tx.admission.update({
      where: { id: admission.id },
      data: { acceptedStudentId: null },
    });
    if (sgRows.length > 0) {
      await tx.studentGuardian.deleteMany({
        where: { id: { in: sgRows.map((r) => r.id) } },
      });
      await tx.guardian.deleteMany({
        where: {
          id: { in: sgRows.map((r) => r.guardianId) },
          tenantId: session.tenantId,
        },
      });
    }
    if (student) {
      await tx.student.delete({ where: { id: student.id } });
      await tx.household.delete({ where: { id: student.householdId } });
    }
    await tx.admission.delete({ where: { id: admission.id } });
  });

  return NextResponse.json({ ok: true, deleted: true });
}
