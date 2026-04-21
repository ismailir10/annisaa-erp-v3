import { NextResponse } from "next/server";
import { getSession, isAdminRole, type SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * Admin guard for Student Journal routes.
 *
 * Returns `{ session }` when the caller is authenticated AND carries an admin
 * role (SUPER_ADMIN or SCHOOL_ADMIN) AND has a tenantId. Otherwise returns
 * `{ error: NextResponse }` ready to be returned from the handler.
 *
 * Using `isAdminRole()` (not `session.role === "SCHOOL_ADMIN"`) — the
 * latter pattern caused a bug during the student CRUD cycle where
 * SUPER_ADMIN users were denied their own tenant's data.
 */
export async function requireAdmin(): Promise<
  | { session: SessionUser & { tenantId: string }; error?: undefined }
  | { session?: undefined; error: NextResponse }
> {
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!isAdminRole(session.role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  if (!session.tenantId) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session: session as SessionUser & { tenantId: string } };
}

/**
 * Teacher guard for Student Journal class routes.
 *
 * Returns `{ session }` when:
 * - Caller is authenticated with role TEACHER
 * - Has a tenantId
 * - Has an active TeachingAssignment for the given classSectionId
 *
 * NOTE: TeachingAssignment has no `status` field — existence of the row
 * means the assignment is active. Cross-tenant safety is enforced by
 * checking classSection.tenantId = session.tenantId.
 */
export async function requireTeacherForClass(classSectionId: string): Promise<
  | { session: SessionUser & { tenantId: string; employeeId: string }; error?: undefined }
  | { session?: undefined; error: NextResponse }
> {
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (session.role !== "TEACHER") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  if (!session.tenantId) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  if (!session.employeeId) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  // Verify the teacher is assigned to this class AND the class belongs to their tenant
  const assignment = await prisma.teachingAssignment.findFirst({
    where: {
      employeeId: session.employeeId,
      classSectionId,
      classSection: { tenantId: session.tenantId },
    },
  });

  if (!assignment) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return {
    session: session as SessionUser & { tenantId: string; employeeId: string },
  };
}

/**
 * Guardian guard for Student Journal parent routes.
 *
 * Returns `{ session }` when:
 * - Caller is authenticated with role GUARDIAN
 * - Has a tenantId
 * - Has an active StudentGuardian row linking the caller's Parent record to studentId
 *
 * Relation chain: session.id → User.parentId → Parent.id → StudentGuardian.parentId
 */
export async function requireGuardianForStudent(studentId: string): Promise<
  | { session: SessionUser & { tenantId: string }; error?: undefined }
  | { session?: undefined; error: NextResponse }
> {
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (session.role !== "GUARDIAN") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  if (!session.tenantId) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  // Look up the Parent record for this user via User.parentId
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { parentId: true },
  });
  if (!user?.parentId) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  const link = await prisma.studentGuardian.findFirst({
    where: {
      studentId,
      parentId: user.parentId,
      status: "ACTIVE",
    },
  });
  if (!link) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { session: session as SessionUser & { tenantId: string } };
}
